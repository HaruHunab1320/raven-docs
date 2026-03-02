import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { WsGateway } from '../../ws/ws.gateway';
import { TeamDeploymentRepo } from '../../database/repos/team/team-deployment.repo';
import { MCPEventService } from '../../integrations/mcp/services/mcp-event.service';
import { MCPResourceType } from '../../integrations/mcp/interfaces/mcp-event.interface';

@Injectable()
export class TeamRuntimeListener {
  private readonly logger = new Logger(TeamRuntimeListener.name);

  constructor(
    private readonly wsGateway: WsGateway,
    private readonly teamRepo: TeamDeploymentRepo,
    private readonly mcpEventService: MCPEventService,
  ) {}

  @OnEvent('team.agent_loop.started')
  async handleAgentLoopStarted(data: {
    deploymentId: string;
    teamAgentId: string;
    role: string;
    stepId?: string;
  }) {
    await this.emitAndPublishTeamRuntimeEvent('team:agent_loop_started', 'agent_loop_started', data);
  }

  @OnEvent('team.agent_loop.completed')
  async handleAgentLoopCompleted(data: {
    deploymentId: string;
    teamAgentId: string;
    stepId?: string;
    result: any;
  }) {
    await this.emitAndPublishTeamRuntimeEvent(
      'team:agent_loop_completed',
      'agent_loop_completed',
      data,
    );
  }

  @OnEvent('team.agent_loop.failed')
  async handleAgentLoopFailed(data: {
    deploymentId: string;
    teamAgentId: string;
    stepId?: string;
    error: string;
  }) {
    await this.emitAndPublishTeamRuntimeEvent('team:agent_loop_failed', 'agent_loop_failed', data);
  }

  @OnEvent('team.message_sent')
  async handleMessageSent(data: {
    deploymentId: string;
    messageId: string;
    fromAgentId: string;
    fromRole: string;
    toAgentId: string;
    toRole: string;
    agentSpawned: boolean;
  }) {
    await this.emitAndPublishTeamRuntimeEvent('team:message_sent', 'message_sent', data);
  }

  @OnEvent('team.agent_tool_running')
  async handleAgentToolRunning(data: {
    deploymentId: string;
    teamAgentId: string;
    stepId?: string;
    tool?: { toolName?: string; description?: string } | null;
    autoInterruptEnabled: boolean;
    runtimeSessionId: string;
  }) {
    await this.emitAndPublishTeamRuntimeEvent(
      'team:agent_tool_running',
      'agent_tool_running',
      data,
    );
  }

  @OnEvent('team.agent_login_required')
  async handleAgentLoginRequired(data: {
    deploymentId: string;
    teamAgentId: string;
    stepId?: string;
    url?: string;
    instructions?: string;
    loginUrl?: string;
    runtimeSessionId: string;
  }) {
    await this.emitAndPublishTeamRuntimeEvent(
      'team:agent_login_required',
      'agent_login_required',
      data,
    );
  }

  @OnEvent('team.agent_blocking_prompt')
  async handleAgentBlockingPrompt(data: {
    deploymentId: string;
    teamAgentId: string;
    stepId?: string;
    promptInfo?: any;
    coordinatorResponded?: boolean;
    runtimeSessionId?: string;
  }) {
    await this.emitAndPublishTeamRuntimeEvent(
      'team:agent_blocking_prompt',
      'agent_blocking_prompt',
      data,
    );
  }

  @OnEvent('team.stall_classified')
  async handleStallClassified(data: {
    deploymentId: string;
    teamAgentId: string;
    stepId?: string;
    classification?: any;
    runtimeSessionId?: string;
  }) {
    await this.emitAndPublishTeamRuntimeEvent(
      'team:stall_classified',
      'stall_classified',
      data,
    );
  }

  @OnEvent('team.escalation_surfaced_to_user')
  async handleEscalationSurfacedToUser(data: {
    deploymentId: string;
    teamAgentId: string;
    runtimeSessionId?: string;
    promptInfo?: any;
    workspaceId?: string;
    spaceId?: string;
  }) {
    await this.emitAndPublishTeamRuntimeEvent(
      'team:escalation_surfaced',
      'escalation_surfaced_to_user',
      data,
    );
  }

  @OnEvent('team.agent_tool_interrupted')
  async handleAgentToolInterrupted(data: {
    deploymentId: string;
    teamAgentId: string;
    stepId?: string;
    tool?: { toolName?: string; description?: string } | null;
    interrupted: boolean;
    method: string;
    runtimeSessionId: string;
  }) {
    await this.emitAndPublishTeamRuntimeEvent(
      'team:agent_tool_interrupted',
      'agent_tool_interrupted',
      data,
    );
  }

  private async emitAndPublishTeamRuntimeEvent(
    wsEventName: string,
    eventName: string,
    payload: { deploymentId: string; [k: string]: any },
  ) {
    const deployment = await this.teamRepo.findById(payload.deploymentId);
    if (!deployment) return;

    const enrichedPayload = {
      ...payload,
      workspaceId: deployment.workspaceId,
      spaceId: deployment.spaceId,
    };

    this.wsGateway.server
      .to(`workspace-${deployment.workspaceId}`)
      .emit(wsEventName, enrichedPayload);

    await this.publishTeamRuntimeEvent(eventName, enrichedPayload, deployment);
  }

  private async publishTeamRuntimeEvent(
    eventName: string,
    payload: { deploymentId: string; [k: string]: any },
    deployment?: { workspaceId: string; spaceId: string; deployedBy?: string | null },
  ) {
    try {
      const resolvedDeployment =
        deployment || (await this.teamRepo.findById(payload.deploymentId));
      if (!resolvedDeployment) return;

      this.logger.debug(
        `Publishing team runtime MCP event "${eventName}" for deployment ${payload.deploymentId}`,
      );

      this.mcpEventService.createUpdatedEvent(
        MCPResourceType.WORKSPACE,
        resolvedDeployment.workspaceId,
        {
          channel: 'team_runtime',
          event: eventName,
          deploymentId: payload.deploymentId,
          ...payload,
        },
        resolvedDeployment.deployedBy || 'system',
        resolvedDeployment.workspaceId,
        resolvedDeployment.spaceId,
      );
    } catch {
      this.logger.warn(
        `Failed to publish team runtime MCP event "${eventName}" for deployment ${payload.deploymentId}`,
      );
    }
  }
}
