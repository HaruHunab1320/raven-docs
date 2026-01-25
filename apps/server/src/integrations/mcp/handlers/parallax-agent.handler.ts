import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ParallaxAgentsService } from '../../../core/parallax-agents/parallax-agents.service';
import { UserService } from '../../../core/user/user.service';
import { WorkspaceService } from '../../../core/workspace/services/workspace.service';
import {
  createInternalError,
  createInvalidParamsError,
  createPermissionDeniedError,
  createResourceNotFoundError,
} from '../utils/error.utils';

/**
 * MCP Handler for Parallax Agent operations
 *
 * This handler provides tools that Parallax agents can use to:
 * - Query their assignments (projects and tasks)
 * - Update their working status
 * - Log activity for audit trails
 * - List other agents in the workspace
 * - Claim available tasks
 * - Delegate work to other agents
 */
@Injectable()
export class ParallaxAgentHandler {
  private readonly logger = new Logger(ParallaxAgentHandler.name);

  constructor(
    @Inject(forwardRef(() => ParallaxAgentsService))
    private readonly agentsService: ParallaxAgentsService,
    private readonly userService: UserService,
    private readonly workspaceService: WorkspaceService,
  ) {}

  private async assertWorkspaceAccess(workspaceId: string, userId: string) {
    if (!workspaceId) {
      throw createInvalidParamsError('workspaceId is required');
    }

    const workspace = await this.workspaceService.findById(workspaceId);
    if (!workspace) {
      throw createResourceNotFoundError('Workspace', workspaceId);
    }

    const user = await this.userService.findById(userId, workspaceId);
    if (!user) {
      throw createPermissionDeniedError(
        'User not found in the specified workspace',
      );
    }

    return workspace;
  }

  /**
   * Get the calling agent's current assignments
   * Method: agent.myAssignments
   */
  async myAssignments(params: any, userId: string) {
    this.logger.debug(
      `ParallaxAgentHandler.myAssignments called for user ${userId}`,
    );
    try {
      await this.assertWorkspaceAccess(params.workspaceId, userId);

      if (!params.agentId) {
        throw createInvalidParamsError('agentId is required');
      }

      // Verify the agent exists and belongs to the workspace
      const agent = await this.agentsService.getAgent(
        params.agentId,
        params.workspaceId,
      );
      if (!agent) {
        throw createResourceNotFoundError('Agent', params.agentId);
      }

      const assignments = await this.agentsService.getAgentAssignments(
        params.agentId,
      );

      return {
        agentId: params.agentId,
        agentName: agent.name,
        assignments: assignments,
        totalProjects: assignments.filter((a) => a.assignmentType === 'project')
          .length,
        totalTasks: assignments.filter((a) => a.assignmentType === 'task')
          .length,
      };
    } catch (error: any) {
      this.logger.error(
        `Error in agent.myAssignments: ${error.message || 'Unknown error'}`,
        error.stack,
      );

      if (error.code && typeof error.code === 'number') {
        throw error;
      }

      throw createInternalError(error.message || String(error));
    }
  }

  /**
   * Update the agent's working status
   * Method: agent.updateStatus
   */
  async updateStatus(params: any, userId: string) {
    this.logger.debug(
      `ParallaxAgentHandler.updateStatus called for user ${userId}`,
    );
    try {
      await this.assertWorkspaceAccess(params.workspaceId, userId);

      if (!params.agentId) {
        throw createInvalidParamsError('agentId is required');
      }

      if (!params.status) {
        throw createInvalidParamsError(
          'status is required (idle, working, paused)',
        );
      }

      // Verify the agent exists
      const agent = await this.agentsService.getAgent(
        params.agentId,
        params.workspaceId,
      );
      if (!agent) {
        throw createResourceNotFoundError('Agent', params.agentId);
      }

      // Log the status change as activity
      await this.agentsService.logActivity(
        params.agentId,
        params.workspaceId,
        'status_change',
        {
          previousStatus: agent.metadata?.workingStatus || 'unknown',
          newStatus: params.status,
          reason: params.reason,
        },
      );

      // Update agent metadata with the new status
      const updatedAgent = await this.agentsService.updateAgent(
        params.agentId,
        params.workspaceId,
        {
          metadata: {
            ...(agent.metadata || {}),
            workingStatus: params.status,
            lastStatusUpdate: new Date().toISOString(),
          },
        },
      );

      return {
        agentId: params.agentId,
        status: params.status,
        updatedAt: new Date().toISOString(),
      };
    } catch (error: any) {
      this.logger.error(
        `Error in agent.updateStatus: ${error.message || 'Unknown error'}`,
        error.stack,
      );

      if (error.code && typeof error.code === 'number') {
        throw error;
      }

      throw createInternalError(error.message || String(error));
    }
  }

  /**
   * Log agent activity for audit trail
   * Method: agent.logActivity
   */
  async logActivity(params: any, userId: string) {
    this.logger.debug(
      `ParallaxAgentHandler.logActivity called for user ${userId}`,
    );
    try {
      await this.assertWorkspaceAccess(params.workspaceId, userId);

      if (!params.agentId) {
        throw createInvalidParamsError('agentId is required');
      }

      if (!params.actionType) {
        throw createInvalidParamsError('actionType is required');
      }

      // Verify the agent exists
      const agent = await this.agentsService.getAgent(
        params.agentId,
        params.workspaceId,
      );
      if (!agent) {
        throw createResourceNotFoundError('Agent', params.agentId);
      }

      const activity = await this.agentsService.logActivity(
        params.agentId,
        params.workspaceId,
        params.actionType,
        params.details || {},
        params.projectId,
        params.taskId,
        params.pageId,
      );

      return {
        success: true,
        activityId: activity.id,
        timestamp: activity.createdAt,
      };
    } catch (error: any) {
      this.logger.error(
        `Error in agent.logActivity: ${error.message || 'Unknown error'}`,
        error.stack,
      );

      if (error.code && typeof error.code === 'number') {
        throw error;
      }

      throw createInternalError(error.message || String(error));
    }
  }

  /**
   * List agents in the workspace
   * Method: agent.listWorkspace
   */
  async listWorkspace(params: any, userId: string) {
    this.logger.debug(
      `ParallaxAgentHandler.listWorkspace called for user ${userId}`,
    );
    try {
      await this.assertWorkspaceAccess(params.workspaceId, userId);

      const agents = await this.agentsService.getAvailableAgents(
        params.workspaceId,
        params.capabilities,
      );

      return {
        agents: agents.map((agent) => ({
          id: agent.id,
          name: agent.name,
          capabilities: agent.capabilities,
          status: agent.status,
          workingStatus: agent.metadata?.workingStatus || 'unknown',
          grantedPermissions: agent.grantedPermissions,
        })),
        total: agents.length,
      };
    } catch (error: any) {
      this.logger.error(
        `Error in agent.listWorkspace: ${error.message || 'Unknown error'}`,
        error.stack,
      );

      if (error.code && typeof error.code === 'number') {
        throw error;
      }

      throw createInternalError(error.message || String(error));
    }
  }

  /**
   * Claim an available task (requires task to be agent_live)
   * Method: agent.claimTask
   */
  async claimTask(params: any, userId: string) {
    this.logger.debug(
      `ParallaxAgentHandler.claimTask called for user ${userId}`,
    );
    try {
      await this.assertWorkspaceAccess(params.workspaceId, userId);

      if (!params.agentId) {
        throw createInvalidParamsError('agentId is required');
      }

      if (!params.taskId) {
        throw createInvalidParamsError('taskId is required');
      }

      // Verify the agent exists and is approved
      const agent = await this.agentsService.getAgent(
        params.agentId,
        params.workspaceId,
      );
      if (!agent) {
        throw createResourceNotFoundError('Agent', params.agentId);
      }

      if (agent.status !== 'approved') {
        throw createPermissionDeniedError(
          'Agent must be approved to claim tasks',
        );
      }

      // Assign the agent to the task
      const assignment = await this.agentsService.assignToTask(
        params.agentId,
        params.workspaceId,
        params.taskId,
        userId, // The user context that authorized this action
      );

      // Log the claim activity
      await this.agentsService.logActivity(
        params.agentId,
        params.workspaceId,
        'task_claimed',
        {
          taskId: params.taskId,
        },
        undefined,
        params.taskId,
      );

      return {
        success: true,
        assignment: assignment,
      };
    } catch (error: any) {
      this.logger.error(
        `Error in agent.claimTask: ${error.message || 'Unknown error'}`,
        error.stack,
      );

      if (error.code && typeof error.code === 'number') {
        throw error;
      }

      throw createInternalError(error.message || String(error));
    }
  }

  /**
   * Delegate a task to another agent
   * Method: agent.delegate
   * Note: This operation may require approval depending on workspace settings
   */
  async delegate(params: any, userId: string) {
    this.logger.debug(`ParallaxAgentHandler.delegate called for user ${userId}`);
    try {
      await this.assertWorkspaceAccess(params.workspaceId, userId);

      if (!params.fromAgentId) {
        throw createInvalidParamsError('fromAgentId is required');
      }

      if (!params.toAgentId) {
        throw createInvalidParamsError('toAgentId is required');
      }

      if (!params.taskId) {
        throw createInvalidParamsError('taskId is required');
      }

      // Verify both agents exist
      const fromAgent = await this.agentsService.getAgent(
        params.fromAgentId,
        params.workspaceId,
      );
      if (!fromAgent) {
        throw createResourceNotFoundError('From Agent', params.fromAgentId);
      }

      const toAgent = await this.agentsService.getAgent(
        params.toAgentId,
        params.workspaceId,
      );
      if (!toAgent) {
        throw createResourceNotFoundError('To Agent', params.toAgentId);
      }

      if (toAgent.status !== 'approved') {
        throw createPermissionDeniedError(
          'Target agent must be approved to receive delegations',
        );
      }

      // Unassign from the source agent (find the assignment first)
      const fromAssignments = await this.agentsService.getAgentAssignments(
        params.fromAgentId,
      );
      const taskAssignment = fromAssignments.find(
        (a) => a.taskId === params.taskId,
      );

      if (taskAssignment) {
        await this.agentsService.unassign(taskAssignment.id);
      }

      // Assign to the target agent
      const newAssignment = await this.agentsService.assignToTask(
        params.toAgentId,
        params.workspaceId,
        params.taskId,
        userId,
      );

      // Log delegation activity for both agents
      await this.agentsService.logActivity(
        params.fromAgentId,
        params.workspaceId,
        'task_delegated',
        {
          taskId: params.taskId,
          toAgentId: params.toAgentId,
          toAgentName: toAgent.name,
          reason: params.reason,
        },
        undefined,
        params.taskId,
      );

      await this.agentsService.logActivity(
        params.toAgentId,
        params.workspaceId,
        'task_received',
        {
          taskId: params.taskId,
          fromAgentId: params.fromAgentId,
          fromAgentName: fromAgent.name,
          reason: params.reason,
        },
        undefined,
        params.taskId,
      );

      return {
        success: true,
        delegation: {
          fromAgent: { id: fromAgent.id, name: fromAgent.name },
          toAgent: { id: toAgent.id, name: toAgent.name },
          taskId: params.taskId,
          assignment: newAssignment,
        },
      };
    } catch (error: any) {
      this.logger.error(
        `Error in agent.delegate: ${error.message || 'Unknown error'}`,
        error.stack,
      );

      if (error.code && typeof error.code === 'number') {
        throw error;
      }

      throw createInternalError(error.message || String(error));
    }
  }

  /**
   * Get agent's recent activity
   * Method: agent.activity
   */
  async activity(params: any, userId: string) {
    this.logger.debug(
      `ParallaxAgentHandler.activity called for user ${userId}`,
    );
    try {
      await this.assertWorkspaceAccess(params.workspaceId, userId);

      if (!params.agentId) {
        throw createInvalidParamsError('agentId is required');
      }

      const activities = await this.agentsService.getAgentActivity(
        params.agentId,
        params.workspaceId,
        params.limit || 50,
      );

      return {
        agentId: params.agentId,
        activities: activities,
        total: activities.length,
      };
    } catch (error: any) {
      this.logger.error(
        `Error in agent.activity: ${error.message || 'Unknown error'}`,
        error.stack,
      );

      if (error.code && typeof error.code === 'number') {
        throw error;
      }

      throw createInternalError(error.message || String(error));
    }
  }

  /**
   * Get agent's profile and capabilities
   * Method: agent.profile
   */
  async profile(params: any, userId: string) {
    this.logger.debug(`ParallaxAgentHandler.profile called for user ${userId}`);
    try {
      await this.assertWorkspaceAccess(params.workspaceId, userId);

      if (!params.agentId) {
        throw createInvalidParamsError('agentId is required');
      }

      const agent = await this.agentsService.getAgent(
        params.agentId,
        params.workspaceId,
      );
      if (!agent) {
        throw createResourceNotFoundError('Agent', params.agentId);
      }

      return {
        id: agent.id,
        name: agent.name,
        capabilities: agent.capabilities,
        requestedPermissions: agent.requestedPermissions,
        grantedPermissions: agent.grantedPermissions,
        status: agent.status,
        metadata: agent.metadata,
        endpoint: agent.endpoint,
        resolvedAt: agent.resolvedAt,
        resolvedBy: agent.resolvedBy,
        createdAt: agent.createdAt,
      };
    } catch (error: any) {
      this.logger.error(
        `Error in agent.profile: ${error.message || 'Unknown error'}`,
        error.stack,
      );

      if (error.code && typeof error.code === 'number') {
        throw error;
      }

      throw createInternalError(error.message || String(error));
    }
  }
}
