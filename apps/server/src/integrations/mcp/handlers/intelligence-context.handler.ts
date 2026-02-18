import { Injectable, Logger } from '@nestjs/common';
import SpaceAbilityFactory from '../../../core/casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../../core/casl/interfaces/space-ability.type';
import {
  createInternalError,
  createInvalidParamsError,
  createPermissionDeniedError,
} from '../utils/error.utils';
import { User } from '@raven-docs/db/types/entity.types';
import { ContextAssemblyService } from '../../../core/context-assembly/context-assembly.service';

/**
 * Handler for context.query MCP operations — "What do we know about X?"
 * Named intelligence-context to avoid collision with existing context.handler.ts
 */
@Injectable()
export class IntelligenceContextHandler {
  private readonly logger = new Logger(IntelligenceContextHandler.name);

  constructor(
    private readonly contextAssembly: ContextAssemblyService,
    private readonly spaceAbility: SpaceAbilityFactory,
  ) {}

  /**
   * intelligence.query — Assemble a ContextBundle for a given query
   */
  async query(params: any, userId: string): Promise<any> {
    this.logger.debug(`Processing intelligence.query for user ${userId}`);

    if (!params.query) {
      throw createInvalidParamsError('query is required');
    }
    if (!params.workspaceId) {
      throw createInvalidParamsError('workspaceId is required');
    }

    try {
      if (params.spaceId) {
        const user = { id: userId } as User;
        const ability = await this.spaceAbility.createForUser(
          user,
          params.spaceId,
        );
        if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
          throw createPermissionDeniedError(
            'You do not have permission to query context in this space',
          );
        }
      }

      const bundle = await this.contextAssembly.assembleContext(
        params.query,
        params.workspaceId,
        params.spaceId,
      );

      return {
        query: bundle.query,
        directHits: bundle.directHits.map((p) => ({
          id: p.id,
          title: p.title,
          pageType: p.pageType,
          metadata: p.metadata,
        })),
        relatedWork: bundle.relatedWork.map((p) => ({
          id: p.id,
          title: p.title,
          pageType: p.pageType,
          metadata: p.metadata,
        })),
        timeline: bundle.timeline.slice(0, 20),
        currentState: {
          validated: bundle.currentState.validated.length,
          refuted: bundle.currentState.refuted.length,
          testing: bundle.currentState.testing.length,
          open: bundle.currentState.open.length,
        },
        openQuestions: bundle.openQuestions.map((q) => ({
          id: q.id,
          title: q.title,
          status: q.status,
        })),
        contradictions: bundle.contradictions,
        experiments: bundle.experiments.map((p) => ({
          id: p.id,
          title: p.title,
          metadata: p.metadata,
        })),
        papers: bundle.papers.map((p) => ({
          id: p.id,
          title: p.title,
          metadata: p.metadata,
        })),
      };
    } catch (error: any) {
      this.logger.error(
        `Error in intelligence.query: ${error?.message || 'Unknown error'}`,
        error?.stack,
      );
      if (error?.code && typeof error.code === 'number') {
        throw error;
      }
      throw createInternalError(error?.message || String(error));
    }
  }
}
