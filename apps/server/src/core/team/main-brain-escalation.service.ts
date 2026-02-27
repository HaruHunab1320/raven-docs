import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TeamDeploymentRepo } from '../../database/repos/team/team-deployment.repo';
import { AgentExecutionService } from '../coding-swarm/agent-execution.service';
import { AIService } from '../../integrations/ai/ai.service';

export interface MainBrainEscalationRequest {
  teamAgentId: string;
  deploymentId: string;
  runtimeSessionId: string;
  promptInfo: { type?: string; prompt?: string; options?: string[]; suggestedResponse?: string };
}

export interface MainBrainEscalationResult {
  responded: boolean;
  surfacedToUser: boolean;
  response?: string;
  error?: string;
}

@Injectable()
export class MainBrainEscalationService {
  private readonly logger = new Logger(MainBrainEscalationService.name);
  private readonly activeHandles = new Set<string>();

  constructor(
    private readonly teamRepo: TeamDeploymentRepo,
    private readonly agentExecution: AgentExecutionService,
    private readonly aiService: AIService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async handleCoordinatorBlocked(
    request: MainBrainEscalationRequest,
  ): Promise<MainBrainEscalationResult> {
    const { teamAgentId, deploymentId, runtimeSessionId } = request;

    if (this.activeHandles.has(runtimeSessionId)) {
      return { responded: false, surfacedToUser: false, error: 'already_handling' };
    }
    this.activeHandles.add(runtimeSessionId);

    try {
      // Parallelize all independent queries
      const [coordinator, deployment, agents, stateRow] = await Promise.all([
        this.teamRepo.findAgentById(teamAgentId),
        this.teamRepo.findById(deploymentId),
        this.teamRepo.getAgentsByDeployment(deploymentId),
        this.teamRepo.getWorkflowState(deploymentId).catch(() => null),
      ]);

      if (!coordinator) {
        return { responded: false, surfacedToUser: false, error: 'agent_not_found' };
      }
      if (!deployment) {
        return { responded: false, surfacedToUser: false, error: 'deployment_not_found' };
      }

      // Build org chart — pre-index for O(1) lookup
      const agentById = new Map(agents.map((a) => [a.id, a]));
      const orgLines = agents.map(
        (a) =>
          `- ${a.role} [status=${a.status || 'unknown'}]${a.reportsToAgentId ? ` (reports to ${agentById.get(a.reportsToAgentId)?.role || 'unknown'})` : ' (coordinator)'}`,
      );

      // Extract recent run logs from workflow state (already fetched in parallel)
      let recentLogsBlock = '';
      try {
        const state =
          typeof stateRow?.workflowState === 'string'
            ? JSON.parse(stateRow.workflowState)
            : (stateRow?.workflowState || {});
        const logs = Array.isArray(state.runLogs) ? state.runLogs : [];
        const lastFive = logs.slice(-5);
        if (lastFive.length) {
          recentLogsBlock = `## Recent Team Run Logs\n${lastFive.map((l: any) => `- [${l.role || 'system'}] ${l.summary || 'no summary'}`).join('\n')}`;
        }
      } catch {
        // best-effort
      }

      const promptText = request.promptInfo?.prompt || request.promptInfo?.suggestedResponse || 'Unknown prompt';
      const optionsText = request.promptInfo?.options?.length
        ? `Available options: ${request.promptInfo.options.join(', ')}`
        : '';

      const templateName = (deployment as any).templateName || (deployment as any).template?.name || 'Team';
      const goal = (deployment as any).config?.goal || (deployment as any).goal || '';

      const aiPrompt = [
        'You are the workspace-level Main Brain — the highest authority in this team deployment.',
        'The team coordinator is blocked and needs your executive decision to proceed.',
        '',
        '## Team Deployment',
        `Template: ${templateName}`,
        goal ? `Goal: ${goal}` : '',
        '',
        '## Coordinator (Blocked Agent)',
        `Role: ${coordinator.role}`,
        coordinator.systemPrompt ? `System Prompt: ${coordinator.systemPrompt}` : '',
        '',
        '## Org Chart',
        ...orgLines,
        '',
        recentLogsBlock,
        '',
        '## Blocking Prompt',
        `Prompt/Question: ${promptText}`,
        optionsText,
        '',
        'Respond with ONLY the text that should be sent to the coordinator to unblock it.',
        'If the prompt is dangerous, requires human judgment, or you cannot confidently answer, reply with exactly: SKIP',
      ]
        .filter(Boolean)
        .join('\n');

      const model = this.aiService.getFastModel();

      const response = await this.aiService.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: aiPrompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 512 },
      });

      const text = (response?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();

      if (!text || text === 'SKIP') {
        this.activeHandles.delete(runtimeSessionId);
        this.logger.log(`Main brain chose to SKIP — surfacing to user for coordinator ${teamAgentId}`);
        await this.surfaceToUser(request, deployment);
        return { responded: false, surfacedToUser: true, error: 'main_brain_skipped' };
      }

      // Send the response to unblock the coordinator — release the guard
      // immediately after so the next blocking prompt can be handled.
      await this.agentExecution.send(runtimeSessionId, text);
      this.activeHandles.delete(runtimeSessionId);

      this.logger.log(
        `Main brain responded to blocked coordinator ${teamAgentId} (session=${runtimeSessionId}): ${text.slice(0, 100)}...`,
      );

      // Log the decision (best-effort, guard already released)
      try {
        await this.teamRepo.appendRunLog(deploymentId, {
          id: `${Date.now()}-main-brain-escalation`,
          timestamp: new Date().toISOString(),
          deploymentId,
          teamAgentId,
          role: coordinator.role,
          stepId: coordinator.currentStepId || undefined,
          summary: `Main brain responded to coordinator blocking prompt: "${promptText.slice(0, 80)}" → "${text.slice(0, 80)}"`,
          actionsExecuted: 1,
          errorsEncountered: 0,
          actions: [{ method: 'main_brain.respond_to_coordinator', status: 'executed' }],
        });
      } catch {
        // best-effort log
      }

      return { responded: true, surfacedToUser: false, response: text };
    } catch (error: any) {
      this.activeHandles.delete(runtimeSessionId);
      this.logger.error(
        `Main brain escalation failed for coordinator ${teamAgentId}: ${error?.message}`,
        error?.stack,
      );

      // Surface to user on error as last resort
      try {
        const deployment = await this.teamRepo.findById(deploymentId);
        if (deployment) {
          await this.surfaceToUser(request, deployment);
        }
      } catch {
        // best-effort
      }

      return { responded: false, surfacedToUser: true, error: error?.message || 'unknown' };
    }
  }

  private async surfaceToUser(
    request: MainBrainEscalationRequest,
    deployment: any,
  ): Promise<void> {
    const promptText = request.promptInfo?.prompt || request.promptInfo?.suggestedResponse || 'Unknown prompt';

    this.eventEmitter.emit('team.escalation_surfaced_to_user', {
      deploymentId: request.deploymentId,
      teamAgentId: request.teamAgentId,
      runtimeSessionId: request.runtimeSessionId,
      promptInfo: request.promptInfo,
      workspaceId: deployment.workspaceId,
      spaceId: deployment.spaceId,
    });

    try {
      await this.teamRepo.appendRunLog(request.deploymentId, {
        id: `${Date.now()}-main-brain-surface`,
        timestamp: new Date().toISOString(),
        deploymentId: request.deploymentId,
        teamAgentId: request.teamAgentId,
        role: 'main-brain',
        summary: `Escalation surfaced to user — coordinator blocked: "${promptText.slice(0, 120)}"`,
        actionsExecuted: 0,
        errorsEncountered: 0,
        actions: [{ method: 'main_brain.surface_to_user', status: 'executed' }],
      });
    } catch {
      // best-effort log
    }
  }
}
