import { Injectable, Logger } from '@nestjs/common';
import { GoalService } from '../../../core/goal/goal.service';
import { UserService } from '../../../core/user/user.service';
import { WorkspaceService } from '../../../core/workspace/services/workspace.service';
import {
  createInternalError,
  createInvalidParamsError,
  createPermissionDeniedError,
  createResourceNotFoundError,
} from '../utils/error.utils';

/**
 * Handler for goal-related MCP operations
 *
 * Goals are personal to each user - agents can only access goals
 * belonging to the authenticated user making the request.
 */
@Injectable()
export class GoalHandler {
  private readonly logger = new Logger(GoalHandler.name);

  constructor(
    private readonly goalService: GoalService,
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
   * List goals for the authenticated user
   */
  async list(params: any, userId: string) {
    this.logger.debug(`GoalHandler.list called for user ${userId}`);
    try {
      await this.assertWorkspaceAccess(params.workspaceId, userId);

      return await this.goalService.listGoals(
        params.workspaceId,
        userId, // Always scoped to the authenticated user
        params.spaceId,
      );
    } catch (error: any) {
      this.logger.error(
        `Error in goal.list: ${error.message || 'Unknown error'}`,
        error.stack,
      );
      if (error.code && typeof error.code === 'number') {
        throw error;
      }
      throw createInternalError(error.message || String(error));
    }
  }

  /**
   * Create a new goal for the authenticated user
   */
  async create(params: any, userId: string) {
    this.logger.debug(`GoalHandler.create called for user ${userId}`);
    try {
      await this.assertWorkspaceAccess(params.workspaceId, userId);

      if (!params.name) {
        throw createInvalidParamsError('name is required');
      }
      if (!params.horizon) {
        throw createInvalidParamsError(
          'horizon is required (short, mid, or long)',
        );
      }

      return await this.goalService.createGoal({
        workspaceId: params.workspaceId,
        creatorId: userId, // Always the authenticated user
        spaceId: params.spaceId,
        name: params.name,
        horizon: params.horizon,
        description: params.description,
        keywords: params.keywords,
      });
    } catch (error: any) {
      this.logger.error(
        `Error in goal.create: ${error.message || 'Unknown error'}`,
        error.stack,
      );
      if (error.code && typeof error.code === 'number') {
        throw error;
      }
      throw createInternalError(error.message || String(error));
    }
  }

  /**
   * Update a goal owned by the authenticated user
   */
  async update(params: any, userId: string) {
    this.logger.debug(`GoalHandler.update called for user ${userId}`);
    try {
      await this.assertWorkspaceAccess(params.workspaceId, userId);

      if (!params.goalId) {
        throw createInvalidParamsError('goalId is required');
      }

      return await this.goalService.updateGoal({
        goalId: params.goalId,
        workspaceId: params.workspaceId,
        creatorId: userId, // Enforces ownership check
        spaceId: params.spaceId,
        name: params.name,
        horizon: params.horizon,
        description: params.description,
        keywords: params.keywords,
      });
    } catch (error: any) {
      this.logger.error(
        `Error in goal.update: ${error.message || 'Unknown error'}`,
        error.stack,
      );
      if (error.code && typeof error.code === 'number') {
        throw error;
      }
      throw createInternalError(error.message || String(error));
    }
  }

  /**
   * Delete a goal owned by the authenticated user
   */
  async delete(params: any, userId: string) {
    this.logger.debug(`GoalHandler.delete called for user ${userId}`);
    try {
      await this.assertWorkspaceAccess(params.workspaceId, userId);

      if (!params.goalId) {
        throw createInvalidParamsError('goalId is required');
      }

      return await this.goalService.deleteGoal(
        params.workspaceId,
        userId, // Enforces ownership check
        params.goalId,
      );
    } catch (error: any) {
      this.logger.error(
        `Error in goal.delete: ${error.message || 'Unknown error'}`,
        error.stack,
      );
      if (error.code && typeof error.code === 'number') {
        throw error;
      }
      throw createInternalError(error.message || String(error));
    }
  }

  /**
   * Link a task to a goal
   */
  async assignTask(params: any, userId: string) {
    this.logger.debug(`GoalHandler.assignTask called for user ${userId}`);
    try {
      await this.assertWorkspaceAccess(params.workspaceId, userId);

      if (!params.taskId) {
        throw createInvalidParamsError('taskId is required');
      }
      if (!params.goalId) {
        throw createInvalidParamsError('goalId is required');
      }

      return await this.goalService.assignGoal(params.taskId, params.goalId);
    } catch (error: any) {
      this.logger.error(
        `Error in goal.assignTask: ${error.message || 'Unknown error'}`,
        error.stack,
      );
      if (error.code && typeof error.code === 'number') {
        throw error;
      }
      throw createInternalError(error.message || String(error));
    }
  }

  /**
   * Unlink a task from a goal
   */
  async unassignTask(params: any, userId: string) {
    this.logger.debug(`GoalHandler.unassignTask called for user ${userId}`);
    try {
      await this.assertWorkspaceAccess(params.workspaceId, userId);

      if (!params.taskId) {
        throw createInvalidParamsError('taskId is required');
      }
      if (!params.goalId) {
        throw createInvalidParamsError('goalId is required');
      }

      return await this.goalService.unassignGoal(params.taskId, params.goalId);
    } catch (error: any) {
      this.logger.error(
        `Error in goal.unassignTask: ${error.message || 'Unknown error'}`,
        error.stack,
      );
      if (error.code && typeof error.code === 'number') {
        throw error;
      }
      throw createInternalError(error.message || String(error));
    }
  }

  /**
   * Get goals linked to a specific task
   */
  async byTask(params: any, userId: string) {
    this.logger.debug(`GoalHandler.byTask called for user ${userId}`);
    try {
      await this.assertWorkspaceAccess(params.workspaceId, userId);

      if (!params.taskId) {
        throw createInvalidParamsError('taskId is required');
      }

      return await this.goalService.listGoalsForTask(
        params.taskId,
        params.workspaceId,
        userId, // Only returns goals owned by the user
      );
    } catch (error: any) {
      this.logger.error(
        `Error in goal.byTask: ${error.message || 'Unknown error'}`,
        error.stack,
      );
      if (error.code && typeof error.code === 'number') {
        throw error;
      }
      throw createInternalError(error.message || String(error));
    }
  }

  /**
   * Find goals matching text (by keywords)
   */
  async match(params: any, userId: string) {
    this.logger.debug(`GoalHandler.match called for user ${userId}`);
    try {
      await this.assertWorkspaceAccess(params.workspaceId, userId);

      if (!params.text) {
        throw createInvalidParamsError('text is required');
      }

      return await this.goalService.findMatchingGoals(
        params.workspaceId,
        userId, // Only searches user's goals
        params.spaceId,
        params.text,
      );
    } catch (error: any) {
      this.logger.error(
        `Error in goal.match: ${error.message || 'Unknown error'}`,
        error.stack,
      );
      if (error.code && typeof error.code === 'number') {
        throw error;
      }
      throw createInternalError(error.message || String(error));
    }
  }
}
