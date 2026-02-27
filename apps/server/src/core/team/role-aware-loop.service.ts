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
  targetTaskId?: string;
  targetExperimentId?: string;
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

const MCP_METHOD_ALIASES: Record<string, string> = {
  'context.query': 'intelligence.query',
};

function isValidMcpMethod(method: string): boolean {
  const trimmed = method.trim();
  // Must be exactly "resource.operation" using alphanumeric/underscore segments.
  return /^[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+$/.test(trimmed);
}

function isValidCapability(capability: string): boolean {
  const trimmed = capability.trim();
  return trimmed === '*' || /^[a-zA-Z0-9_]+\.\*$/.test(trimmed) || isValidMcpMethod(trimmed);
}

function isWriteMethod(method: string): boolean {
  const normalized = (MCP_METHOD_ALIASES[method] || method || '').trim();
  if (!normalized.includes('.')) return false;
  const operation = normalized.split('.')[1]?.toLowerCase() || '';
  return [
    'create',
    'update',
    'complete',
    'assign',
    'delete',
    'move',
    'register',
    'restore',
    'approve',
    'teardown',
    'deploy',
    'trigger',
    'start',
  ].includes(operation);
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
    return this.aiService.getSlowModel();
  }

  async runRoleLoop(input: RoleLoopInput): Promise<RoleLoopResult> {
    const { workspaceId, spaceId, agentUserId, role, systemPrompt, capabilities } =
      input;
    const toolCapabilities = (capabilities || []).filter((cap) =>
      isValidCapability(cap),
    );

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

    if (toolCapabilities.length === 0) {
      return {
        summary:
          'No valid MCP capabilities configured for this agent role. Update team template capabilities.',
        actionsExecuted: 0,
        errorsEncountered: 1,
        actions: [],
      };
    }

    if (input.targetTaskId) {
      const claimed = await this.teamRepo.claimTask(
        input.targetTaskId,
        agentUserId,
        workspaceId,
      );
      if (!claimed) {
        return {
          summary: `Target task ${input.targetTaskId} is not claimable`,
          actionsExecuted: 0,
          errorsEncountered: 0,
          actions: [],
        };
      }
    }

    // Gather context relevant to the agent's role
    const roleContext = await this.buildRoleContext(
      role,
      workspaceId,
      spaceId,
      user,
      input.targetTaskId,
      input.targetExperimentId,
    );

    // Build the full prompt
    const prompt = this.buildPrompt(
      role,
      systemPrompt,
      toolCapabilities,
      roleContext,
      input.stepContext,
      input.targetTaskId,
      input.targetExperimentId,
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
    const hasPlannedWrite = actions.some((a) =>
      a?.method ? isWriteMethod(String(a.method)) : false,
    );
    if (
      (input.targetTaskId || input.targetExperimentId) &&
      !hasPlannedWrite
    ) {
      const fallbackAction = this.buildWriteFallbackAction(
        role,
        input.targetTaskId,
        input.targetExperimentId,
        toolCapabilities,
      );
      if (fallbackAction) {
        actions.unshift(fallbackAction);
      } else {
        return {
          summary:
            'No write-capable action available for targeted run. Update team capabilities (e.g. experiment.update, task.create, page.create).',
          actionsExecuted: 0,
          errorsEncountered: 1,
          actions: [
            {
              method: 'team.targeted_write_guard',
              status: 'failed',
              error:
                'Targeted runs must include at least one write action, but this role has no write-capable methods configured.',
            },
          ],
        };
      }
    }
    const results: RoleLoopResult['actions'] = [];
    let actionsExecuted = 0;
    let errorsEncountered = 0;

    for (const action of actions) {
      if (!action?.method) continue;
      const rawMethod =
        typeof action.method === 'string' ? action.method.trim() : '';
      const method = MCP_METHOD_ALIASES[rawMethod] || rawMethod;

      if (!isValidMcpMethod(method)) {
        results.push({
          method: rawMethod || 'unknown',
          status: 'skipped',
          error: 'Invalid method format (expected "resource.operation")',
        });
        continue;
      }

      // Validate capability
      const resource = method.split('.')[0];
      const hasCapability = toolCapabilities.some(
        (cap) =>
          cap === action.method ||
          cap === method ||
          cap === `${resource}.*` ||
          cap === '*',
      );

      if (!hasCapability) {
        results.push({
          method,
          status: 'skipped',
          error: `Not in agent capabilities: ${toolCapabilities.join(', ')}`,
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
            method,
            params,
            id: Date.now(),
          },
          user as User,
        );

        results.push({ method, status: 'executed' });
        actionsExecuted++;
      } catch (error: any) {
        results.push({
          method,
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
    user: User,
    targetTaskId?: string,
    targetExperimentId?: string,
  ): Promise<string> {
    const sections: string[] = [];

    try {
      if (targetTaskId) {
        sections.push(`Target task ID: ${targetTaskId}`);
      } else if (targetExperimentId) {
        sections.push(`Target experiment ID: ${targetExperimentId}`);
      } else {
        // Get recent unassigned tasks for the space
        const tasks = await this.mcpService.processRequest(
          {
            jsonrpc: '2.0',
            method: 'task.list',
            params: {
              spaceId,
              workspaceId,
              status: ['todo'],
              limit: 10,
            },
            id: Date.now(),
          },
          user,
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
    targetTaskId?: string,
    targetExperimentId?: string,
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

    if (targetTaskId) {
      parts.push('');
      parts.push(`You are assigned to task ID: ${targetTaskId}`);
      parts.push(
        `Only execute actions that directly advance this task. Do not branch to unrelated tasks.`,
      );
      parts.push(
        `Include at least one WRITE action (e.g. task.update, page.create) unless impossible.`,
      );
    } else if (targetExperimentId) {
      parts.push('');
      parts.push(`You are assigned to experiment ID: ${targetExperimentId}`);
      parts.push(
        `Only execute actions that directly advance this experiment. Do not branch to unrelated tasks or experiments.`,
      );
      parts.push(
        `Include at least one WRITE action (e.g. experiment.update, experiment.complete, task.create, page.create) unless impossible.`,
      );
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

  private buildWriteFallbackAction(
    role: string,
    targetTaskId: string | undefined,
    targetExperimentId: string | undefined,
    capabilities: string[],
  ): { method: string; params: Record<string, any>; rationale: string } | null {
    const canUse = (method: string) => {
      const [resource] = method.split('.');
      return capabilities.includes('*') ||
        capabilities.includes(method) ||
        capabilities.includes(`${resource}.*`);
    };

    if (targetExperimentId && canUse('experiment.update')) {
      return {
        method: 'experiment.update',
        params: {
          pageId: targetExperimentId,
          status: 'running',
        },
        rationale: 'Record explicit progress heartbeat on the target experiment.',
      };
    }

    if (targetTaskId && canUse('task.update')) {
      return {
        method: 'task.update',
        params: {
          taskId: targetTaskId,
          status: 'in_progress',
        },
        rationale: 'Keep target task status aligned with active execution.',
      };
    }

    if (canUse('task.create')) {
      return {
        method: 'task.create',
        params: {
          title: `${role}: follow-up checkpoint`,
          description: targetExperimentId
            ? `Auto-generated progress checkpoint for experiment ${targetExperimentId}.`
            : targetTaskId
              ? `Auto-generated progress checkpoint for task ${targetTaskId}.`
              : 'Auto-generated progress checkpoint.',
        },
        rationale: 'Create a concrete follow-up artifact when no direct write action is proposed.',
      };
    }

    return null;
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
