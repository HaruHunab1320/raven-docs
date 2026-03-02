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

const VALID_STATUSES = ['planned', 'running', 'completed', 'failed'];

@Injectable()
export class ExperimentHandler {
  private readonly logger = new Logger(ExperimentHandler.name);

  constructor(
    private readonly pageService: PageService,
    private readonly pageRepo: PageRepo,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly mcpEventService: MCPEventService,
    private readonly spaceService: SpaceService,
    private readonly researchGraph: ResearchGraphService,
  ) {}

  /**
   * experiment.register — Create an experiment page linked to a hypothesis
   */
  async register(params: any, userId: string): Promise<any> {
    this.logger.debug(`Processing experiment.register for user ${userId}`);

    if (!params.title) {
      throw createInvalidParamsError('title is required');
    }
    if (!params.spaceId) {
      throw createInvalidParamsError('spaceId is required');
    }
    if (!params.workspaceId) {
      throw createInvalidParamsError('workspaceId is required');
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

      // Validate hypothesis exists if provided
      if (params.hypothesisId) {
        const hypothesis = await this.pageRepo.findById(params.hypothesisId);
        if (!hypothesis || hypothesis.pageType !== 'hypothesis') {
          throw createInvalidParamsError(
            'hypothesisId must reference a valid hypothesis page',
          );
        }
      }

      const metadata = {
        status: params.status || 'planned',
        hypothesisId: params.hypothesisId || null,
        method: params.method || null,
        metrics: params.metrics || {},
        results: {},
        passedPredictions: null,
        unexpectedObservations: [],
        suggestedFollowUps: [],
        codeRef: params.codeRef || null,
      };

      const createPageDto = new CreatePageDto();
      createPageDto.title = params.title;
      createPageDto.spaceId = params.spaceId;
      createPageDto.content = params.content || null;
      createPageDto.parentPageId = params.parentPageId;
      createPageDto.pageType = 'experiment';
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
          pageType: 'experiment',
          title: params.title,
          domainTags: params.domainTags || [],
          createdAt: new Date().toISOString(),
        });

        // Auto-create TESTS_HYPOTHESIS edge if linked to a hypothesis
        if (params.hypothesisId) {
          await this.researchGraph.createRelationship({
            fromPageId: page.id,
            toPageId: params.hypothesisId,
            type: 'TESTS_HYPOTHESIS',
            createdBy: userId,
          });
        }
      } catch {
        this.logger.warn(`Failed to sync experiment ${page.id} to graph`);
      }

      this.mcpEventService.createCreatedEvent(
        MCPResourceType.PAGE,
        page.id,
        {
          title: page.title,
          pageType: 'experiment',
          metadata,
        },
        userId,
        space.workspaceId,
        page.spaceId,
      );

      return {
        id: page.id,
        title: page.title,
        pageType: 'experiment',
        metadata,
        spaceId: page.spaceId,
        workspaceId: space.workspaceId,
      };
    } catch (error: any) {
      this.logger.error(
        `Error in experiment.register: ${error?.message || 'Unknown error'}`,
        error?.stack,
      );
      if (error?.code && typeof error.code === 'number') {
        throw error;
      }
      throw createInternalError(error?.message || String(error));
    }
  }

  /**
   * experiment.complete — Record results, update hypothesis, spawn follow-ups
   */
  async complete(params: any, userId: string): Promise<any> {
    this.logger.debug(`Processing experiment.complete for user ${userId}`);

    if (!params.pageId) {
      throw createInvalidParamsError('pageId is required');
    }
    if (!params.results) {
      throw createInvalidParamsError('results is required');
    }

    try {
      const page = await this.pageRepo.findById(params.pageId, {
        includeSpace: true,
      });
      if (!page) {
        throw createResourceNotFoundError('Page', params.pageId);
      }
      if (page.pageType !== 'experiment') {
        throw createInvalidParamsError('Page is not an experiment');
      }

      const user = { id: userId } as User;
      const ability = await this.spaceAbility.createForUser(
        user,
        page.spaceId,
      );
      if (ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page)) {
        throw createPermissionDeniedError(
          'You do not have permission to update this experiment',
        );
      }

      const existingMetadata =
        (page.metadata as Record<string, any>) || {};
      const updatedMetadata = {
        ...existingMetadata,
        status: params.passed === false ? 'failed' : 'completed',
        results: params.results,
        passedPredictions:
          params.passed !== undefined ? params.passed : null,
        unexpectedObservations:
          params.unexpectedObservations ||
          existingMetadata.unexpectedObservations ||
          [],
        suggestedFollowUps:
          params.suggestedFollowUps ||
          existingMetadata.suggestedFollowUps ||
          [],
      };

      await this.pageRepo.updatePage(
        { metadata: updatedMetadata },
        params.pageId,
      );

      // Create graph edges based on results
      const hypothesisId = existingMetadata.hypothesisId;
      if (hypothesisId) {
        try {
          if (params.passed === true) {
            await this.researchGraph.createRelationship({
              fromPageId: page.id,
              toPageId: hypothesisId,
              type: 'VALIDATES',
              createdBy: userId,
              metadata: { results: params.results },
            });
          } else if (params.passed === false) {
            await this.researchGraph.createRelationship({
              fromPageId: page.id,
              toPageId: hypothesisId,
              type: 'CONTRADICTS',
              createdBy: userId,
              metadata: { results: params.results },
            });
          }
        } catch {
          this.logger.warn(
            `Failed to create evidence edge for experiment ${page.id}`,
          );
        }
      }

      this.mcpEventService.createUpdatedEvent(
        MCPResourceType.PAGE,
        page.id,
        {
          title: page.title,
          pageType: 'experiment',
          status: updatedMetadata.status,
          passed: params.passed,
        },
        userId,
        page.workspaceId,
        page.spaceId,
      );

      return {
        id: page.id,
        title: page.title,
        pageType: 'experiment',
        metadata: updatedMetadata,
        hypothesisId,
        evidenceType: params.passed === true
          ? 'VALIDATES'
          : params.passed === false
            ? 'CONTRADICTS'
            : null,
      };
    } catch (error: any) {
      this.logger.error(
        `Error in experiment.complete: ${error?.message || 'Unknown error'}`,
        error?.stack,
      );
      if (error?.code && typeof error.code === 'number') {
        throw error;
      }
      throw createInternalError(error?.message || String(error));
    }
  }

  /**
   * experiment.get — Get an experiment with its metadata and content
   */
  async get(params: any, userId: string): Promise<any> {
    this.logger.debug(`Processing experiment.get for user ${userId}`);

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
      if (page.pageType !== 'experiment') {
        throw createInvalidParamsError('Page is not an experiment');
      }

      const user = { id: userId } as User;
      const ability = await this.spaceAbility.createForUser(
        user,
        page.spaceId,
      );
      if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
        throw createPermissionDeniedError(
          'You do not have permission to read this experiment',
        );
      }

      return {
        id: page.id,
        title: page.title,
        pageType: 'experiment',
        metadata: page.metadata,
        content: page.content,
      };
    } catch (error: any) {
      this.logger.error(
        `Error in experiment.get: ${error?.message || 'Unknown error'}`,
        error?.stack,
      );
      if (error?.code && typeof error.code === 'number') {
        throw error;
      }
      throw createInternalError(error?.message || String(error));
    }
  }

  /**
   * experiment.update — Update experiment status and metadata
   */
  async update(params: any, userId: string): Promise<any> {
    this.logger.debug(`Processing experiment.update for user ${userId}`);

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
      if (page.pageType !== 'experiment') {
        throw createInvalidParamsError('Page is not an experiment');
      }

      const user = { id: userId } as User;
      const ability = await this.spaceAbility.createForUser(
        user,
        page.spaceId,
      );
      if (ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page)) {
        throw createPermissionDeniedError(
          'You do not have permission to update this experiment',
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
      if (params.method !== undefined) {
        updatedMetadata.method = params.method;
      }
      if (params.metrics !== undefined) {
        updatedMetadata.metrics = params.metrics;
      }
      if (params.codeRef !== undefined) {
        updatedMetadata.codeRef = params.codeRef;
      }

      const updateData: any = { metadata: updatedMetadata };
      if (params.title) {
        updateData.title = params.title;
      }
      if (params.content !== undefined) {
        updateData.content = params.content;
      }

      await this.pageRepo.updatePage(updateData, params.pageId);

      this.mcpEventService.createUpdatedEvent(
        MCPResourceType.PAGE,
        page.id,
        {
          title: params.title || page.title,
          pageType: 'experiment',
          metadata: updatedMetadata,
        },
        userId,
        page.workspaceId,
        page.spaceId,
      );

      return {
        id: page.id,
        title: params.title || page.title,
        pageType: 'experiment',
        metadata: updatedMetadata,
      };
    } catch (error: any) {
      this.logger.error(
        `Error in experiment.update: ${error?.message || 'Unknown error'}`,
        error?.stack,
      );
      if (error?.code && typeof error.code === 'number') {
        throw error;
      }
      throw createInternalError(error?.message || String(error));
    }
  }
}
