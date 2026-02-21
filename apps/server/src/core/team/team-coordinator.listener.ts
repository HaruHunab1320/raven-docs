import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { WorkflowExecutorService } from './workflow-executor.service';
import { TeamDeploymentRepo } from '../../database/repos/team/team-deployment.repo';
import type { RavenExecutionPlan } from './workflow-state.types';
import type { RoutingRule } from './org-chart.types';

@Injectable()
export class TeamCoordinatorListener {
  private readonly logger = new Logger(TeamCoordinatorListener.name);

  constructor(
    private readonly workflowExecutor: WorkflowExecutorService,
    private readonly teamRepo: TeamDeploymentRepo,
  ) {}

  @OnEvent('team.agent_loop.completed')
  async handleAgentLoopCompleted(data: {
    deploymentId: string;
    teamAgentId: string;
    stepId?: string;
    result: any;
  }) {
    if (!data.stepId) return;

    try {
      await this.workflowExecutor.completeStep(
        data.deploymentId,
        data.stepId,
        data.result,
      );
    } catch (error: any) {
      this.logger.error(
        `Failed to complete step ${data.stepId}: ${error.message}`,
        error.stack,
      );
    }
  }

  @OnEvent('team.agent_loop.failed')
  async handleAgentLoopFailed(data: {
    deploymentId: string;
    teamAgentId: string;
    stepId?: string;
    error: string;
  }) {
    if (!data.stepId) return;

    try {
      await this.workflowExecutor.failStep(
        data.deploymentId,
        data.stepId,
        data.error,
      );
    } catch (error: any) {
      this.logger.error(
        `Failed to handle step failure ${data.stepId}: ${error.message}`,
        error.stack,
      );
    }
  }

  @OnEvent('mcp.event')
  async handleMcpEvent(data: {
    workspaceId: string;
    eventType: string;
    payload: any;
  }) {
    try {
      const deployments = await this.teamRepo.findActiveDeploymentsInWorkspace(
        data.workspaceId,
      );

      for (const deployment of deployments) {
        const plan = deployment.executionPlan as unknown as RavenExecutionPlan;
        if (!plan?.routing) continue;

        const matched = plan.routing.some((rule: RoutingRule) => {
          if (!rule.topics) return false;
          return rule.topics.some((topic) => data.eventType.includes(topic));
        });

        if (matched) {
          await this.workflowExecutor.advance(deployment.id, {
            reason: 'mcp_event',
            context: { eventType: data.eventType, payload: data.payload },
          });
        }
      }
    } catch (error: any) {
      this.logger.debug(
        `MCP event handling skipped: ${error.message}`,
      );
    }
  }

  @OnEvent('coding_swarm.completed')
  async handleCodingSwarmCompleted(data: {
    workspaceId: string;
    executionId: string;
    experimentId?: string;
  }) {
    try {
      const deployments = await this.teamRepo.findActiveDeploymentsInWorkspace(
        data.workspaceId,
      );

      for (const deployment of deployments) {
        const stateRow = await this.teamRepo.getWorkflowState(deployment.id);
        const state = stateRow?.workflowState as any;
        if (!state?.stepStates) continue;

        // Find 'wait' steps waiting for swarm events
        for (const [stepId, stepState] of Object.entries(state.stepStates)) {
          const ss = stepState as any;
          if (ss.status === 'waiting') {
            await this.workflowExecutor.advance(deployment.id, {
              reason: 'coding_swarm_completed',
              context: {
                executionId: data.executionId,
                experimentId: data.experimentId,
              },
            });
            break;
          }
        }
      }
    } catch (error: any) {
      this.logger.debug(
        `Coding swarm completion handling skipped: ${error.message}`,
      );
    }
  }
}
