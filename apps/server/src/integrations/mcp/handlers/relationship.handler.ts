import { Injectable, Logger } from '@nestjs/common';
import { PageRepo } from '../../../database/repos/page/page.repo';
import SpaceAbilityFactory from '../../../core/casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../../core/casl/interfaces/space-ability.type';
import {
  createInternalError,
  createInvalidParamsError,
  createPermissionDeniedError,
  createResourceNotFoundError,
} from '../utils/error.utils';
import { User } from '@raven-docs/db/types/entity.types';
import {
  ResearchGraphService,
  RESEARCH_EDGE_TYPES,
  ResearchEdgeType,
} from '../../../core/research-graph/research-graph.service';

@Injectable()
export class RelationshipHandler {
  private readonly logger = new Logger(RelationshipHandler.name);

  constructor(
    private readonly pageRepo: PageRepo,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly researchGraph: ResearchGraphService,
  ) {}

  /**
   * relationship.create — Add a typed edge between two pages
   */
  async create(params: any, userId: string): Promise<any> {
    this.logger.debug(`Processing relationship.create for user ${userId}`);

    if (!params.fromPageId) {
      throw createInvalidParamsError('fromPageId is required');
    }
    if (!params.toPageId) {
      throw createInvalidParamsError('toPageId is required');
    }
    if (!params.type) {
      throw createInvalidParamsError('type is required');
    }

    const edgeType = params.type.toUpperCase() as ResearchEdgeType;
    if (!RESEARCH_EDGE_TYPES.includes(edgeType)) {
      throw createInvalidParamsError(
        `Invalid relationship type. Must be one of: ${RESEARCH_EDGE_TYPES.join(', ')}`,
      );
    }

    try {
      // Validate both pages exist
      const [fromPage, toPage] = await Promise.all([
        this.pageRepo.findById(params.fromPageId),
        this.pageRepo.findById(params.toPageId),
      ]);

      if (!fromPage) {
        throw createResourceNotFoundError('Page (from)', params.fromPageId);
      }
      if (!toPage) {
        throw createResourceNotFoundError('Page (to)', params.toPageId);
      }

      // Check permission on both pages' spaces
      const user = { id: userId } as User;
      const ability = await this.spaceAbility.createForUser(
        user,
        fromPage.spaceId,
      );
      if (ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page)) {
        throw createPermissionDeniedError(
          'You do not have permission to create relationships from this page',
        );
      }

      await this.researchGraph.createRelationship({
        fromPageId: params.fromPageId,
        toPageId: params.toPageId,
        type: edgeType,
        createdBy: userId,
        metadata: params.metadata || undefined,
      });

      return {
        success: true,
        from: params.fromPageId,
        to: params.toPageId,
        type: edgeType,
      };
    } catch (error: any) {
      this.logger.error(
        `Error in relationship.create: ${error?.message || 'Unknown error'}`,
        error?.stack,
      );
      if (error?.code && typeof error.code === 'number') {
        throw error;
      }
      throw createInternalError(error?.message || String(error));
    }
  }

  /**
   * relationship.remove — Remove a typed edge between two pages
   */
  async remove(params: any, userId: string): Promise<any> {
    this.logger.debug(`Processing relationship.remove for user ${userId}`);

    if (!params.fromPageId) {
      throw createInvalidParamsError('fromPageId is required');
    }
    if (!params.toPageId) {
      throw createInvalidParamsError('toPageId is required');
    }
    if (!params.type) {
      throw createInvalidParamsError('type is required');
    }

    const edgeType = params.type.toUpperCase() as ResearchEdgeType;
    if (!RESEARCH_EDGE_TYPES.includes(edgeType)) {
      throw createInvalidParamsError(
        `Invalid relationship type. Must be one of: ${RESEARCH_EDGE_TYPES.join(', ')}`,
      );
    }

    try {
      const fromPage = await this.pageRepo.findById(params.fromPageId);
      if (!fromPage) {
        throw createResourceNotFoundError('Page (from)', params.fromPageId);
      }

      const user = { id: userId } as User;
      const ability = await this.spaceAbility.createForUser(
        user,
        fromPage.spaceId,
      );
      if (ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page)) {
        throw createPermissionDeniedError(
          'You do not have permission to remove relationships from this page',
        );
      }

      await this.researchGraph.removeRelationship(
        params.fromPageId,
        params.toPageId,
        edgeType,
      );

      return {
        success: true,
        removed: { from: params.fromPageId, to: params.toPageId, type: edgeType },
      };
    } catch (error: any) {
      this.logger.error(
        `Error in relationship.remove: ${error?.message || 'Unknown error'}`,
        error?.stack,
      );
      if (error?.code && typeof error.code === 'number') {
        throw error;
      }
      throw createInternalError(error?.message || String(error));
    }
  }

  /**
   * relationship.list — List edges for a page
   */
  async list(params: any, userId: string): Promise<any> {
    this.logger.debug(`Processing relationship.list for user ${userId}`);

    if (!params.pageId) {
      throw createInvalidParamsError('pageId is required');
    }

    try {
      const page = await this.pageRepo.findById(params.pageId);
      if (!page) {
        throw createResourceNotFoundError('Page', params.pageId);
      }

      const user = { id: userId } as User;
      const ability = await this.spaceAbility.createForUser(
        user,
        page.spaceId,
      );
      if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
        throw createPermissionDeniedError(
          'You do not have permission to view relationships for this page',
        );
      }

      const edges = await this.researchGraph.getRelationships(
        params.pageId,
        {
          direction: params.direction,
          types: params.types,
        },
      );

      return { edges };
    } catch (error: any) {
      this.logger.error(
        `Error in relationship.list: ${error?.message || 'Unknown error'}`,
        error?.stack,
      );
      if (error?.code && typeof error.code === 'number') {
        throw error;
      }
      throw createInternalError(error?.message || String(error));
    }
  }
}
