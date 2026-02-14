import { Injectable, Logger } from '@nestjs/common';
import { KnowledgeService } from '../../../core/knowledge/knowledge.service';
import SpaceAbilityFactory from '../../../core/casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../../core/casl/interfaces/space-ability.type';
import {
  createInvalidParamsError,
  createInternalError,
  createPermissionDeniedError,
} from '../utils/error.utils';
import { User } from '@raven-docs/db/types/entity.types';

/**
 * Handler for knowledge-related MCP operations
 * Allows agents to search knowledge sources (documentation, uploaded files, etc.)
 */
@Injectable()
export class KnowledgeHandler {
  private readonly logger = new Logger(KnowledgeHandler.name);

  constructor(
    private readonly knowledgeService: KnowledgeService,
    private readonly spaceAbility: SpaceAbilityFactory,
  ) {}

  /**
   * Handles knowledge.search operation
   * Searches knowledge sources using semantic similarity
   */
  async search(params: any, userId: string): Promise<any> {
    this.logger.debug(`Processing knowledge.search for user ${userId}`);

    // Accept 'query' or 'content' as the search term
    const query = params.query || params.content;
    if (!query) {
      throw createInvalidParamsError('query is required');
    }

    if (!params.workspaceId) {
      throw createInvalidParamsError('workspaceId is required');
    }

    try {
      // Check space permissions if spaceId is provided
      if (params.spaceId) {
        const user = { id: userId } as User;
        const ability = await this.spaceAbility.createForUser(
          user,
          params.spaceId,
        );
        if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
          throw createPermissionDeniedError(
            'You do not have permission to access knowledge in this space',
          );
        }
      }

      const results = await this.knowledgeService.searchKnowledge({
        query,
        workspaceId: params.workspaceId,
        spaceId: params.spaceId,
        limit: params.limit || 5,
      });

      return {
        results: results.map((r) => ({
          content: r.content,
          sourceName: r.sourceName,
          similarity: r.similarity,
          metadata: r.metadata,
        })),
        count: results.length,
      };
    } catch (error: any) {
      this.logger.error(
        `Error searching knowledge: ${error?.message || 'Unknown error'}`,
        error?.stack,
      );
      if (error?.code && typeof error.code === 'number') {
        throw error;
      }
      throw createInternalError(error?.message || String(error));
    }
  }

  /**
   * Handles knowledge.list operation
   * Lists available knowledge sources
   */
  async list(params: any, userId: string): Promise<any> {
    this.logger.debug(`Processing knowledge.list for user ${userId}`);

    if (!params.workspaceId) {
      throw createInvalidParamsError('workspaceId is required');
    }

    try {
      const sources = await this.knowledgeService.listSources({
        workspaceId: params.workspaceId,
        spaceId: params.spaceId,
        includeSystem: true,
      });

      return {
        sources: sources.map((s) => ({
          id: s.id,
          name: s.name,
          type: s.type,
          scope: s.scope,
          status: s.status,
          chunkCount: s.chunkCount,
          lastSyncedAt: s.lastSyncedAt,
        })),
        count: sources.length,
      };
    } catch (error: any) {
      this.logger.error(
        `Error listing knowledge sources: ${error?.message || 'Unknown error'}`,
        error?.stack,
      );
      if (error?.code && typeof error.code === 'number') {
        throw error;
      }
      throw createInternalError(error?.message || String(error));
    }
  }

  /**
   * Handles knowledge.get operation
   * Gets details of a specific knowledge source
   */
  async get(params: any, userId: string): Promise<any> {
    this.logger.debug(`Processing knowledge.get for user ${userId}`);

    if (!params.sourceId) {
      throw createInvalidParamsError('sourceId is required');
    }

    try {
      const source = await this.knowledgeService.getSource(params.sourceId);

      if (!source) {
        return { source: null };
      }

      return {
        source: {
          id: source.id,
          name: source.name,
          type: source.type,
          scope: source.scope,
          status: source.status,
          errorMessage: source.errorMessage,
          chunkCount: source.chunkCount,
          lastSyncedAt: source.lastSyncedAt,
          createdAt: source.createdAt,
        },
      };
    } catch (error: any) {
      this.logger.error(
        `Error getting knowledge source: ${error?.message || 'Unknown error'}`,
        error?.stack,
      );
      if (error?.code && typeof error.code === 'number') {
        throw error;
      }
      throw createInternalError(error?.message || String(error));
    }
  }
}
