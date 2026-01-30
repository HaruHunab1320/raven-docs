import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { WsGateway } from '../../ws/ws.gateway';

/**
 * Listens for Parallax agent events and broadcasts them to the workspace
 * via WebSocket so the frontend can react in real-time.
 *
 * Event mapping from Parallax → Raven broadcast:
 * ┌────────────────┬──────────────────────┬─────────────────────┐
 * │ Parallax Event │   Raven Broadcast    │        Data         │
 * ├────────────────┼──────────────────────┼─────────────────────┤
 * │ agent_started  │ agent:started        │ { agent }           │
 * │ agent_ready    │ agent:ready          │ { agent }           │
 * │ login_required │ agent:login_required │ { agent, loginUrl } │
 * │ agent_stopped  │ agent:stopped        │ { agent, reason }   │
 * │ agent_error    │ agent:error          │ { agent, error }    │
 * └────────────────┴──────────────────────┴─────────────────────┘
 */
@Injectable()
export class ParallaxAgentsListener {
  private readonly logger = new Logger(ParallaxAgentsListener.name);

  constructor(private readonly wsGateway: WsGateway) {}

  /**
   * Agent has started spawning
   */
  @OnEvent('parallax.agent_started')
  handleAgentStarted(data: { workspaceId: string; agent: any }) {
    this.logger.log(`Broadcasting agent:started for agent ${data.agent?.id}`);

    this.wsGateway.server
      .to(`workspace-${data.workspaceId}`)
      .emit('agent:started', {
        agent: data.agent,
      });
  }

  /**
   * Agent is ready for work
   */
  @OnEvent('parallax.agent_ready')
  handleAgentReady(data: {
    workspaceId: string;
    agent: any;
    agentId?: string;
    mcpEndpoint?: string;
    runtimeSessionId?: string;
  }) {
    this.logger.log(`Broadcasting agent:ready for agent ${data.agent?.id || data.agentId}`);

    this.wsGateway.server
      .to(`workspace-${data.workspaceId}`)
      .emit('agent:ready', {
        agent: data.agent,
      });
  }

  /**
   * Agent requires login (device code flow)
   * UI should auto-open terminal to show login instructions.
   */
  @OnEvent('parallax.login_required')
  handleLoginRequired(data: {
    workspaceId: string;
    agent: any;
    agentId?: string;
    loginUrl?: string;
    runtimeSessionId?: string;
  }) {
    this.logger.log(`Broadcasting agent:login_required for agent ${data.agent?.id || data.agentId}`);

    this.wsGateway.server
      .to(`workspace-${data.workspaceId}`)
      .emit('agent:login_required', {
        agent: data.agent,
        loginUrl: data.loginUrl,
      });
  }

  /**
   * Agent has stopped
   */
  @OnEvent('parallax.agent_stopped')
  handleAgentStopped(data: {
    workspaceId: string;
    agent: any;
    agentId?: string;
    reason?: string;
  }) {
    this.logger.log(`Broadcasting agent:stopped for agent ${data.agent?.id || data.agentId}`);

    this.wsGateway.server
      .to(`workspace-${data.workspaceId}`)
      .emit('agent:stopped', {
        agent: data.agent,
        reason: data.reason,
      });
  }

  /**
   * Agent encountered an error
   */
  @OnEvent('parallax.agent_error')
  handleAgentError(data: {
    workspaceId: string;
    agent: any;
    agentId?: string;
    error?: string;
  }) {
    this.logger.log(`Broadcasting agent:error for agent ${data.agent?.id || data.agentId}`);

    this.wsGateway.server
      .to(`workspace-${data.workspaceId}`)
      .emit('agent:error', {
        agent: data.agent,
        error: data.error,
      });
  }

  // ========== Legacy event handlers (for backwards compatibility) ==========

  /**
   * @deprecated Use agent_error instead
   */
  @OnEvent('parallax.spawn_failed')
  handleSpawnFailed(data: {
    workspaceId: string;
    agentId: string;
    error?: string;
  }) {
    this.logger.log(`Broadcasting agent:error (spawn_failed) for agent ${data.agentId}`);

    this.wsGateway.server
      .to(`workspace-${data.workspaceId}`)
      .emit('agent:error', {
        agent: { id: data.agentId },
        error: data.error,
      });
  }

  /**
   * @deprecated Use agent_started instead
   */
  @OnEvent('parallax.agents_spawned')
  handleAgentsSpawned(data: {
    workspaceId: string;
    agentType: string;
    count: number;
    spawnedAgents: Array<{ id: string; name: string; type: string; status: string }>;
  }) {
    this.logger.log(`Broadcasting agent:started for ${data.count} spawned agents`);

    for (const agent of data.spawnedAgents) {
      this.wsGateway.server
        .to(`workspace-${data.workspaceId}`)
        .emit('agent:started', {
          agent,
        });
    }
  }

  // ========== Access management events ==========

  @OnEvent('parallax.access_approved')
  handleAccessApproved(data: {
    agent: any;
    workspaceId: string;
    grantedPermissions: string[];
    via?: string;
  }) {
    this.logger.log(`Broadcasting agent:access_approved for agent ${data.agent.id}`);

    this.wsGateway.server
      .to(`workspace-${data.workspaceId}`)
      .emit('agent:access_approved', {
        agent: data.agent,
        grantedPermissions: data.grantedPermissions,
        via: data.via,
      });
  }

  @OnEvent('parallax.access_requested')
  handleAccessRequested(data: { agent: any; workspaceId: string }) {
    this.logger.log(`Broadcasting agent:access_requested for agent ${data.agent.id}`);

    this.wsGateway.server
      .to(`workspace-${data.workspaceId}`)
      .emit('agent:access_requested', {
        agent: data.agent,
      });
  }

  @OnEvent('parallax.access_revoked')
  handleAccessRevoked(data: {
    agentId: string;
    workspaceId: string;
    reason: string;
  }) {
    this.logger.log(`Broadcasting agent:access_revoked for agent ${data.agentId}`);

    this.wsGateway.server
      .to(`workspace-${data.workspaceId}`)
      .emit('agent:access_revoked', {
        agent: { id: data.agentId },
        reason: data.reason,
      });
  }
}
