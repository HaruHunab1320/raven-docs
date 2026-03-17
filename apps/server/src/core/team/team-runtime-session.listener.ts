import { Injectable, Logger, Optional, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TeamDeploymentRepo } from '../../database/repos/team/team-deployment.repo';
import { TerminalSessionService } from '../terminal/terminal-session.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { WorkspacePreparationService } from '../coding-swarm/workspace-preparation.service';
import { AgentExecutionService } from '../coding-swarm/agent-execution.service';
import { ParallaxClientService } from '../parallax-runtime/parallax-client.service';
import { TeamMessagingService } from './team-messaging.service';

const COMPLETION_CHECK_INTERVAL_MS = 20_000;

interface AuthFlowState {
  status: 'in_progress' | 'completed' | 'failed';
  loginUrl?: string;
  loginSessionId?: string;
  waitingAgentIds: string[];
  startedAt: number;
}

@Injectable()
export class TeamRuntimeSessionListener implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TeamRuntimeSessionListener.name);
  private completionCheckTimer: ReturnType<typeof setInterval> | null = null;
  private activeAuthFlows = new Map<string, AuthFlowState>();

  constructor(
    private readonly teamRepo: TeamDeploymentRepo,
    private readonly terminalSessionService: TerminalSessionService,
    private readonly eventEmitter: EventEmitter2,
    private readonly workspacePreparationService: WorkspacePreparationService,
    private readonly agentExecution: AgentExecutionService,
    private readonly parallaxClient: ParallaxClientService,
    @Optional() private readonly teamMessaging: TeamMessagingService,
  ) {}

  private get isRemoteMode(): boolean {
    return !!process.env.AGENT_RUNTIME_ENDPOINT || !!this.parallaxClient?.isSdkAvailable;
  }

  onModuleInit() {
    this.completionCheckTimer = setInterval(
      () => void this.checkRunningAgentsForCompletion(),
      COMPLETION_CHECK_INTERVAL_MS,
    );
  }

  async onModuleDestroy() {
    if (this.completionCheckTimer) {
      clearInterval(this.completionCheckTimer);
      this.completionCheckTimer = null;
    }

    for (const [, flow] of this.activeAuthFlows) {
      if (flow.loginSessionId) {
        try { await this.agentExecution.stop(flow.loginSessionId); } catch { /* best-effort */ }
      }
    }
    this.activeAuthFlows.clear();
  }

  /**
   * Periodic check: for each running team agent with a currentStepId and a
   * runtime session, force a stall classification. This catches completions
   * that the PTY stall timer misses (e.g. when terminal escape sequences
   * keep the output "active" and prevent the 15-second no-output threshold
   * from being reached).
   */
  private async checkRunningAgentsForCompletion(): Promise<void> {
    try {
      const deployments = await this.teamRepo.findActiveDeployments();
      for (const deployment of deployments) {
        const agents = await this.teamRepo.getAgentsByDeployment(deployment.id);
        for (const agent of agents) {
          if (
            agent.status === 'running' &&
            agent.currentStepId &&
            agent.runtimeSessionId &&
            !agent.userTakeover
          ) {
            await this.agentExecution.forceClassifySession(
              agent.runtimeSessionId,
              { agentType: agent.agentType || undefined, role: agent.role },
            );
          }
        }
      }
    } catch {
      // best-effort — don't crash the interval
    }
  }

  /**
   * Remote Parallax execution: an agent has been spawned and assigned an ID.
   * Map the Parallax agent ID to the corresponding Raven team_agent record
   * by matching role name so that subsequent parallax.* events (stopped,
   * error, login_required, etc.) can find the team_agent.
   */
  @OnEvent('parallax.agent_started')
  async handleRemoteAgentStarted(data: {
    workspaceId?: string;
    agent?: { id?: string; name?: string; type?: string; role?: string; runtimeSessionId?: string };
  }) {
    const agent = data.agent;
    if (!agent?.id || !agent?.role || !data.workspaceId) return;

    // Find active deployments in this workspace
    const deployments = await this.teamRepo.findActiveDeployments();
    for (const deployment of deployments) {
      if (deployment.workspaceId !== data.workspaceId) continue;

      const agents = await this.teamRepo.getAgentsByDeployment(deployment.id);
      // Find the first agent with matching role that doesn't already have a runtime session
      const match = agents.find(
        (a) =>
          a.role === agent.role &&
          !a.runtimeSessionId,
      );

      if (match) {
        const runtimeSessionId = agent.runtimeSessionId || agent.id;
        await this.teamRepo.updateAgentRuntimeSession(match.id, {
          runtimeSessionId,
          agentType: agent.type || match.agentType,
        });
        await this.teamRepo.updateAgentStatus(match.id, 'running');

        this.logger.log(
          `Mapped remote Parallax agent ${agent.id} → team_agent ${match.id} (role=${agent.role})`,
        );

        this.eventEmitter.emit('team.agent_loop.started', {
          deploymentId: deployment.id,
          teamAgentId: match.id,
          role: match.role,
        });
        return;
      }
    }

    this.logger.warn(
      `No matching team_agent found for remote agent ${agent.id} (role=${agent.role})`,
    );
  }

  @OnEvent('parallax.agent_stopped')
  async handleRuntimeStopped(data: {
    workspaceId?: string;
    agentId?: string;
    reason?: string;
    exitCode?: number;
    loginDetected?: boolean;
  }) {
    const runtimeSessionId = data.agentId;
    if (!runtimeSessionId) return;

    const teamAgent =
      await this.teamRepo.findAgentByRuntimeSessionId(runtimeSessionId);
    if (!teamAgent) return;

    if (data.workspaceId && data.workspaceId !== teamAgent.workspaceId) {
      return;
    }

    // If agent was taken over by user, clear the flag before normal cleanup
    if (teamAgent.userTakeover) {
      await this.teamRepo.updateAgentUserTakeover(teamAgent.id, false);
    }

    // If login was detected on exit, the login_required handler already
    // marked the agent as error and emitted the appropriate events.
    // Skip the normal idle/completed flow to avoid overriding that state.
    if (data.loginDetected) {
      this.logger.log(
        `Skipping normal stop handling for ${teamAgent.id} — login_required already handled`,
      );
      return;
    }

    const stepId = teamAgent.currentStepId || undefined;

    await this.teamRepo.updateAgentStatus(teamAgent.id, 'idle');
    await this.teamRepo.updateAgentCurrentStep(teamAgent.id, null);
    await this.teamRepo.updateAgentRuntimeSession(teamAgent.id, {
      runtimeSessionId: null,
      terminalSessionId: null,
    });
    await this.cleanupTeamApiKey(teamAgent.deploymentId, teamAgent.id, teamAgent.userId);

    if (teamAgent.terminalSessionId) {
      try {
        await this.terminalSessionService.terminate(teamAgent.terminalSessionId);
      } catch {
        // best-effort cleanup
      }
    }

    const summary = `Runtime session ${runtimeSessionId} stopped (reason=${data.reason || 'unknown'}, exit=${String(data.exitCode ?? 'n/a')})`;

    try {
      await this.teamRepo.appendRunLog(teamAgent.deploymentId, {
        id: `${Date.now()}-${teamAgent.id}`,
        timestamp: new Date().toISOString(),
        deploymentId: teamAgent.deploymentId,
        teamAgentId: teamAgent.id,
        role: teamAgent.role,
        stepId,
        summary,
        actionsExecuted: 1,
        errorsEncountered: 0,
        actions: [{ method: 'runtime.completed', status: 'executed' }],
      });
    } catch {
      // best-effort log append
    }

    if (stepId) {
      this.eventEmitter.emit('team.agent_loop.completed', {
        deploymentId: teamAgent.deploymentId,
        teamAgentId: teamAgent.id,
        stepId,
        result: {
          summary,
          actionsExecuted: 1,
          errorsEncountered: 0,
          actions: [{ method: 'runtime.completed', status: 'executed' }],
        },
      });
    }

    this.logger.log(
      `Resolved runtime stop for team agent ${teamAgent.id} (step=${stepId || 'none'})`,
    );
  }

  @OnEvent('parallax.agent_error')
  async handleRuntimeError(data: {
    workspaceId?: string;
    agentId?: string;
    error?: string;
  }) {
    const runtimeSessionId = data.agentId;
    if (!runtimeSessionId) return;

    const teamAgent =
      await this.teamRepo.findAgentByRuntimeSessionId(runtimeSessionId);
    if (!teamAgent) return;

    if (data.workspaceId && data.workspaceId !== teamAgent.workspaceId) {
      return;
    }

    const stepId = teamAgent.currentStepId || undefined;
    const errorText = data.error || 'Runtime session error';

    await this.teamRepo.updateAgentStatus(teamAgent.id, 'error');
    await this.teamRepo.updateAgentCurrentStep(teamAgent.id, null);
    await this.cleanupTeamApiKey(teamAgent.deploymentId, teamAgent.id, teamAgent.userId);

    try {
      await this.teamRepo.appendRunLog(teamAgent.deploymentId, {
        id: `${Date.now()}-${teamAgent.id}`,
        timestamp: new Date().toISOString(),
        deploymentId: teamAgent.deploymentId,
        teamAgentId: teamAgent.id,
        role: teamAgent.role,
        stepId,
        summary: `Runtime error for session ${runtimeSessionId}: ${errorText}`,
        actionsExecuted: 0,
        errorsEncountered: 1,
        actions: [{ method: 'runtime.error', status: 'failed', error: errorText }],
      });
    } catch {
      // best-effort log append
    }

    if (stepId) {
      this.eventEmitter.emit('team.agent_loop.failed', {
        deploymentId: teamAgent.deploymentId,
        teamAgentId: teamAgent.id,
        stepId,
        error: errorText,
      });
    }

    // Auto-pause the deployment if all agents are now in error/paused state
    await this.autoPauseIfAllErrored(teamAgent.deploymentId);

    this.logger.warn(
      `Resolved runtime error for team agent ${teamAgent.id} (step=${stepId || 'none'}): ${errorText}`,
    );
  }

  @OnEvent('parallax.tool_running')
  async handleToolRunning(data: {
    workspaceId?: string;
    agentId?: string;
    info?: { toolName?: string; description?: string };
    autoInterruptEnabled?: boolean;
  }) {
    const runtimeSessionId = data.agentId;
    if (!runtimeSessionId) return;

    const teamAgent =
      await this.teamRepo.findAgentByRuntimeSessionId(runtimeSessionId);
    if (!teamAgent) return;
    if (data.workspaceId && data.workspaceId !== teamAgent.workspaceId) return;

    const detail = data.info?.description || data.info?.toolName || 'tool running';

    try {
      await this.teamRepo.appendRunLog(teamAgent.deploymentId, {
        id: `${Date.now()}-${teamAgent.id}`,
        timestamp: new Date().toISOString(),
        deploymentId: teamAgent.deploymentId,
        teamAgentId: teamAgent.id,
        role: teamAgent.role,
        stepId: teamAgent.currentStepId || undefined,
        summary: `Detected tool-running process for runtime session ${runtimeSessionId}: ${detail}`,
        actionsExecuted: 0,
        errorsEncountered: 0,
        actions: [{ method: 'runtime.tool_running', status: 'executed' }],
      });
    } catch {
      // best-effort
    }

    this.eventEmitter.emit('team.agent_tool_running', {
      deploymentId: teamAgent.deploymentId,
      teamAgentId: teamAgent.id,
      stepId: teamAgent.currentStepId || undefined,
      tool: data.info || null,
      autoInterruptEnabled: !!data.autoInterruptEnabled,
      runtimeSessionId,
    });
  }

  @OnEvent('parallax.tool_interrupted')
  async handleToolInterrupted(data: {
    workspaceId?: string;
    agentId?: string;
    info?: { toolName?: string; description?: string };
    interrupted?: boolean;
    method?: string;
  }) {
    const runtimeSessionId = data.agentId;
    if (!runtimeSessionId) return;

    const teamAgent =
      await this.teamRepo.findAgentByRuntimeSessionId(runtimeSessionId);
    if (!teamAgent) return;
    if (data.workspaceId && data.workspaceId !== teamAgent.workspaceId) return;

    const detail = data.info?.description || data.info?.toolName || 'tool';
    const success = !!data.interrupted;
    const method = data.method || 'sendKeys(ctrl+c)';

    try {
      await this.teamRepo.appendRunLog(teamAgent.deploymentId, {
        id: `${Date.now()}-${teamAgent.id}`,
        timestamp: new Date().toISOString(),
        deploymentId: teamAgent.deploymentId,
        teamAgentId: teamAgent.id,
        role: teamAgent.role,
        stepId: teamAgent.currentStepId || undefined,
        summary: success
          ? `Interrupted tool-running process (${detail}) via ${method}`
          : `Failed to interrupt tool-running process (${detail})`,
        actionsExecuted: success ? 1 : 0,
        errorsEncountered: success ? 0 : 1,
        actions: [
          {
            method: 'runtime.interrupt_tool_running',
            status: success ? 'executed' : 'failed',
            error: success ? undefined : 'Interrupt failed',
          },
        ],
      });
    } catch {
      // best-effort
    }

    this.eventEmitter.emit('team.agent_tool_interrupted', {
      deploymentId: teamAgent.deploymentId,
      teamAgentId: teamAgent.id,
      stepId: teamAgent.currentStepId || undefined,
      tool: data.info || null,
      interrupted: success,
      method,
      runtimeSessionId,
    });
  }

  @OnEvent('parallax.login_required')
  async handleLoginRequired(data: {
    workspaceId?: string;
    agentId?: string;
    url?: string;
    instructions?: string;
  }) {
    const runtimeSessionId = data.agentId;
    if (!runtimeSessionId) return;

    const teamAgent = await this.teamRepo.findAgentByRuntimeSessionId(runtimeSessionId);
    if (!teamAgent) return;
    if (data.workspaceId && data.workspaceId !== teamAgent.workspaceId) return;

    // Guard: if agent is already in error state from a previous login event, skip
    if (teamAgent.status === 'error') {
      this.logger.log(
        `Agent ${teamAgent.id} already in error state — skipping duplicate login_required`,
      );
      return;
    }

    // --- Auth coordination: only one agent per deployment+agentType triggers login ---
    const authKey = `${teamAgent.deploymentId}:${teamAgent.agentType || 'claude'}`;
    const existingFlow = this.activeAuthFlows.get(authKey);

    if (existingFlow && existingFlow.status === 'in_progress') {
      // Another agent is already handling login — just queue this one
      existingFlow.waitingAgentIds.push(teamAgent.id);
      this.logger.log(
        `Agent ${teamAgent.id} queued behind active auth flow for ${authKey}`,
      );
      // Still mark this agent as error so the UI shows the auth banner
      await this.teamRepo.updateAgentStatus(teamAgent.id, 'error');
      await this.teamRepo.updateAgentCurrentStep(teamAgent.id, null);
      await this.teamRepo.updateAgentRunStats(teamAgent.id, {
        lastRunAt: new Date(),
        lastRunSummary: existingFlow.loginUrl
          ? `Authentication required — sign in at ${existingFlow.loginUrl}`
          : 'Authentication required — waiting for team auth',
        actionsExecuted: 0,
        errorsEncountered: 1,
      });
      // Kill this agent's runtime session (no point keeping it alive)
      if (runtimeSessionId) {
        try { await this.agentExecution.stop(runtimeSessionId); } catch { /* best-effort */ }
      }
      return;
    }

    // Register this flow
    this.activeAuthFlows.set(authKey, {
      status: 'in_progress',
      waitingAgentIds: [],
      startedAt: Date.now(),
    });

    const stepId = teamAgent.currentStepId || undefined;

    // --- Auto-login: drive the /login flow to extract an auth URL ---
    let loginUrl: string | undefined;
    let loginSessionId: string | undefined;

    if (this.isRemoteMode) {
      // ── Remote flow: drive login via Parallax HTTP API ──
      ({ loginUrl, loginSessionId } = await this.extractLoginUrlRemote(
        runtimeSessionId,
        teamAgent,
      ));
    } else {
      // ── Local flow: drive login via local PTY ──
      ({ loginUrl, loginSessionId } = await this.extractLoginUrlLocal(
        runtimeSessionId,
        teamAgent,
      ));
    }

    // Update the auth flow state with the extracted URL and session
    const currentFlow = this.activeAuthFlows.get(authKey);
    if (currentFlow) {
      currentFlow.loginUrl = loginUrl;
      currentFlow.loginSessionId = loginSessionId;
    }

    // --- Mark agent as error and clean up ---
    await this.teamRepo.updateAgentStatus(teamAgent.id, 'error');
    await this.teamRepo.updateAgentCurrentStep(teamAgent.id, null);
    await this.teamRepo.updateAgentRunStats(teamAgent.id, {
      lastRunAt: new Date(),
      lastRunSummary: loginUrl
        ? `Authentication required — sign in at ${loginUrl}`
        : 'Authentication required — run "claude login" to authenticate',
      actionsExecuted: 0,
      errorsEncountered: 1,
    });

    if (loginUrl && loginSessionId) {
      // Keep the login session alive so the OAuth callback can complete.
      // Null out runtimeSessionId to prevent duplicate event processing.
      await this.teamRepo.updateAgentRuntimeSession(teamAgent.id, {
        runtimeSessionId: null,
        terminalSessionId: teamAgent.terminalSessionId,
      });
      await this.cleanupTeamApiKey(teamAgent.deploymentId, teamAgent.id, teamAgent.userId);

      // Monitor in the background: detect "Login successful. Press Enter to
      // continue…" and send Enter so the OAuth token is persisted.
      void this.waitForLoginCompletion(loginSessionId, teamAgent.id, authKey, teamAgent.deploymentId);
    } else {
      // No URL extracted — full cleanup (kill session)
      await this.teamRepo.updateAgentRuntimeSession(teamAgent.id, {
        runtimeSessionId: null,
        terminalSessionId: null,
      });
      await this.cleanupTeamApiKey(teamAgent.deploymentId, teamAgent.id, teamAgent.userId);

      try {
        await this.agentExecution.stop(runtimeSessionId);
      } catch {
        // best-effort
      }

      if (teamAgent.terminalSessionId) {
        try {
          await this.terminalSessionService.terminate(teamAgent.terminalSessionId);
        } catch {
          // best-effort
        }
      }
    }

    try {
      await this.teamRepo.appendRunLog(teamAgent.deploymentId, {
        id: `${Date.now()}-${teamAgent.id}`,
        timestamp: new Date().toISOString(),
        deploymentId: teamAgent.deploymentId,
        teamAgentId: teamAgent.id,
        role: teamAgent.role,
        stepId,
        summary: `Agent requires authentication — ${data.instructions || 'login required'}`,
        actionsExecuted: 0,
        errorsEncountered: 1,
        actions: [{ method: 'runtime.login_required', status: 'failed', error: 'Authentication required' }],
      });
    } catch {
      // best-effort
    }

    this.eventEmitter.emit('team.agent_login_required', {
      deploymentId: teamAgent.deploymentId,
      teamAgentId: teamAgent.id,
      stepId,
      url: data.url,
      instructions: data.instructions,
      loginUrl,
      runtimeSessionId,
    });

    // Emit loop failure so the workflow doesn't retry this step
    if (stepId) {
      this.eventEmitter.emit('team.agent_loop.failed', {
        deploymentId: teamAgent.deploymentId,
        teamAgentId: teamAgent.id,
        stepId,
        error: 'Authentication required — run "claude login" to authenticate',
      });
    }

    // Auto-pause the deployment — login_required affects all agents
    // since they share the same authentication context
    await this.autoPauseIfAllErrored(teamAgent.deploymentId);

    this.logger.warn(
      `Agent ${teamAgent.id} (${teamAgent.role}) requires authentication — loginUrl=${loginUrl || 'none'}`,
    );
  }

  @OnEvent('parallax.blocking_prompt')
  async handleBlockingPrompt(data: {
    workspaceId?: string;
    agentId?: string;
    runtimeSessionId?: string;
    promptInfo?: { type?: string; prompt?: string; options?: string[]; suggestedResponse?: string };
  }) {
    const runtimeSessionId = data.runtimeSessionId || data.agentId;
    if (!runtimeSessionId) return;

    const teamAgent = await this.teamRepo.findAgentByRuntimeSessionId(runtimeSessionId);
    if (!teamAgent) return;
    if (data.workspaceId && data.workspaceId !== teamAgent.workspaceId) return;

    // User is driving this agent — emit event for UI but don't auto-deliver
    if (teamAgent.userTakeover) {
      this.eventEmitter.emit('team.agent_blocking_prompt', {
        deploymentId: teamAgent.deploymentId,
        teamAgentId: teamAgent.id,
        stepId: teamAgent.currentStepId || undefined,
        promptInfo: data.promptInfo,
        userTakeover: true,
        runtimeSessionId,
      });
      return;
    }

    // Login prompts are handled by handleLoginRequired — skip here
    const promptType = data.promptInfo?.type || '';
    if (promptType === 'login') {
      return;
    }

    // Skip startup/config prompts — these are handled by PTY auto-response rules
    if (!teamAgent.currentStepId && ['config', 'permission', 'trust'].includes(promptType)) {
      return;
    }

    // Check for pending messages and deliver them if available.
    // This wakes up idle agents that have received new work via team_send_message.
    if (this.teamMessaging) {
      try {
        const delivered = await this.teamMessaging.deliverPendingMessages(teamAgent.id);
        if (delivered > 0) {
          this.logger.log(
            `Delivered ${delivered} pending messages to agent ${teamAgent.id} on blocking_prompt`,
          );
          this.eventEmitter.emit('team.agent_blocking_prompt', {
            deploymentId: teamAgent.deploymentId,
            teamAgentId: teamAgent.id,
            stepId: teamAgent.currentStepId || undefined,
            promptInfo: data.promptInfo,
            messagesDelivered: delivered,
            runtimeSessionId,
          });
          return;
        }
      } catch (err: any) {
        this.logger.warn(
          `Failed to deliver pending messages to ${teamAgent.id}: ${err?.message}`,
        );
      }
    }

    // No pending messages — emit event for UI visibility and let stall
    // classifier handle truly stuck agents
    this.eventEmitter.emit('team.agent_blocking_prompt', {
      deploymentId: teamAgent.deploymentId,
      teamAgentId: teamAgent.id,
      stepId: teamAgent.currentStepId || undefined,
      promptInfo: data.promptInfo,
      runtimeSessionId,
    });
  }

  @OnEvent('parallax.stall_classified')
  async handleStallClassified(data: {
    workspaceId?: string;
    agentId?: string;
    runtimeSessionId?: string;
    classification?: any;
  }) {
    const runtimeSessionId = data.runtimeSessionId || data.agentId;
    if (!runtimeSessionId) return;

    const teamAgent = await this.teamRepo.findAgentByRuntimeSessionId(runtimeSessionId);
    if (!teamAgent) return;
    if (data.workspaceId && data.workspaceId !== teamAgent.workspaceId) return;

    // User is driving — skip stall classification
    if (teamAgent.userTakeover) return;

    this.eventEmitter.emit('team.stall_classified', {
      deploymentId: teamAgent.deploymentId,
      teamAgentId: teamAgent.id,
      stepId: teamAgent.currentStepId || undefined,
      classification: data.classification,
      runtimeSessionId,
    });
  }

  @OnEvent('parallax.task_complete')
  async handleTaskComplete(data: {
    workspaceId?: string;
    agentId?: string;
    runtimeSessionId?: string;
    result?: any;
  }) {
    const runtimeSessionId = data.runtimeSessionId || data.agentId;
    if (!runtimeSessionId) return;

    const teamAgent = await this.teamRepo.findAgentByRuntimeSessionId(runtimeSessionId);
    if (!teamAgent) return;
    if (data.workspaceId && data.workspaceId !== teamAgent.workspaceId) return;

    // User is driving — skip task completion handling
    if (teamAgent.userTakeover) return;

    const stepId = teamAgent.currentStepId || undefined;
    if (!stepId) return;

    const summary = `Task complete detected for session ${runtimeSessionId}`;

    try {
      await this.teamRepo.appendRunLog(teamAgent.deploymentId, {
        id: `${Date.now()}-${teamAgent.id}`,
        timestamp: new Date().toISOString(),
        deploymentId: teamAgent.deploymentId,
        teamAgentId: teamAgent.id,
        role: teamAgent.role,
        stepId,
        summary,
        actionsExecuted: 1,
        errorsEncountered: 0,
        actions: [{ method: 'runtime.task_complete', status: 'executed' }],
      });
    } catch {
      // best-effort
    }

    this.eventEmitter.emit('team.agent_loop.completed', {
      deploymentId: teamAgent.deploymentId,
      teamAgentId: teamAgent.id,
      stepId,
      result: {
        summary,
        ...(data.result || {}),
        actionsExecuted: 1,
        errorsEncountered: 0,
        actions: [{ method: 'runtime.task_complete', status: 'executed' }],
      },
    });
  }

  /**
   * Local flow: drive /login via local PTY to extract OAuth URL.
   */
  private async extractLoginUrlLocal(
    runtimeSessionId: string,
    teamAgent: { id: string; workspaceId: string; agentType?: string | null },
  ): Promise<{ loginUrl?: string; loginSessionId?: string }> {
    let loginUrl: string | undefined;
    let loginSessionId: string | undefined;

    // Step 1: try the existing (possibly dead) session
    try {
      this.logger.log(
        `Attempting auto-login on existing session ${runtimeSessionId}`,
      );
      await this.agentExecution.send(runtimeSessionId, '/login');
      await new Promise((r) => setTimeout(r, 2000));
      this.agentExecution.sendKeys(runtimeSessionId, 'enter');
      await new Promise((r) => setTimeout(r, 3000));

      loginUrl = this.extractAuthUrl(
        this.agentExecution.getOutputBuffer(runtimeSessionId),
      );
      if (loginUrl) {
        loginSessionId = runtimeSessionId;
        this.logger.log(`Extracted login URL from existing session: ${loginUrl}`);
      }
    } catch {
      this.logger.log(
        `Existing session ${runtimeSessionId} is dead — will spawn temporary login session`,
      );
    }

    // Step 2: if no URL yet, spawn a fresh interactive session
    if (!loginUrl) {
      try {
        const tempResult = await this.agentExecution.spawn(
          teamAgent.workspaceId,
          {
            type: teamAgent.agentType || 'claude',
            name: `login-${teamAgent.id.slice(-8)}`,
            workdir: process.env.HOME || '/tmp',
            inheritProcessEnv: true,
            adapterConfig: { interactive: true },
          },
        );
        loginSessionId = tempResult.id;
        this.logger.log(
          `Spawned temporary login session ${loginSessionId} for agent ${teamAgent.id}`,
        );

        await new Promise((r) => setTimeout(r, 4000));

        await this.agentExecution.send(loginSessionId, '/login');
        await new Promise((r) => setTimeout(r, 2000));
        this.agentExecution.sendKeys(loginSessionId, 'enter');
        await new Promise((r) => setTimeout(r, 3000));

        loginUrl = this.extractAuthUrl(
          this.agentExecution.getOutputBuffer(loginSessionId),
        );

        // Retry once if URL not yet in buffer
        if (!loginUrl) {
          await new Promise((r) => setTimeout(r, 3000));
          loginUrl = this.extractAuthUrl(
            this.agentExecution.getOutputBuffer(loginSessionId),
          );
        }

        if (loginUrl) {
          this.logger.log(`Extracted login URL from temp session: ${loginUrl}`);
        } else {
          this.logger.warn(
            `Failed to extract login URL from temp session ${loginSessionId}`,
          );
          try { await this.agentExecution.stop(loginSessionId); } catch { /* best-effort */ }
          loginSessionId = undefined;
        }
      } catch (err: any) {
        this.logger.warn(
          `Failed to spawn temp login session: ${err?.message || 'unknown'}`,
        );
        if (loginSessionId) {
          try { await this.agentExecution.stop(loginSessionId); } catch { /* best-effort */ }
          loginSessionId = undefined;
        }
      }
    }

    return { loginUrl, loginSessionId };
  }

  /**
   * Remote flow: drive /login via Parallax HTTP API to extract OAuth URL.
   * Uses POST /api/agents/:id/send and GET /api/agents/:id/output.
   */
  private async extractLoginUrlRemote(
    runtimeSessionId: string,
    teamAgent: { id: string; workspaceId: string; agentType?: string | null },
  ): Promise<{ loginUrl?: string; loginSessionId?: string }> {
    let loginUrl: string | undefined;
    const loginSessionId = runtimeSessionId;

    // Step 1: try sending /login to the existing remote agent
    try {
      this.logger.log(
        `Remote auto-login: sending /login to agent ${runtimeSessionId}`,
      );

      // Send /login command
      await this.agentExecution.send(runtimeSessionId, '/login', teamAgent.workspaceId);
      await new Promise((r) => setTimeout(r, 2000));

      // Send Enter to confirm
      await this.parallaxClient.sendAgentKeys(runtimeSessionId, 'enter');
      await new Promise((r) => setTimeout(r, 3000));

      // Read output via HTTP API
      const output = await this.parallaxClient.getAgentOutput(runtimeSessionId);
      loginUrl = this.extractAuthUrl(output);

      // Retry once — remote may be slower
      if (!loginUrl) {
        await new Promise((r) => setTimeout(r, 3000));
        const retryOutput = await this.parallaxClient.getAgentOutput(runtimeSessionId);
        loginUrl = this.extractAuthUrl(retryOutput);
      }

      if (loginUrl) {
        this.logger.log(`Remote: extracted login URL: ${loginUrl}`);
      } else {
        this.logger.warn(
          `Remote: failed to extract login URL from agent ${runtimeSessionId}`,
        );
      }
    } catch (err: any) {
      this.logger.warn(
        `Remote auto-login failed for ${runtimeSessionId}: ${err?.message || 'unknown'}`,
      );
    }

    // If no URL from existing session, try spawning a fresh remote login agent
    if (!loginUrl) {
      try {
        this.logger.log(
          `Remote: spawning temporary login agent for ${teamAgent.id}`,
        );
        const tempResult = await this.agentExecution.spawn(
          teamAgent.workspaceId,
          {
            type: teamAgent.agentType || 'claude',
            name: `login-${teamAgent.id.slice(-8)}`,
            workdir: '/tmp',
            adapterConfig: { interactive: true },
          },
        );
        const tempSessionId = tempResult.id;

        // Wait for agent to be ready
        await new Promise((r) => setTimeout(r, 5000));

        // Send /login + Enter via HTTP
        await this.agentExecution.send(tempSessionId, '/login', teamAgent.workspaceId);
        await new Promise((r) => setTimeout(r, 2000));
        await this.parallaxClient.sendAgentKeys(tempSessionId, 'enter');
        await new Promise((r) => setTimeout(r, 4000));

        const output = await this.parallaxClient.getAgentOutput(tempSessionId);
        loginUrl = this.extractAuthUrl(output);

        if (!loginUrl) {
          await new Promise((r) => setTimeout(r, 3000));
          const retryOutput = await this.parallaxClient.getAgentOutput(tempSessionId);
          loginUrl = this.extractAuthUrl(retryOutput);
        }

        if (loginUrl) {
          this.logger.log(`Remote: extracted login URL from temp agent: ${loginUrl}`);
          return { loginUrl, loginSessionId: tempSessionId };
        } else {
          this.logger.warn(`Remote: failed to extract login URL from temp agent`);
          try { await this.agentExecution.stop(tempSessionId, teamAgent.workspaceId); } catch { /* best-effort */ }
        }
      } catch (err: any) {
        this.logger.warn(
          `Remote: failed to spawn temp login agent: ${err?.message || 'unknown'}`,
        );
      }
    }

    return { loginUrl, loginSessionId: loginUrl ? loginSessionId : undefined };
  }

  /**
   * Strip ANSI escape codes from PTY output and look for an auth URL.
   * Prefers claude.ai / anthropic.com URLs, falls back to the last URL found.
   */
  private extractAuthUrl(output: string): string | undefined {
    if (!output) return undefined;
    // eslint-disable-next-line no-control-regex
    const stripped = output.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
    // eslint-disable-next-line no-control-regex
    const urlMatch = stripped.match(/https?:\/\/[^\s\x1b)]+/g);
    if (!urlMatch) return undefined;
    return (
      urlMatch.find(
        (u) => u.includes('claude.ai') || u.includes('anthropic.com'),
      ) || urlMatch[urlMatch.length - 1]
    );
  }

  /**
   * After the auto-login flow extracts an auth URL, poll the PTY output
   * for "Login successful" / "Logged in as". When detected, send Enter
   * to dismiss the "Press Enter to continue…" prompt so the session
   * returns to an idle state ready for the next reset/dispatch.
   */
  private async waitForLoginCompletion(
    runtimeSessionId: string,
    teamAgentId: string,
    authKey: string,
    deploymentId: string,
    maxWaitMs = 300_000,
  ): Promise<void> {
    const CHECK_INTERVAL_MS = 5_000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      await new Promise((r) => setTimeout(r, CHECK_INTERVAL_MS));

      try {
        // Get output — remote uses HTTP, local uses PTY buffer
        let output: string;
        if (this.isRemoteMode) {
          output = await this.parallaxClient.getAgentOutput(runtimeSessionId);
        } else {
          output = this.agentExecution.getOutputBuffer(runtimeSessionId);
        }

        if (!output) {
          // Session may have been killed (e.g. user reset) — stop polling
          this.logger.log(
            `Login monitor: session ${runtimeSessionId} buffer empty — stopping`,
          );
          this.activeAuthFlows.delete(authKey);
          return;
        }

        // eslint-disable-next-line no-control-regex
        const stripped = output.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');

        if (
          stripped.includes('Login successful') ||
          stripped.includes('Logged in as')
        ) {
          this.logger.log(
            `Login monitor: detected successful login for agent ${teamAgentId} — sending Enter`,
          );

          // Send Enter — remote uses HTTP, local uses PTY
          if (this.isRemoteMode) {
            await this.parallaxClient.sendAgentKeys(runtimeSessionId, 'enter');
            await new Promise((r) => setTimeout(r, 1000));
            await this.parallaxClient.sendAgentKeys(runtimeSessionId, 'enter');
          } else {
            this.agentExecution.sendKeys(runtimeSessionId, 'enter');
            await new Promise((r) => setTimeout(r, 1000));
            try {
              this.agentExecution.sendKeys(runtimeSessionId, 'enter');
            } catch {
              // session may have already moved on
            }
          }

          // Mark auth flow as completed
          const flow = this.activeAuthFlows.get(authKey);
          if (flow) {
            flow.status = 'completed';
          }

          // Kill the login session now that auth is complete
          await new Promise((r) => setTimeout(r, 2000));
          try {
            await this.agentExecution.stop(runtimeSessionId);
          } catch {
            // best-effort
          }

          // Auto-restart the deployment so all agents benefit from the new auth
          try {
            await this.autoRestartDeployment(deploymentId);
          } catch (err: any) {
            this.logger.warn(`Failed to auto-restart after auth: ${err?.message}`);
          }

          this.activeAuthFlows.delete(authKey);
          return;
        }
      } catch {
        // Session gone — stop polling
        this.activeAuthFlows.delete(authKey);
        return;
      }
    }

    // Timed out waiting for login — kill the orphaned session and clean up flow
    this.activeAuthFlows.delete(authKey);
    this.logger.warn(
      `Login monitor: timed out waiting for login completion (agent ${teamAgentId}) — killing session`,
    );
    try {
      await this.agentExecution.stop(runtimeSessionId);
    } catch {
      // best-effort
    }
  }

  private async autoRestartDeployment(deploymentId: string): Promise<void> {
    const agents = await this.teamRepo.getAgentsByDeployment(deploymentId);

    for (const agent of agents) {
      if (agent.status === 'error') {
        // Kill any lingering runtime sessions
        if (agent.runtimeSessionId) {
          try { await this.agentExecution.stop(agent.runtimeSessionId); } catch { /* best-effort */ }
        }
        await this.teamRepo.updateAgentStatus(agent.id, 'idle');
        await this.teamRepo.updateAgentRuntimeSession(agent.id, {
          runtimeSessionId: null,
          terminalSessionId: null,
        });
      }
    }

    // Reactivate deployment if paused
    const deployment = await this.teamRepo.findById(deploymentId);
    if (deployment?.status === 'paused') {
      await this.teamRepo.updateStatus(deploymentId, 'active');
    }

    // Emit event so workflow executor re-dispatches
    this.eventEmitter.emit('team.auth_completed', { deploymentId });

    this.logger.log(
      `Auto-restarted deployment ${deploymentId} after successful authentication`,
    );
  }

  private async autoPauseIfAllErrored(deploymentId: string): Promise<void> {
    try {
      const deployment = await this.teamRepo.findById(deploymentId);
      if (!deployment || deployment.status !== 'active') return;

      const agents = await this.teamRepo.getAgentsByDeployment(deploymentId);
      if (agents.length === 0) return;

      const allErrored = agents.every(
        (a) => a.status === 'error' || a.status === 'paused',
      );
      if (!allErrored) return;

      await this.teamRepo.updateStatus(deploymentId, 'paused');
      this.logger.log(
        `Auto-paused deployment ${deploymentId} — all agents are in error/paused state`,
      );
    } catch {
      // best-effort — don't fail the error handler
    }
  }

  private async cleanupTeamApiKey(
    deploymentId: string,
    teamAgentId: string,
    fallbackUserId?: string | null,
  ): Promise<void> {
    try {
      const deployment = await this.teamRepo.findById(deploymentId);
      const triggerUserId = deployment?.deployedBy || fallbackUserId || 'system';
      await this.workspacePreparationService.cleanupApiKey(
        teamAgentId,
        triggerUserId,
      );
    } catch {
      // best-effort cleanup
    }
  }
}
