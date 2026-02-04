import { Injectable, Logger } from '@nestjs/common';
import { WeeklyReviewService } from '../../../core/agent/weekly-review.service';
import { AgentReviewPromptsService } from '../../../core/agent/agent-review-prompts.service';
import { UserService } from '../../../core/user/user.service';
import { WorkspaceService } from '../../../core/workspace/services/workspace.service';
import SpaceAbilityFactory from '../../../core/casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../../core/casl/interfaces/space-ability.type';
import { User } from '@raven-docs/db/types/entity.types';
import {
  createInternalError,
  createInvalidParamsError,
  createPermissionDeniedError,
  createResourceNotFoundError,
} from '../utils/error.utils';

/**
 * Handler for weekly review MCP operations.
 *
 * Weekly reviews are personal to each user - agents can create review pages,
 * manage review prompts, and track their reflection process.
 */
@Injectable()
export class ReviewHandler {
  private readonly logger = new Logger(ReviewHandler.name);

  constructor(
    private readonly weeklyReviewService: WeeklyReviewService,
    private readonly reviewPromptsService: AgentReviewPromptsService,
    private readonly userService: UserService,
    private readonly workspaceService: WorkspaceService,
    private readonly spaceAbility: SpaceAbilityFactory,
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

  private getWeekKey(date = new Date()) {
    const firstDay = new Date(date.getFullYear(), 0, 1);
    const dayOffset = firstDay.getDay() || 7;
    const weekStart = new Date(firstDay);
    weekStart.setDate(firstDay.getDate() + (7 - dayOffset));
    const diff =
      date.getTime() -
      new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate())
        .getTime();
    const weekNumber = Math.ceil((diff / (1000 * 60 * 60 * 24) + 1) / 7);
    return `${date.getFullYear()}-W${String(weekNumber).padStart(2, '0')}`;
  }

  /**
   * Ensure a weekly review page exists for the current week.
   * Creates the page if it doesn't exist, with standard GTD sections.
   */
  async ensurePage(params: any, userId: string) {
    this.logger.debug(`ReviewHandler.ensurePage called for user ${userId}`);
    try {
      await this.assertWorkspaceAccess(params.workspaceId, userId);

      if (!params.spaceId) {
        throw createInvalidParamsError('spaceId is required');
      }

      const ability = await this.spaceAbility.createForUser(
        { id: userId } as User,
        params.spaceId,
      );
      if (ability.cannot(SpaceCaslAction.Create, SpaceCaslSubject.Page)) {
        throw createPermissionDeniedError(
          'You do not have permission to create pages in this space',
        );
      }

      const result = await this.weeklyReviewService.ensureWeeklyReviewPage({
        spaceId: params.spaceId,
        workspaceId: params.workspaceId,
        userId,
      });

      return { page: result.page, status: result.status };
    } catch (error: any) {
      this.logger.error(
        `Error in review.ensurePage: ${error.message || 'Unknown error'}`,
        error.stack,
      );
      if (error.code && typeof error.code === 'number') {
        throw error;
      }
      throw createInternalError(error.message || String(error));
    }
  }

  /**
   * Create review prompts/questions for the user to reflect on.
   * These will appear in the weekly review page.
   */
  async createPrompts(params: any, userId: string) {
    this.logger.debug(`ReviewHandler.createPrompts called for user ${userId}`);
    try {
      await this.assertWorkspaceAccess(params.workspaceId, userId);

      if (!params.spaceId) {
        throw createInvalidParamsError('spaceId is required');
      }
      if (!params.questions || !Array.isArray(params.questions)) {
        throw createInvalidParamsError('questions array is required');
      }

      const weekKey = params.weekKey || this.getWeekKey();

      const prompts = await this.reviewPromptsService.createPrompts({
        workspaceId: params.workspaceId,
        spaceId: params.spaceId,
        creatorId: userId,
        weekKey,
        questions: params.questions,
        source: params.source || 'agent',
      });

      return { prompts };
    } catch (error: any) {
      this.logger.error(
        `Error in review.createPrompts: ${error.message || 'Unknown error'}`,
        error.stack,
      );
      if (error.code && typeof error.code === 'number') {
        throw error;
      }
      throw createInternalError(error.message || String(error));
    }
  }

  /**
   * List pending review prompts for the current week.
   * Returns questions that haven't been addressed yet.
   */
  async listPending(params: any, userId: string) {
    this.logger.debug(`ReviewHandler.listPending called for user ${userId}`);
    try {
      await this.assertWorkspaceAccess(params.workspaceId, userId);

      if (!params.spaceId) {
        throw createInvalidParamsError('spaceId is required');
      }

      const weekKey = params.weekKey || this.getWeekKey();

      const prompts = await this.reviewPromptsService.listPending({
        workspaceId: params.workspaceId,
        spaceId: params.spaceId,
        creatorId: userId,
        weekKey,
      });

      return { prompts };
    } catch (error: any) {
      this.logger.error(
        `Error in review.listPending: ${error.message || 'Unknown error'}`,
        error.stack,
      );
      if (error.code && typeof error.code === 'number') {
        throw error;
      }
      throw createInternalError(error.message || String(error));
    }
  }
}
