import { Injectable, Logger } from '@nestjs/common';
import { PageService } from '../../../core/page/services/page.service';
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
import { CreatePageDto } from '../../../core/page/dto/create-page.dto';
import { MCPEventService } from '../services/mcp-event.service';
import { MCPResourceType } from '../interfaces/mcp-event.interface';
import { SpaceService } from '../../../core/space/services/space.service';
import { ResearchGraphService } from '../../../core/research-graph/research-graph.service';

const VALID_STATUSES = [
  'proposed',
  'testing',
  'validated',
  'refuted',
  'inconclusive',
  'superseded',
];

@Injectable()
export class HypothesisHandler {
  private readonly logger = new Logger(HypothesisHandler.name);

  constructor(
    private readonly pageService: PageService,
    private readonly pageRepo: PageRepo,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly mcpEventService: MCPEventService,
    private readonly spaceService: SpaceService,
    private readonly researchGraph: ResearchGraphService,
  ) {}

  /**
   * hypothesis.create — Create a hypothesis page with typed metadata
   */
  async create(params: any, userId: string): Promise<any> {
    this.logger.debug(`Processing hypothesis.create for user ${userId}`);

    if (!params.title) {
      throw createInvalidParamsError('title is required');
    }
    if (!params.spaceId) {
      throw createInvalidParamsError('spaceId is required');
    }
    if (!params.workspaceId) {
      throw createInvalidParamsError('workspaceId is required');
    }
    if (!params.formalStatement) {
      throw createInvalidParamsError('formalStatement is required');
    }

    try {
      const space = await this.spaceService.getSpaceInfo(
        params.spaceId,
        params.workspaceId,
      );
      if (!space) {
        throw createResourceNotFoundError('Space', params.spaceId);
      }

      const user = { id: userId } as User;
      const ability = await this.spaceAbility.createForUser(
        user,
        params.spaceId,
      );
      if (ability.cannot(SpaceCaslAction.Create, SpaceCaslSubject.Page)) {
        throw createPermissionDeniedError(
          'You do not have permission to create pages in this space',
        );
      }

      const metadata = {
        status: params.status || 'proposed',
        formalStatement: params.formalStatement,
        predictions: params.predictions || [],
        prerequisites: params.prerequisites || [],
        priority: params.priority || 'medium',
        domainTags: params.domainTags || [],
        successCriteria: params.successCriteria || null,
        registeredBy: userId,
        approvedBy: null,
      };

      const createPageDto = new CreatePageDto();
      createPageDto.title = params.title;
      createPageDto.spaceId = params.spaceId;
      createPageDto.content = params.content || null;
      createPageDto.parentPageId = params.parentPageId;
      createPageDto.pageType = 'hypothesis';
      createPageDto.metadata = metadata;

      const page = await this.pageService.create(
        userId,
        space.workspaceId,
        createPageDto,
      );

      // Sync to graph
      try {
        await this.researchGraph.syncPageNode({
          id: page.id,
          workspaceId: space.workspaceId,
          spaceId: params.spaceId,
          pageType: 'hypothesis',
          title: params.title,
          domainTags: metadata.domainTags,
          createdAt: new Date().toISOString(),
        });
      } catch {
        this.logger.warn(`Failed to sync hypothesis ${page.id} to graph`);
      }

      this.mcpEventService.createCreatedEvent(
        MCPResourceType.PAGE,
        page.id,
        {
          title: page.title,
          pageType: 'hypothesis',
          metadata,
        },
        userId,
        space.workspaceId,
        page.spaceId,
      );

      return {
        id: page.id,
        title: page.title,
        pageType: 'hypothesis',
        metadata,
        spaceId: page.spaceId,
        workspaceId: space.workspaceId,
      };
    } catch (error: any) {
      this.logger.error(
        `Error in hypothesis.create: ${error?.message || 'Unknown error'}`,
        error?.stack,
      );
      if (error?.code && typeof error.code === 'number') {
        throw error;
      }
      throw createInternalError(error?.message || String(error));
    }
  }

  /**
   * hypothesis.update — Update hypothesis status and metadata
   */
  async update(params: any, userId: string): Promise<any> {
    this.logger.debug(`Processing hypothesis.update for user ${userId}`);

    if (!params.pageId) {
      throw createInvalidParamsError('pageId is required');
    }

    try {
      const page = await this.pageRepo.findById(params.pageId, {
        includeSpace: true,
      });
      if (!page) {
        throw createResourceNotFoundError('Page', params.pageId);
      }
      if (page.pageType !== 'hypothesis') {
        throw createInvalidParamsError('Page is not a hypothesis');
      }

      const user = { id: userId } as User;
      const ability = await this.spaceAbility.createForUser(
        user,
        page.spaceId,
      );
      if (ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page)) {
        throw createPermissionDeniedError(
          'You do not have permission to update this hypothesis',
        );
      }

      const existingMetadata =
        (page.metadata as Record<string, any>) || {};
      const updatedMetadata = { ...existingMetadata };

      if (params.status) {
        if (!VALID_STATUSES.includes(params.status)) {
          throw createInvalidParamsError(
            `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`,
          );
        }
        updatedMetadata.status = params.status;
      }
      if (params.formalStatement !== undefined) {
        updatedMetadata.formalStatement = params.formalStatement;
      }
      if (params.predictions !== undefined) {
        updatedMetadata.predictions = params.predictions;
      }
      if (params.prerequisites !== undefined) {
        updatedMetadata.prerequisites = params.prerequisites;
      }
      if (params.priority !== undefined) {
        updatedMetadata.priority = params.priority;
      }
      if (params.domainTags !== undefined) {
        updatedMetadata.domainTags = params.domainTags;
      }
      if (params.successCriteria !== undefined) {
        updatedMetadata.successCriteria = params.successCriteria;
      }
      if (params.approvedBy !== undefined) {
        updatedMetadata.approvedBy = params.approvedBy;
      }
      if (params.confidence !== undefined) {
        updatedMetadata.confidence = params.confidence;
      }

      const updateData: any = { metadata: updatedMetadata };
      if (params.title) {
        updateData.title = params.title;
      }
      if (params.content !== undefined) {
        updateData.content = params.content;
      }

      await this.pageRepo.updatePage(updateData, params.pageId);

      // Re-sync to graph
      try {
        await this.researchGraph.syncPageNode({
          id: page.id,
          workspaceId: page.workspaceId,
          spaceId: page.spaceId,
          pageType: 'hypothesis',
          title: params.title || page.title,
          domainTags: updatedMetadata.domainTags || [],
          createdAt: page.createdAt?.toString() || new Date().toISOString(),
        });
      } catch {
        this.logger.warn(`Failed to re-sync hypothesis ${page.id} to graph`);
      }

      this.mcpEventService.createUpdatedEvent(
        MCPResourceType.PAGE,
        page.id,
        {
          title: params.title || page.title,
          pageType: 'hypothesis',
          metadata: updatedMetadata,
        },
        userId,
        page.workspaceId,
        page.spaceId,
      );

      return {
        id: page.id,
        title: params.title || page.title,
        pageType: 'hypothesis',
        metadata: updatedMetadata,
      };
    } catch (error: any) {
      this.logger.error(
        `Error in hypothesis.update: ${error?.message || 'Unknown error'}`,
        error?.stack,
      );
      if (error?.code && typeof error.code === 'number') {
        throw error;
      }
      throw createInternalError(error?.message || String(error));
    }
  }

  /**
   * hypothesis.get — Get a hypothesis with its evidence chain
   */
  async get(params: any, userId: string): Promise<any> {
    this.logger.debug(`Processing hypothesis.get for user ${userId}`);

    if (!params.pageId) {
      throw createInvalidParamsError('pageId is required');
    }

    try {
      const page = await this.pageRepo.findById(params.pageId, {
        includeContent: true,
        includeSpace: true,
      });
      if (!page) {
        throw createResourceNotFoundError('Page', params.pageId);
      }
      if (page.pageType !== 'hypothesis') {
        throw createInvalidParamsError('Page is not a hypothesis');
      }

      const user = { id: userId } as User;
      const ability = await this.spaceAbility.createForUser(
        user,
        page.spaceId,
      );
      if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
        throw createPermissionDeniedError(
          'You do not have permission to read this hypothesis',
        );
      }

      // Get evidence chain from graph
      let evidenceChain: any = { supporting: [], contradicting: [], testing: [] };
      try {
        evidenceChain = await this.researchGraph.getEvidenceChain(
          params.pageId,
        );
      } catch {
        // Graph may not have data yet
      }

      return {
        id: page.id,
        title: page.title,
        pageType: 'hypothesis',
        metadata: page.metadata,
        content: page.content,
        evidenceChain,
      };
    } catch (error: any) {
      this.logger.error(
        `Error in hypothesis.get: ${error?.message || 'Unknown error'}`,
        error?.stack,
      );
      if (error?.code && typeof error.code === 'number') {
        throw error;
      }
      throw createInternalError(error?.message || String(error));
    }
  }
}
