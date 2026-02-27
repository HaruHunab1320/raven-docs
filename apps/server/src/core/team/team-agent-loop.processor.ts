import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { QueueName, QueueJob } from '../../integrations/queue/constants';
import { TeamAgentLoopJob } from './team-deployment.service';
import { TeamDeploymentRepo } from '../../database/repos/team/team-deployment.repo';
import { AgentExecutionService } from '../coding-swarm/agent-execution.service';
import { TerminalSessionService } from '../terminal/terminal-session.service';
import { WorkspacePreparationService } from '../coding-swarm/workspace-preparation.service';
import { WorkspaceRepo } from '@raven-docs/db/repos/workspace/workspace.repo';
import { UserService } from '../user/user.service';
import { resolveAgentSettings } from '../agent/agent-settings';
import { mapSwarmPermissionToApprovalPreset } from '../coding-swarm/swarm-permission-level';

@Processor(QueueName.TEAM_QUEUE)
export class TeamAgentLoopProcessor extends WorkerHost {
  private readonly logger = new Logger(TeamAgentLoopProcessor.name);
  private readonly agentTypeAliases: Record<string, string> = {
    'claude-code': 'claude',
    claudecode: 'claude',
    claude_code: 'claude',
    'gemini-cli': 'gemini',
    gemini_cli: 'gemini',
    'gpt-codex': 'codex',
    'openai-codex': 'codex',
  };

  constructor(
    private readonly teamRepo: TeamDeploymentRepo,
    private readonly eventEmitter: EventEmitter2,
    private readonly agentExecution: AgentExecutionService,
    private readonly terminalSessionService: TerminalSessionService,
    private readonly workspacePreparationService: WorkspacePreparationService,
    private readonly workspaceRepo: WorkspaceRepo,
    private readonly userService: UserService,
  ) {
    super();
  }

  async process(job: Job): Promise<any> {
    if (job.name !== QueueJob.TEAM_AGENT_LOOP) {
      return; // Let other processors handle non-team jobs
    }

    const data = job.data as TeamAgentLoopJob;
    const startedAt = Date.now();
    this.logger.log(
      `Running team agent loop: ${data.role} (agent=${data.teamAgentId})`,
    );

    try {
      // Mark agent as running
      await this.teamRepo.updateAgentStatus(data.teamAgentId, 'running');
      this.eventEmitter.emit('team.agent_loop.started', {
        deploymentId: data.deploymentId,
        teamAgentId: data.teamAgentId,
        role: data.role,
        stepId: data.stepId,
      });

      const runtimeSessionId = await this.ensureRuntimeSession(data);

      // Wait for the agent CLI to finish booting before sending the task.
      // Without this, task text gets typed into startup prompts/dialogs.
      try {
        await this.agentExecution.waitForReady(runtimeSessionId, 30_000);
        this.logger.log(`Agent session ready: ${runtimeSessionId}`);
      } catch (waitError: any) {
        this.logger.warn(
          `Session ${runtimeSessionId} did not become ready: ${waitError.message}; dispatching anyway`,
        );
      }

      // Post-ready settle: let trailing config prompt auto-responses (enter keys)
      // drain before we type the task. Without this, stray enter keys from the
      // adapter's config/trust dialog resolution race with our dispatch input.
      const settleMs = Number(process.env.TEAM_AGENT_READY_SETTLE_MS) || 1500;
      await new Promise((r) => setTimeout(r, settleMs));

      await this.dispatchRuntimeTask(runtimeSessionId, data);

      await this.teamRepo.updateAgentRunStats(data.teamAgentId, {
        lastRunAt: new Date(),
        lastRunSummary: `Dispatched runtime task to session ${runtimeSessionId}; waiting for runtime completion event.`,
        actionsExecuted: 0,
        errorsEncountered: 0,
      });

      try {
        await this.teamRepo.appendRunLog(data.deploymentId, {
          id: `${Date.now()}-${data.teamAgentId}`,
          timestamp: new Date().toISOString(),
          deploymentId: data.deploymentId,
          teamAgentId: data.teamAgentId,
          role: data.role,
          stepId: data.stepId,
          summary: `Runtime dispatch queued for session ${runtimeSessionId}`,
          actionsExecuted: 0,
          errorsEncountered: 0,
          actions: [{ method: 'runtime.dispatch', status: 'executed' }],
        });
      } catch {
        // Log persistence is best-effort and should not fail runs.
      }

      this.logger.log(
        `Team agent loop dispatched: ${data.role} -> ${runtimeSessionId}`,
      );

      return {
        status: 'dispatched',
        runtimeSessionId,
      };
    } catch (error: any) {
      this.logger.error(
        `Team agent loop failed: ${data.role} — ${error?.message}`,
        error?.stack,
      );

      // Clear currentStepId and mark agent as error
      if (data.stepId) {
        await this.teamRepo.updateAgentCurrentStep(data.teamAgentId, null);
      }
      await this.teamRepo.updateAgentStatus(data.teamAgentId, 'error');
      await this.teamRepo.updateAgentRunStats(data.teamAgentId, {
        lastRunAt: new Date(),
        lastRunSummary: `Error: ${error?.message || 'Unknown'}`,
        actionsExecuted: 0,
        errorsEncountered: 1,
      });
      try {
        await this.teamRepo.appendRunLog(data.deploymentId, {
          id: `${Date.now()}-${data.teamAgentId}`,
          timestamp: new Date().toISOString(),
          deploymentId: data.deploymentId,
          teamAgentId: data.teamAgentId,
          role: data.role,
          stepId: data.stepId,
          summary: `Loop failed after ${Date.now() - startedAt}ms`,
          actionsExecuted: 0,
          errorsEncountered: 1,
          actions: [
            {
              method: data.stepId || 'team.agent_loop',
              status: 'failed',
              error: error?.message || 'Unknown error',
            },
          ],
        });
      } catch {
        // Log persistence is best-effort and should not fail runs.
      }

      // Emit failure event for workflow advancement
      this.eventEmitter.emit('team.agent_loop.failed', {
        deploymentId: data.deploymentId,
        teamAgentId: data.teamAgentId,
        stepId: data.stepId,
        error: error?.message || 'Unknown error',
      });

      throw error;
    }
  }

  private async ensureRuntimeSession(data: TeamAgentLoopJob): Promise<string> {
    const agent = await this.teamRepo.findAgentById(data.teamAgentId);
    if (!agent) {
      throw new Error(`Team agent ${data.teamAgentId} not found`);
    }
    if (agent.runtimeSessionId) return agent.runtimeSessionId;

    try {
      const deployment = await this.teamRepo.findById(data.deploymentId);
      const deploymentConfig =
        deployment && typeof deployment.config === 'string'
          ? JSON.parse(deployment.config)
          : (deployment?.config as Record<string, any> | undefined);

      const roleDef = Array.isArray(deploymentConfig?.roles)
        ? deploymentConfig.roles.find((r: any) => r?.role === agent.role)
        : null;
      const triggerUserId = data.agentUserId || deployment?.deployedBy;
      const workspace = await this.workspaceRepo.findById(data.workspaceId);
      const agentSettings = resolveAgentSettings(workspace?.settings);
      // Team agents default to 'permissive' — auto-approve file writes, web,
      // and agent tools; only shell commands still require approval.
      // Workspace-level setting overrides this if explicitly configured.
      const workspacePreset = agentSettings.swarmPermissionLevel;
      const defaultApprovalPreset = workspacePreset && workspacePreset !== 'standard'
        ? mapSwarmPermissionToApprovalPreset(workspacePreset)
        : 'permissive' as const;

      const agentType =
        this.normalizeAgentType(
          agent.agentType ||
            roleDef?.agentType ||
            deploymentConfig?.defaultAgentType ||
            process.env.TEAM_AGENT_DEFAULT_TYPE ||
            'claude',
        );
      const configuredWorkdir =
        agent.workdir ||
        roleDef?.workdir ||
        deploymentConfig?.workdir ||
        process.env.TEAM_AGENT_DEFAULT_WORKDIR ||
        null;

      // Each team agent gets its own scratch directory to avoid config
      // collisions (.claude/, CLAUDE.md) when multiple agents share a workdir.
      const workdir = configuredWorkdir ||
        mkdtempSync(join(tmpdir(), `raven-team-${data.teamAgentId.slice(0, 8)}-`));
      const workspaceCredentials = await this.resolveAgentCredentials(
        data.workspaceId,
        data.agentUserId || undefined,
        deployment?.deployedBy || undefined,
      );
      const prepExecutionId = data.teamAgentId;
      const explicitApprovalPreset = this.resolveApprovalPreset(
        (roleDef as any)?.approvalPreset ||
          (deploymentConfig as any)?.approvalPreset,
      );

      await this.workspacePreparationService.cleanupApiKey(
        prepExecutionId,
        triggerUserId || 'system',
      );

      const prepResult = await this.workspacePreparationService.prepareWorkspace({
        workspacePath: workdir,
        workspaceId: data.workspaceId,
        executionId: prepExecutionId,
        agentType,
        triggeredBy: triggerUserId || 'system',
        taskDescription: this.buildTeamTaskDescription(
          data,
          agent.systemPrompt,
          agent.capabilities as string[],
        ),
        taskContext: {
          role: data.role,
          stepId: data.stepId || 'manual_run',
          capabilities: agent.capabilities || [],
          targetTaskId: data.targetTaskId,
          targetExperimentId: data.targetExperimentId,
        },
        approvalPreset: explicitApprovalPreset || defaultApprovalPreset,
      });

      const spawned = await this.agentExecution.spawn(
        data.workspaceId,
        {
          type: agentType,
          name: `team-${data.deploymentId.slice(0, 8)}-${agent.role}-${agent.instanceNumber}`,
          workdir,
          env: {
            ...workspaceCredentials,
            ...prepResult.env,
          },
          adapterConfig: prepResult.adapterConfig,
        },
        triggerUserId || undefined,
      );

      const terminalSession = await this.terminalSessionService.createSession(
        data.teamAgentId,
        data.workspaceId,
        spawned.id,
        {
          title: `Team ${agent.role} #${agent.instanceNumber}`,
        },
      );

      await this.teamRepo.updateAgentRuntimeSession(data.teamAgentId, {
        agentType,
        workdir,
        runtimeSessionId: spawned.id,
        terminalSessionId: terminalSession.id,
      });

      this.logger.log(
        `Bootstrapped team runtime session for ${data.teamAgentId}: runtime=${spawned.id} terminal=${terminalSession.id}`,
      );
      return spawned.id;
    } catch (error: any) {
      throw new Error(
        `Failed to bootstrap runtime session for team agent ${data.teamAgentId}: ${error?.message || 'unknown error'}`,
      );
    }
  }

  private normalizeAgentType(value: string): string {
    const raw = (value || '').trim();
    if (!raw) return 'claude';
    const normalized = raw.toLowerCase();
    return this.agentTypeAliases[normalized] || normalized;
  }

  private async dispatchRuntimeTask(
    runtimeSessionId: string,
    data: TeamAgentLoopJob,
  ): Promise<void> {
    const prompt = this.buildDispatchPrompt(data);
    const maxRetries = 2;
    const verifyDelayMs = Number(process.env.TEAM_DISPATCH_VERIFY_DELAY_MS) || 5000;
    const minExpectedGrowth = Number(process.env.TEAM_DISPATCH_MIN_GROWTH_LINES) || 15;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const beforeLines = this.agentExecution.getOutputBufferLineCount(runtimeSessionId);

      await this.agentExecution.send(runtimeSessionId, prompt, data.workspaceId);

      // Wait and verify the agent accepted the input (output grew)
      await new Promise((r) => setTimeout(r, verifyDelayMs));

      const afterLines = this.agentExecution.getOutputBufferLineCount(runtimeSessionId);
      const growth = afterLines - beforeLines;

      if (growth >= minExpectedGrowth) {
        this.logger.log(
          `Task accepted by session ${runtimeSessionId} (output grew by ${growth} lines)`,
        );
        return;
      }

      if (attempt < maxRetries) {
        this.logger.warn(
          `Output only grew by ${growth} lines after dispatch (attempt ${attempt + 1}/${maxRetries + 1}); retrying...`,
        );
        // Send enter in case text was written but enter was swallowed by a TUI render cycle
        try {
          this.agentExecution.sendKeys(runtimeSessionId, 'enter');
        } catch {
          // best-effort
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    this.logger.warn(
      `Task dispatch to ${runtimeSessionId} may not have been accepted after ${maxRetries + 1} attempts`,
    );
  }

  private buildDispatchPrompt(data: TeamAgentLoopJob): string {
    const caps = (data.capabilities || []).join(', ') || 'none';
    const priorContext = this.buildPriorPhasesBlock(data.priorPhases);

    // If the workflow step has a concrete task description, use it directly.
    if (data.stepContext?.task && data.stepContext.task !== 'Execute one ad-hoc team loop') {
      const target = data.targetExperimentId
        ? `\nThe target experiment ID is ${data.targetExperimentId}.`
        : data.targetTaskId
          ? `\nThe target task ID is ${data.targetTaskId}.`
          : '';
      return [
        data.stepContext.task,
        target,
        '',
        `Use the Raven API tools listed in your CLAUDE.md to do this work. Your allowed tool categories: ${caps}.`,
        'Save all findings and artifacts to Raven Docs so the team can see your progress.',
        priorContext,
      ].filter(Boolean).join('\n');
    }

    // Manual / ad-hoc run — build a concrete prompt from the agent's role context.
    const targetLine = data.targetExperimentId
      ? `Start by querying the Raven API for experiment ${data.targetExperimentId} to understand the current state, then do your work.`
      : data.targetTaskId
        ? `Start by querying the Raven API for task ${data.targetTaskId} to understand what needs to be done.`
        : 'Start by using `search_tools` to discover available tools, then query for open tasks or experiments that match your capabilities.';

    return [
      `You are the "${data.role}" on this team. Your CLAUDE.md file describes your role, the Raven API, and how to call tools via HTTP.`,
      '',
      targetLine,
      '',
      `Your allowed tool categories: ${caps}.`,
      `Use curl with $MCP_API_KEY to call the Raven API (see CLAUDE.md for examples). Save all findings, updates, and artifacts back to Raven Docs so the rest of the team can build on your work.`,
      priorContext,
    ].filter(Boolean).join('\n');
  }

  private buildPriorPhasesBlock(
    priorPhases?: Array<{ stepId: string; role: string; summary: string }>,
  ): string {
    if (!priorPhases?.length) return '';
    const lines = priorPhases.map(
      (p) => `- ${p.role} (${p.stepId}): ${p.summary}`,
    );
    return [
      '',
      '## Prior workflow phases (completed):',
      ...lines,
      '',
      'Use the Raven MCP tools to query for full details on any hypothesis, experiment, or doc page referenced above.',
    ].join('\n');
  }

  private async resolveAgentCredentials(
    workspaceId: string,
    agentUserId?: string,
    deployerUserId?: string,
  ): Promise<Record<string, string>> {
    if (agentUserId) {
      try {
        const creds = this.userService.resolveAgentProviderEnv(agentUserId, workspaceId);
        if (Object.keys(creds).length > 0) return creds;
      } catch { /* fall through to deployer */ }
    }
    if (deployerUserId) {
      try {
        return this.userService.resolveAgentProviderEnv(deployerUserId, workspaceId);
      } catch { /* return empty */ }
    }
    return {};
  }

  private buildTeamTaskDescription(
    data: TeamAgentLoopJob,
    systemPrompt: string,
    capabilities: string[],
  ): string {
    const stepText = data.stepContext?.name || data.stepId || 'manual_run';
    const taskText = data.stepContext?.task || 'Continue assigned team workflow.';
    const caps = (capabilities || []).join(', ') || 'none';
    const targetText = data.targetExperimentId
      ? `Target experiment: ${data.targetExperimentId}`
      : data.targetTaskId
        ? `Target task: ${data.targetTaskId}`
        : 'No explicit target constraint.';

    return [
      `Role: ${data.role}`,
      `Step: ${stepText}`,
      `Task: ${taskText}`,
      targetText,
      '',
      'System instructions:',
      systemPrompt || 'No explicit system prompt.',
      '',
      `MCP methods allowed for this role: ${caps}`,
      'Important: use Raven MCP tools to persist findings, updates, and artifacts so work is tracked in Raven Docs.',
    ].join('\n');
  }

  private resolveApprovalPreset(
    value: unknown,
  ): 'readonly' | 'standard' | 'permissive' | 'autonomous' | undefined {
    const normalized = String(value || '')
      .trim()
      .toLowerCase();
    if (!normalized) return undefined;
    if (
      normalized === 'readonly' ||
      normalized === 'standard' ||
      normalized === 'permissive' ||
      normalized === 'autonomous'
    ) {
      return normalized;
    }
    if (normalized === 'yolo') {
      return 'autonomous';
    }
    return mapSwarmPermissionToApprovalPreset(normalized);
  }
}
