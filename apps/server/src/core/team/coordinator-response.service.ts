import { Injectable, Logger } from '@nestjs/common';
import { TeamDeploymentRepo } from '../../database/repos/team/team-deployment.repo';
import { AgentExecutionService } from '../coding-swarm/agent-execution.service';
import { AIService } from '../../integrations/ai/ai.service';

export interface CoordinatorResponseRequest {
  teamAgentId: string;
  deploymentId: string;
  runtimeSessionId: string;
  promptInfo: { type?: string; prompt?: string; options?: string[]; suggestedResponse?: string };
  recentOutput?: string;
}

export interface CoordinatorResponseResult {
  responded: boolean;
  response?: string;
  error?: string;
}

@Injectable()
export class CoordinatorResponseService {
  private readonly logger = new Logger(CoordinatorResponseService.name);
  private readonly activeHandles = new Set<string>();

  constructor(
    private readonly teamRepo: TeamDeploymentRepo,
    private readonly agentExecution: AgentExecutionService,
    private readonly aiService: AIService,
  ) {}

  async handleBlockedAgent(request: CoordinatorResponseRequest): Promise<CoordinatorResponseResult> {
    const { teamAgentId, deploymentId, runtimeSessionId } = request;

    // Concurrency guard: prevent duplicate responses to the same session
    if (this.activeHandles.has(runtimeSessionId)) {
      return { responded: false, error: 'already_handling' };
    }
    this.activeHandles.add(runtimeSessionId);

    try {
      // Parallelize independent queries
      const [blockedAgent, agents] = await Promise.all([
        this.teamRepo.findAgentById(teamAgentId),
        this.teamRepo.getAgentsByDeployment(deploymentId),
      ]);

      if (!blockedAgent) {
        return { responded: false, error: 'agent_not_found' };
      }

      if (!blockedAgent.reportsToAgentId) {
        this.logger.warn(
          `Agent ${teamAgentId} has no reportsToAgentId — cannot escalate (coordinator itself is blocked)`,
        );
        return { responded: false, error: 'no_coordinator' };
      }

      // Find coordinator from already-loaded agents list (avoid sequential chain walk)
      const coordinator = agents.find((a) => !a.reportsToAgentId);
      if (!coordinator) {
        return { responded: false, error: 'coordinator_chain_broken' };
      }

      // Build org chart — pre-index for O(1) lookup
      const agentById = new Map(agents.map((a) => [a.id, a]));
      const orgLines = agents.map(
        (a) =>
          `- ${a.role}${a.reportsToAgentId ? ` (reports to ${agentById.get(a.reportsToAgentId)?.role || 'unknown'})` : ' (coordinator)'}`,
      );

      const model = this.aiService.getFastModel();
      const promptText = request.promptInfo?.prompt || request.promptInfo?.suggestedResponse || 'Unknown prompt';
      const optionsText = request.promptInfo?.options?.length
        ? `Available options: ${request.promptInfo.options.join(', ')}`
        : '';
      const recentOutput = (request.recentOutput || '').slice(-500);

      const aiPrompt = [
        'You are the team coordinator. A sub-agent is blocked and needs your guidance.',
        '',
        '## Your Coordinator Persona',
        coordinator.systemPrompt || 'You manage and coordinate the team.',
        '',
        '## Org Chart',
        ...orgLines,
        '',
        '## Blocked Agent',
        `Role: ${blockedAgent.role}`,
        `Prompt/Question: ${promptText}`,
        optionsText,
        '',
        recentOutput ? `## Recent Output (last 500 chars)\n${recentOutput}` : '',
        '',
        'Respond with ONLY the text that should be sent to the blocked agent to unblock it.',
        'If the prompt is dangerous or you should not respond, reply with exactly: SKIP',
      ].filter(Boolean).join('\n');

      const response = await this.aiService.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: aiPrompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 512 },
      });

      const text = (response?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();

      if (!text || text === 'SKIP') {
        this.activeHandles.delete(runtimeSessionId);
        this.logger.log(`Coordinator chose to SKIP prompt for agent ${teamAgentId}`);
        return { responded: false, error: 'coordinator_skipped' };
      }

      // Send the response to the blocked session — release the guard
      // immediately after so the next blocking prompt can be handled.
      await this.agentExecution.send(runtimeSessionId, text);
      this.activeHandles.delete(runtimeSessionId);

      this.logger.log(
        `Coordinator responded to blocked agent ${teamAgentId} (session=${runtimeSessionId}): ${text.slice(0, 100)}...`,
      );

      // Log the decision (best-effort, guard already released)
      try {
        await this.teamRepo.appendRunLog(deploymentId, {
          id: `${Date.now()}-coordinator-response`,
          timestamp: new Date().toISOString(),
          deploymentId,
          teamAgentId,
          role: blockedAgent.role,
          stepId: blockedAgent.currentStepId || undefined,
          summary: `Coordinator responded to blocking prompt: "${promptText.slice(0, 80)}" → "${text.slice(0, 80)}"`,
          actionsExecuted: 1,
          errorsEncountered: 0,
          actions: [{ method: 'coordinator.respond_to_prompt', status: 'executed' }],
        });
      } catch {
        // best-effort log
      }

      return { responded: true, response: text };
    } catch (error: any) {
      this.activeHandles.delete(runtimeSessionId);
      this.logger.error(`Coordinator response failed for ${teamAgentId}: ${error?.message}`, error?.stack);
      return { responded: false, error: error?.message || 'unknown' };
    }
  }

}
