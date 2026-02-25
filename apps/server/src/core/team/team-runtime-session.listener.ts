import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TeamDeploymentRepo } from '../../database/repos/team/team-deployment.repo';
import { TerminalSessionService } from '../terminal/terminal-session.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { WorkspacePreparationService } from '../coding-swarm/workspace-preparation.service';

@Injectable()
export class TeamRuntimeSessionListener {
  private readonly logger = new Logger(TeamRuntimeSessionListener.name);

  constructor(
    private readonly teamRepo: TeamDeploymentRepo,
    private readonly terminalSessionService: TerminalSessionService,
    private readonly eventEmitter: EventEmitter2,
    private readonly workspacePreparationService: WorkspacePreparationService,
  ) {}

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
