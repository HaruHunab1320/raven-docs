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

  @OnEvent('team.workflow.updated')
  async handleWorkflowUpdated(data: {
    deploymentId: string;
    currentPhase: string;
    triggerReason?: string;
    completedStepId?: string;
    failedStepId?: string;
    error?: string;
  }) {
    await this.emitAndPublishTeamRuntimeEvent('team:workflow_updated', 'workflow_updated', data);
  }

  @OnEvent('team.workflow.completed')
  async handleWorkflowCompleted(data: { deploymentId: string }) {
    await this.emitAndPublishTeamRuntimeEvent('team:workflow_completed', 'workflow_completed', data);
  }

  @OnEvent('team.workflow.failed')
  async handleWorkflowFailed(data: {
    deploymentId: string;
    stepId?: string;
    error?: string;
  }) {
    await this.emitAndPublishTeamRuntimeEvent('team:workflow_failed', 'workflow_failed', data);
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
