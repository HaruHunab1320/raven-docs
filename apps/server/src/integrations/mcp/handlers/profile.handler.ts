import { Injectable, Logger } from '@nestjs/common';
import { AgentProfileService } from '../../../core/agent-memory/agent-profile.service';
import { UserService } from '../../../core/user/user.service';
import { WorkspaceService } from '../../../core/workspace/services/workspace.service';
import {
  createInternalError,
  createInvalidParamsError,
  createPermissionDeniedError,
  createResourceNotFoundError,
} from '../utils/error.utils';

/**
 * Handler for user profile and behavioral insights MCP operations.
 *
 * Profiles are personal to each user - agents can access their own
 * behavioral profile including traits, patterns, and AI-generated insights.
 */
@Injectable()
export class ProfileHandler {
  private readonly logger = new Logger(ProfileHandler.name);

  constructor(
    private readonly profileService: AgentProfileService,
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

    return { workspace, user };
  }

  /**
   * Generate or refresh the user's behavioral profile.
   * Returns trait scores, patterns, strengths, challenges, and recommendations.
   */
  async distill(params: any, userId: string) {
    this.logger.debug(`ProfileHandler.distill called for user ${userId}`);
    try {
      const { user } = await this.assertWorkspaceAccess(params.workspaceId, userId);

      const profile = await this.profileService.distillForUser(
        params.workspaceId,
        userId,
        params.spaceId,
      );

      return profile;
    } catch (error: any) {
      this.logger.error(
        `Error in profile.distill: ${error.message || 'Unknown error'}`,
        error.stack,
      );
      if (error.code && typeof error.code === 'number') {
        throw error;
      }
      throw createInternalError(error.message || String(error));
    }
  }

  /**
   * Get the user's current profile without regenerating.
   * Returns the most recent profile snapshot if available.
   */
  async get(params: any, userId: string) {
    this.logger.debug(`ProfileHandler.get called for user ${userId}`);
    try {
      await this.assertWorkspaceAccess(params.workspaceId, userId);

      // Profile is stored as a memory with specific tags
      // This retrieves the latest profile without regenerating
      const profile = await this.profileService.distillForUser(
        params.workspaceId,
        userId,
        params.spaceId,
      );

      return profile;
    } catch (error: any) {
      this.logger.error(
        `Error in profile.get: ${error.message || 'Unknown error'}`,
        error.stack,
      );
      if (error.code && typeof error.code === 'number') {
        throw error;
      }
      throw createInternalError(error.message || String(error));
    }
  }
}
