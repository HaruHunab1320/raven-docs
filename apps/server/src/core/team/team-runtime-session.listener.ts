import { Injectable, Logger, Optional, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TeamDeploymentRepo } from '../../database/repos/team/team-deployment.repo';
import { TerminalSessionService } from '../terminal/terminal-session.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { WorkspacePreparationService } from '../coding-swarm/workspace-preparation.service';
import { AgentExecutionService } from '../coding-swarm/agent-execution.service';
import { CoordinatorResponseService } from './coordinator-response.service';
import { MainBrainEscalationService } from './main-brain-escalation.service';

const COMPLETION_CHECK_INTERVAL_MS = 20_000;

@Injectable()
export class TeamRuntimeSessionListener implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TeamRuntimeSessionListener.name);
  private completionCheckTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly teamRepo: TeamDeploymentRepo,
    private readonly terminalSessionService: TerminalSessionService,
    private readonly eventEmitter: EventEmitter2,
    private readonly workspacePreparationService: WorkspacePreparationService,
    private readonly agentExecution: AgentExecutionService,
    @Optional() private readonly coordinatorResponse: CoordinatorResponseService,
    @Optional() private readonly mainBrainEscalation: MainBrainEscalationService,
  ) {}

  onModuleInit() {
    this.completionCheckTimer = setInterval(
      () => void this.checkRunningAgentsForCompletion(),
      COMPLETION_CHECK_INTERVAL_MS,
    );
  }

  onModuleDestroy() {
    if (this.completionCheckTimer) {
      clearInterval(this.completionCheckTimer);
      this.completionCheckTimer = null;
    }
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
            agent.runtimeSessionId
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

  @OnEvent('parallax.agent_stopped')
  async handleRuntimeStopped(data: {
    workspaceId?: string;
    agentId?: string;
    reason?: string;
    exitCode?: number;
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

    // Skip startup/config prompts — these are handled by PTY auto-response rules
    // and resolve themselves. Only filter when the agent hasn't started a step yet;
    // once actively executing, all blocking prompts should be escalated.
    const promptType = data.promptInfo?.type || '';
    if (!teamAgent.currentStepId && ['config', 'permission', 'trust'].includes(promptType)) {
      return;
    }

    // Coordinator itself is blocked — escalate to main brain
    if (!teamAgent.reportsToAgentId) {
      if (!this.mainBrainEscalation) {
        this.logger.warn(`MainBrainEscalationService not available — cannot handle coordinator blocking prompt for ${teamAgent.id}`);
        return;
      }

      const escalationResult = await this.mainBrainEscalation.handleCoordinatorBlocked({
        teamAgentId: teamAgent.id,
        deploymentId: teamAgent.deploymentId,
        runtimeSessionId,
        promptInfo: data.promptInfo || { type: 'unknown' },
      });

      this.eventEmitter.emit('team.agent_blocking_prompt', {
        deploymentId: teamAgent.deploymentId,
        teamAgentId: teamAgent.id,
        stepId: teamAgent.currentStepId || undefined,
        promptInfo: data.promptInfo,
        mainBrainResponded: escalationResult.responded,
        surfacedToUser: escalationResult.surfacedToUser,
        runtimeSessionId,
      });

      if (escalationResult.responded) {
        this.logger.log(`Main brain handled coordinator blocking prompt for ${teamAgent.id}`);
      } else if (escalationResult.surfacedToUser) {
        this.logger.warn(`Main brain surfaced coordinator prompt to user for ${teamAgent.id}`);
      } else {
        this.logger.warn(`Main brain escalation failed for coordinator ${teamAgent.id}: ${escalationResult.error}`);
      }
      return;
    }

    if (!this.coordinatorResponse) {
      this.logger.warn(`CoordinatorResponseService not available — cannot handle blocking prompt for ${teamAgent.id}`);
      return;
    }

    const result = await this.coordinatorResponse.handleBlockedAgent({
      teamAgentId: teamAgent.id,
      deploymentId: teamAgent.deploymentId,
      runtimeSessionId,
      promptInfo: data.promptInfo || { type: 'unknown' },
    });

    // Emit team event for UI visibility regardless of coordinator outcome
    this.eventEmitter.emit('team.agent_blocking_prompt', {
      deploymentId: teamAgent.deploymentId,
      teamAgentId: teamAgent.id,
      stepId: teamAgent.currentStepId || undefined,
      promptInfo: data.promptInfo,
      coordinatorResponded: result.responded,
      runtimeSessionId,
    });

    if (result.responded) {
      this.logger.log(`Coordinator handled blocking prompt for agent ${teamAgent.id}`);
    } else {
      this.logger.warn(`Coordinator did not respond to agent ${teamAgent.id}: ${result.error}`);
    }
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
