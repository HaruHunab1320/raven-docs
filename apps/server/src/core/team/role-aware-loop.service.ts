import { Injectable, Logger } from '@nestjs/common';
import { AIService } from '../../integrations/ai/ai.service';
import { MCPService } from '../../integrations/mcp/mcp.service';
import { AgentMemoryService } from '../agent-memory/agent-memory.service';
import { ContextAssemblyService } from '../context-assembly/context-assembly.service';
import { UserRepo } from '@raven-docs/db/repos/user/user.repo';
import { WorkspaceRepo } from '@raven-docs/db/repos/workspace/workspace.repo';
import { TeamDeploymentRepo } from '../../database/repos/team/team-deployment.repo';
import { User } from '@raven-docs/db/types/entity.types';

interface RoleLoopInput {
  teamAgentId: string;
  workspaceId: string;
  spaceId: string;
  agentUserId: string;
  role: string;
  systemPrompt: string;
  capabilities: string[];
  stepId?: string;
  stepContext?: { name: string; task: string };
}

interface RoleLoopResult {
  summary: string;
  actionsExecuted: number;
  errorsEncountered: number;
  actions: Array<{
    method: string;
    status: 'executed' | 'failed' | 'skipped';
    error?: string;
  }>;
}

@Injectable()
export class RoleAwareLoopService {
  private readonly logger = new Logger(RoleAwareLoopService.name);

  constructor(
    private readonly aiService: AIService,
    private readonly mcpService: MCPService,
    private readonly memoryService: AgentMemoryService,
    private readonly contextAssembly: ContextAssemblyService,
    private readonly userRepo: UserRepo,
    private readonly workspaceRepo: WorkspaceRepo,
    private readonly teamRepo: TeamDeploymentRepo,
  ) {}

  private getAgentModel() {
    return (
      process.env.GEMINI_AGENT_MODEL || 'gemini-3-pro-preview'
    );
  }

  async runRoleLoop(input: RoleLoopInput): Promise<RoleLoopResult> {
    const { workspaceId, spaceId, agentUserId, role, systemPrompt, capabilities } =
      input;

    // Get the user entity for MCP calls
    const user = await this.userRepo.findById(agentUserId, workspaceId);
    if (!user) {
      return {
        summary: 'Agent user not found',
        actionsExecuted: 0,
        errorsEncountered: 1,
        actions: [],
      };
    }

    // Gather context relevant to the agent's role
    const roleContext = await this.buildRoleContext(
      role,
      workspaceId,
      spaceId,
    );

    // Build the full prompt
    const prompt = this.buildPrompt(
      role,
      systemPrompt,
      capabilities,
      roleContext,
      input.stepContext,
    );

    // Call AI to plan actions
    let plan = { summary: 'No actions proposed.', actions: [] as any[] };
    try {
      const apiKey =
        process.env.GEMINI_API_KEY ||
        process.env.GOOGLE_API_KEY ||
        process.env.GOOGLE_GENERATIVE_AI_API_KEY;

      if (!apiKey) {
        return {
          summary: 'No AI API key configured',
          actionsExecuted: 0,
          errorsEncountered: 1,
          actions: [],
        };
      }

      const response = await this.aiService.generateContent({
        model: this.getAgentModel(),
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });

      const text =
        response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const parsed = this.extractJson(text);
      if (parsed?.summary) {
        plan = parsed;
      }
    } catch (error: any) {
      this.logger.warn(
        `AI planning failed for ${role}: ${error?.message}`,
      );
      return {
        summary: `AI planning failed: ${error?.message}`,
        actionsExecuted: 0,
        errorsEncountered: 1,
        actions: [],
      };
    }

    // Execute planned actions (max 3 per loop)
    const actions = Array.isArray(plan.actions)
      ? plan.actions.slice(0, 3)
      : [];
    const results: RoleLoopResult['actions'] = [];
    let actionsExecuted = 0;
    let errorsEncountered = 0;

    for (const action of actions) {
      if (!action?.method) continue;

      // Validate capability
      const resource = action.method.split('.')[0];
      const hasCapability = capabilities.some(
        (cap) =>
          cap === action.method ||
          cap === `${resource}.*` ||
          cap === '*',
      );

      if (!hasCapability) {
        results.push({
          method: action.method,
          status: 'skipped',
          error: `Not in agent capabilities: ${capabilities.join(', ')}`,
        });
        continue;
      }

      try {
        const params = {
          ...action.params,
          workspaceId,
          spaceId,
        };

        await this.mcpService.processRequest(
          {
            jsonrpc: '2.0',
            method: action.method,
            params,
            id: Date.now(),
          },
          user as User,
        );

        results.push({ method: action.method, status: 'executed' });
        actionsExecuted++;
      } catch (error: any) {
        results.push({
          method: action.method,
          status: 'failed',
          error: error?.message || 'Unknown error',
        });
        errorsEncountered++;
      }
    }

    // Store execution in memory
    try {
      await this.memoryService.ingestMemory({
        workspaceId,
        spaceId,
        creatorId: agentUserId,
        source: `team-agent.${role}`,
        summary: `Team agent (${role}) loop: ${plan.summary}`,
        tags: ['team-agent', role, 'loop'],
        content: {
          role,
          summary: plan.summary,
          actionsPlanned: actions.length,
          actionsExecuted,
          errorsEncountered,
          results,
        },
      });
    } catch {
      // Memory ingestion should not block
    }

    return {
      summary: plan.summary,
      actionsExecuted,
      errorsEncountered,
      actions: results,
    };
  }

  private async buildRoleContext(
    role: string,
    workspaceId: string,
    spaceId: string,
  ): Promise<string> {
    const sections: string[] = [];

    try {
      // Get recent unassigned tasks for the space
      const tasks = await this.mcpService.processRequest(
        {
          jsonrpc: '2.0',
          method: 'task.list',
          params: {
            spaceId,
            workspaceId,
            status: 'todo',
            limit: 10,
          },
          id: Date.now(),
        },
        { id: 'system' } as any,
      );

      if (tasks.result?.tasks?.length) {
        sections.push(
          `Open tasks:\n${tasks.result.tasks
            .map(
              (t: any) =>
                `- [${t.status}] ${t.title}${t.assigneeId ? ' (assigned)' : ' (unassigned)'}`,
            )
            .join('\n')}`,
        );
      }
    } catch {
      // Task listing may fail
    }

    // Role-specific context
    if (role === 'collaborator' || role === 'synthesizer') {
      try {
        const bundle = await this.contextAssembly.assembleContext(
          'recent research progress',
          workspaceId,
          spaceId,
        );
        if (bundle.timeline.length > 0) {
          sections.push(
            `Recent activity:\n${bundle.timeline
              .slice(0, 5)
              .map((t) => `- ${t.title} (${t.pageType || 'page'})`)
              .join('\n')}`,
          );
        }
        if (bundle.currentState) {
          const s = bundle.currentState;
          sections.push(
            `Hypothesis scoreboard: ${s.validated.length} validated, ${s.testing.length} testing, ${s.refuted.length} refuted, ${s.open.length} open`,
          );
        }
        if (bundle.contradictions.length > 0) {
          sections.push(
            `Contradictions detected: ${bundle.contradictions.length}`,
          );
        }
      } catch {
        // Context assembly may fail
      }
    }

    return sections.join('\n\n');
  }

  private buildPrompt(
    role: string,
    systemPrompt: string,
    capabilities: string[],
    roleContext: string,
    stepContext?: { name: string; task: string },
  ): string {
    const parts = [
      systemPrompt,
      '',
      `Your role: ${role}`,
      `Available actions (MCP methods you can call): ${capabilities.join(', ')}`,
    ];

    if (stepContext) {
      parts.push('');
      parts.push(`Current workflow step: ${stepContext.name}`);
      parts.push(`Task: ${stepContext.task}`);
    }

    parts.push(
      '',
      roleContext ? `Current state:\n${roleContext}` : '',
      '',
      `Generate a concise JSON plan with actionable next steps.`,
      `Return ONLY JSON: { "summary": "...", "actions": [{ "method": "...", "params": {...}, "rationale": "..." }] }`,
      `Only include up to 3 actions that are safe, helpful, and within your capabilities.`,
      `If there's nothing useful to do right now, return { "summary": "No actions needed", "actions": [] }`,
    );

    return parts.filter(Boolean).join('\n');
  }

  private extractJson(text: string): any {
    try {
      // Try direct parse
      return JSON.parse(text);
    } catch {
      // Try extracting from markdown code block
      const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) {
        try {
          return JSON.parse(match[1]);
        } catch {
          return null;
        }
      }

      // Try finding JSON object
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch {
          return null;
        }
      }

      return null;
    }
  }
}
