import { Injectable, Logger } from '@nestjs/common';
import { AgentInsightsService } from '../../../core/agent-memory/agent-insights.service';
import { AgentMemoryService } from '../../../core/agent-memory/agent-memory.service';
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
 * Handler for insights and summaries MCP operations.
 *
 * Provides access to AI-generated summaries, entity relationship graphs,
 * and memory analysis - all scoped to the authenticated user.
 */
@Injectable()
export class InsightsHandler {
  private readonly logger = new Logger(InsightsHandler.name);

  constructor(
    private readonly insightsService: AgentInsightsService,
    private readonly memoryService: AgentMemoryService,
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

  /**
   * Generate a summary for a space (daily, weekly, or monthly).
   */
  async generateSummary(params: any, userId: string) {
    this.logger.debug(`InsightsHandler.generateSummary called for user ${userId}`);
    try {
      await this.assertWorkspaceAccess(params.workspaceId, userId);

      if (!params.spaceId) {
        throw createInvalidParamsError('spaceId is required');
      }

      const ability = await this.spaceAbility.createForUser(
        { id: userId } as User,
        params.spaceId,
      );
      if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
        throw createPermissionDeniedError(
          'You do not have permission to access this space',
        );
      }

      const period = params.period || 'daily';
      if (!['daily', 'weekly', 'monthly'].includes(period)) {
        throw createInvalidParamsError('period must be daily, weekly, or monthly');
      }

      const result = await this.insightsService.generateSummaryForSpace({
        spaceId: params.spaceId,
        workspaceId: params.workspaceId,
        userId,
        period,
      });

      return result;
    } catch (error: any) {
      this.logger.error(
        `Error in insights.generateSummary: ${error.message || 'Unknown error'}`,
        error.stack,
      );
      if (error.code && typeof error.code === 'number') {
        throw error;
      }
      throw createInternalError(error.message || String(error));
    }
  }

  /**
   * Get the memory/entity graph showing relationships between
   * entities mentioned in the user's memories.
   */
  async graph(params: any, userId: string) {
    this.logger.debug(`InsightsHandler.graph called for user ${userId}`);
    try {
      await this.assertWorkspaceAccess(params.workspaceId, userId);

      const graph = await this.memoryService.getMemoryGraph({
        workspaceId: params.workspaceId,
        spaceId: params.spaceId,
        creatorId: userId,
        limit: params.limit || 100,
      });

      return graph;
    } catch (error: any) {
      this.logger.error(
        `Error in insights.graph: ${error.message || 'Unknown error'}`,
        error.stack,
      );
      if (error.code && typeof error.code === 'number') {
        throw error;
      }
      throw createInternalError(error.message || String(error));
    }
  }

  /**
   * Get memories related to a specific entity.
   */
  async entityMemories(params: any, userId: string) {
    this.logger.debug(`InsightsHandler.entityMemories called for user ${userId}`);
    try {
      await this.assertWorkspaceAccess(params.workspaceId, userId);

      if (!params.entityId) {
        throw createInvalidParamsError('entityId is required');
      }

      const memories = await this.memoryService.getEntityMemories({
        workspaceId: params.workspaceId,
        spaceId: params.spaceId,
        creatorId: userId,
        entityId: params.entityId,
        limit: params.limit || 50,
      });

      return { memories };
    } catch (error: any) {
      this.logger.error(
        `Error in insights.entityMemories: ${error.message || 'Unknown error'}`,
        error.stack,
      );
      if (error.code && typeof error.code === 'number') {
        throw error;
      }
      throw createInternalError(error.message || String(error));
    }
  }

  /**
   * Get details about a specific entity including related memories.
   */
  async entityDetails(params: any, userId: string) {
    this.logger.debug(`InsightsHandler.entityDetails called for user ${userId}`);
    try {
      await this.assertWorkspaceAccess(params.workspaceId, userId);

      if (!params.entityId) {
        throw createInvalidParamsError('entityId is required');
      }

      const details = await this.memoryService.getEntityDetails({
        workspaceId: params.workspaceId,
        spaceId: params.spaceId,
        creatorId: userId,
        entityId: params.entityId,
      });

      return details;
    } catch (error: any) {
      this.logger.error(
        `Error in insights.entityDetails: ${error.message || 'Unknown error'}`,
        error.stack,
      );
      if (error.code && typeof error.code === 'number') {
        throw error;
      }
      throw createInternalError(error.message || String(error));
    }
  }

  /**
   * List the most frequently mentioned entities in the user's memories.
   */
  async topEntities(params: any, userId: string) {
    this.logger.debug(`InsightsHandler.topEntities called for user ${userId}`);
    try {
      await this.assertWorkspaceAccess(params.workspaceId, userId);

      const entities = await this.memoryService.listTopEntities({
        workspaceId: params.workspaceId,
        spaceId: params.spaceId,
        creatorId: userId,
        limit: params.limit || 20,
      });

      return { entities };
    } catch (error: any) {
      this.logger.error(
        `Error in insights.topEntities: ${error.message || 'Unknown error'}`,
        error.stack,
      );
      if (error.code && typeof error.code === 'number') {
        throw error;
      }
      throw createInternalError(error.message || String(error));
    }
  }
}
