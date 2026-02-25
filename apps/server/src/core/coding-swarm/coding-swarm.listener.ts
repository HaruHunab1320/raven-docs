import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { WsGateway } from '../../ws/ws.gateway';
import { CodingSwarmService } from './coding-swarm.service';

@Injectable()
export class CodingSwarmListener {
  private readonly logger = new Logger(CodingSwarmListener.name);

  constructor(
    private readonly codingSwarmService: CodingSwarmService,
    private readonly wsGateway: WsGateway,
  ) {}

  /**
   * Agent is ready — send the coding task
   */
  @OnEvent('parallax.agent_ready')
  async handleAgentReady(data: {
    workspaceId: string;
    agent: any;
    agentId?: string;
    runtimeSessionId?: string;
  }) {
    const agentId = data.agentId || data.agent?.id;
    if (!agentId) return;

    try {
      await this.codingSwarmService.handleAgentReady(agentId, {
        runtimeSessionId: data.runtimeSessionId,
        terminalSessionId: data.agent?.terminalSessionId,
      });
    } catch (error: any) {
      this.logger.debug(
        `Agent ${agentId} ready event not for coding swarm: ${error.message}`,
      );
    }
  }

  /**
   * Agent has stopped — capture results and finalize
   */
  @OnEvent('parallax.agent_stopped')
  async handleAgentStopped(data: {
    workspaceId: string;
    agent: any;
    agentId?: string;
    reason?: string;
    exitCode?: number;
  }) {
    const agentId = data.agentId || data.agent?.id;
    if (!agentId) return;

    try {
      await this.codingSwarmService.handleAgentStopped(agentId, {
        reason: data.reason,
        exitCode: data.exitCode,
      });
    } catch (error: any) {
      this.logger.debug(
        `Agent ${agentId} stopped event not for coding swarm: ${error.message}`,
      );
    }
  }

  /**
   * Agent encountered an error
   */
  @OnEvent('parallax.agent_error')
  async handleAgentError(data: {
    workspaceId: string;
    agent: any;
    agentId?: string;
    error?: string;
  }) {
    const agentId = data.agentId || data.agent?.id;
    if (!agentId) return;

    try {
      await this.codingSwarmService.handleAgentError(agentId, {
        error: data.error,
      });
    } catch (error: any) {
      this.logger.debug(
        `Agent ${agentId} error event not for coding swarm: ${error.message}`,
      );
    }
  }

  /**
   * Broadcast swarm status changes to WebSocket clients
   */
  @OnEvent('coding_swarm.status_changed')
  handleStatusChanged(data: {
    workspaceId: string;
    spaceId?: string;
    executionId: string;
    status: string;
  }) {
    this.wsGateway.server
      .to(`workspace-${data.workspaceId}`)
      .emit('swarm:status_changed', {
        spaceId: data.spaceId,
        executionId: data.executionId,
        status: data.status,
      });
  }

  /**
   * Broadcast swarm completion to WebSocket clients
   */
  @OnEvent('coding_swarm.completed')
  handleCompleted(data: {
    workspaceId: string;
    spaceId?: string;
    executionId: string;
    experimentId?: string;
  }) {
    this.wsGateway.server
      .to(`workspace-${data.workspaceId}`)
      .emit('swarm:completed', {
        spaceId: data.spaceId,
        executionId: data.executionId,
        experimentId: data.experimentId,
      });
  }
}
