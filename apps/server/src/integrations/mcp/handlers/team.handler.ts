import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { TeamDeploymentService } from '../../../core/team/team-deployment.service';
import {
  createInternalError,
  createInvalidParamsError,
  createResourceNotFoundError,
} from '../utils/error.utils';

/**
 * MCP Handler for Team Deployment operations
 *
 * Provides tools for deploying, managing, and tearing down multi-agent
 * research teams within a workspace/space.
 *
 * Methods:
 * - team.deploy: Deploy a team from a template
 * - team.status: Get deployment status and agent details
 * - team.list: List deployments in a workspace
 * - team.trigger: Trigger a single run of all agents
 * - team.pause: Pause a deployment
 * - team.resume: Resume a paused deployment
 * - team.teardown: Tear down a deployment
 */
@Injectable()
export class TeamHandler {
  private readonly logger = new Logger(TeamHandler.name);

  constructor(
    @Inject(forwardRef(() => TeamDeploymentService))
    private readonly teamService: TeamDeploymentService,
  ) {}

  /**
   * Deploy a team from a template to a space
   * Method: team.deploy
   */
  async deploy(params: any, userId: string) {
    this.logger.debug(`TeamHandler.deploy called by ${userId}`);
    try {
      if (!params.workspaceId) {
        throw createInvalidParamsError('workspaceId is required');
      }
      if (!params.spaceId) {
        throw createInvalidParamsError('spaceId is required');
      }
      if (!params.templateName) {
        throw createInvalidParamsError('templateName is required');
      }

      const result = await this.teamService.deployTeam(
        params.workspaceId,
        params.spaceId,
        params.templateName,
        userId,
        { projectId: params.projectId },
      );

      return {
        deploymentId: result.deployment.id,
        templateName: params.templateName,
        agents: result.agents.map((a: any) => ({
          id: a.id,
          role: a.role,
          instanceNumber: a.instanceNumber,
          userName: a.userName,
        })),
        agentCount: result.agents.length,
      };
    } catch (error: any) {
      this.logger.error(
        `Error in team.deploy: ${error.message || 'Unknown error'}`,
        error.stack,
      );
      if (error.code && typeof error.code === 'number') {
        throw error;
      }
      throw createInternalError(error.message || String(error));
    }
  }

  /**
   * Get deployment status with agent details
   * Method: team.status
   */
  async status(params: any, userId: string) {
    this.logger.debug(`TeamHandler.status called by ${userId}`);
    try {
      if (!params.workspaceId) {
        throw createInvalidParamsError('workspaceId is required');
      }
      if (!params.deploymentId) {
        throw createInvalidParamsError('deploymentId is required');
      }

      const result = await this.teamService.getDeployment(
        params.workspaceId,
        params.deploymentId,
      );

      return {
        deployment: {
          id: result.deployment.id,
          templateName: result.deployment.templateName,
          status: result.deployment.status,
          createdAt: result.deployment.createdAt,
        },
        agents: result.agents.map((a: any) => ({
          id: a.id,
          role: a.role,
          instanceNumber: a.instanceNumber,
          status: a.status,
          lastRunAt: a.lastRunAt,
          lastRunSummary: a.lastRunSummary,
        })),
      };
    } catch (error: any) {
      this.logger.error(
        `Error in team.status: ${error.message || 'Unknown error'}`,
        error.stack,
      );
      if (error.code && typeof error.code === 'number') {
        throw error;
      }
      throw createInternalError(error.message || String(error));
    }
  }

  /**
   * List deployments in a workspace
   * Method: team.list
   */
  async list(params: any, userId: string) {
    this.logger.debug(`TeamHandler.list called by ${userId}`);
    try {
      if (!params.workspaceId) {
        throw createInvalidParamsError('workspaceId is required');
      }

      const deployments = await this.teamService.listDeployments(
        params.workspaceId,
        { spaceId: params.spaceId, status: params.status },
      );

      return {
        deployments: deployments.map((d: any) => ({
          id: d.id,
          templateName: d.templateName,
          status: d.status,
          spaceId: d.spaceId,
          createdAt: d.createdAt,
        })),
        total: deployments.length,
      };
    } catch (error: any) {
      this.logger.error(
        `Error in team.list: ${error.message || 'Unknown error'}`,
        error.stack,
      );
      if (error.code && typeof error.code === 'number') {
        throw error;
      }
      throw createInternalError(error.message || String(error));
    }
  }

  /**
   * Trigger a single run of all agents in a deployment
   * Method: team.trigger
   */
  async trigger(params: any, userId: string) {
    this.logger.debug(`TeamHandler.trigger called by ${userId}`);
    try {
      if (!params.workspaceId) {
        throw createInvalidParamsError('workspaceId is required');
      }
      if (!params.deploymentId) {
        throw createInvalidParamsError('deploymentId is required');
      }

      const result = await this.teamService.triggerTeamRun(
        params.workspaceId,
        params.deploymentId,
      );

      return result;
    } catch (error: any) {
      this.logger.error(
        `Error in team.trigger: ${error.message || 'Unknown error'}`,
        error.stack,
      );
      if (error.code && typeof error.code === 'number') {
        throw error;
      }
      throw createInternalError(error.message || String(error));
    }
  }

  /**
   * Pause a deployment
   * Method: team.pause
   */
  async pause(params: any, userId: string) {
    this.logger.debug(`TeamHandler.pause called by ${userId}`);
    try {
      if (!params.workspaceId) {
        throw createInvalidParamsError('workspaceId is required');
      }
      if (!params.deploymentId) {
        throw createInvalidParamsError('deploymentId is required');
      }

      await this.teamService.pauseDeployment(
        params.workspaceId,
        params.deploymentId,
      );

      return { success: true, deploymentId: params.deploymentId, status: 'paused' };
    } catch (error: any) {
      this.logger.error(
        `Error in team.pause: ${error.message || 'Unknown error'}`,
        error.stack,
      );
      if (error.code && typeof error.code === 'number') {
        throw error;
      }
      throw createInternalError(error.message || String(error));
    }
  }

  /**
   * Resume a paused deployment
   * Method: team.resume
   */
  async resume(params: any, userId: string) {
    this.logger.debug(`TeamHandler.resume called by ${userId}`);
    try {
      if (!params.workspaceId) {
        throw createInvalidParamsError('workspaceId is required');
      }
      if (!params.deploymentId) {
        throw createInvalidParamsError('deploymentId is required');
      }

      await this.teamService.resumeDeployment(
        params.workspaceId,
        params.deploymentId,
      );

      return { success: true, deploymentId: params.deploymentId, status: 'active' };
    } catch (error: any) {
      this.logger.error(
        `Error in team.resume: ${error.message || 'Unknown error'}`,
        error.stack,
      );
      if (error.code && typeof error.code === 'number') {
        throw error;
      }
      throw createInternalError(error.message || String(error));
    }
  }

  /**
   * Tear down a deployment
   * Method: team.teardown
   */
  async teardown(params: any, userId: string) {
    this.logger.debug(`TeamHandler.teardown called by ${userId}`);
    try {
      if (!params.workspaceId) {
        throw createInvalidParamsError('workspaceId is required');
      }
      if (!params.deploymentId) {
        throw createInvalidParamsError('deploymentId is required');
      }

      const result = await this.teamService.teardownTeam(
        params.workspaceId,
        params.deploymentId,
      );

      return result;
    } catch (error: any) {
      this.logger.error(
        `Error in team.teardown: ${error.message || 'Unknown error'}`,
        error.stack,
      );
      if (error.code && typeof error.code === 'number') {
        throw error;
      }
      throw createInternalError(error.message || String(error));
    }
  }
}
