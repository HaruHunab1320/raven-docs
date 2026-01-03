import { Injectable, Logger } from '@nestjs/common';
import { ResearchJobService } from '../../../core/research/research-job.service';
import SpaceAbilityFactory from '../../../core/casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../../core/casl/interfaces/space-ability.type';
import { SpaceService } from '../../../core/space/services/space.service';
import {
  createInternalError,
  createInvalidParamsError,
  createPermissionDeniedError,
  createResourceNotFoundError,
} from '../utils/error.utils';
import { User } from '@raven-docs/db/types/entity.types';

@Injectable()
export class ResearchHandler {
  private readonly logger = new Logger(ResearchHandler.name);

  constructor(
    private readonly researchService: ResearchJobService,
    private readonly spaceService: SpaceService,
    private readonly spaceAbility: SpaceAbilityFactory,
  ) {}

  async create(params: any, userId: string) {
    this.logger.debug(`Processing research.create for user ${userId}`);

    if (!params.workspaceId) {
      throw createInvalidParamsError('workspaceId is required');
    }
    if (!params.spaceId) {
      throw createInvalidParamsError('spaceId is required');
    }
    if (!params.topic) {
      throw createInvalidParamsError('topic is required');
    }

    try {
      await this.spaceService.getSpaceInfo(params.spaceId, params.workspaceId);
      const ability = await this.spaceAbility.createForUser(
        { id: userId } as User,
        params.spaceId,
      );
      if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
        throw createPermissionDeniedError(
          'You do not have permission to create research in this space',
        );
      }

      return await this.researchService.createJob(
        {
          spaceId: params.spaceId,
          topic: params.topic,
          goal: params.goal,
          timeBudgetMinutes: params.timeBudgetMinutes,
          outputMode: params.outputMode,
          sources: params.sources,
          repoTargets: params.repoTargets,
          reportPageId: params.reportPageId,
        },
        userId,
        params.workspaceId,
      );
    } catch (error: any) {
      this.logger.error(
        `Error in research.create: ${error.message || 'Unknown error'}`,
        error.stack,
      );
      if (error?.code && typeof error.code === 'number') {
        throw error;
      }
      throw createInternalError(error?.message || String(error));
    }
  }

  async list(params: any, userId: string) {
    this.logger.debug(`Processing research.list for user ${userId}`);

    if (!params.workspaceId) {
      throw createInvalidParamsError('workspaceId is required');
    }
    if (!params.spaceId) {
      throw createInvalidParamsError('spaceId is required');
    }

    try {
      await this.spaceService.getSpaceInfo(params.spaceId, params.workspaceId);
      const ability = await this.spaceAbility.createForUser(
        { id: userId } as User,
        params.spaceId,
      );
      if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
        throw createPermissionDeniedError(
          'You do not have permission to list research in this space',
        );
      }

      const jobs = await this.researchService.listJobs(
        params.spaceId,
        params.workspaceId,
      );
      return { jobs };
    } catch (error: any) {
      this.logger.error(
        `Error in research.list: ${error.message || 'Unknown error'}`,
        error.stack,
      );
      if (error?.code && typeof error.code === 'number') {
        throw error;
      }
      throw createInternalError(error?.message || String(error));
    }
  }

  async info(params: any, userId: string) {
    this.logger.debug(`Processing research.info for user ${userId}`);

    if (!params.workspaceId) {
      throw createInvalidParamsError('workspaceId is required');
    }
    if (!params.jobId) {
      throw createInvalidParamsError('jobId is required');
    }

    try {
      const job = await this.researchService.getJob(
        params.jobId,
        params.workspaceId,
      );
      if (!job) {
        throw createResourceNotFoundError('ResearchJob', params.jobId);
      }

      const ability = await this.spaceAbility.createForUser(
        { id: userId } as User,
        job.spaceId,
      );
      if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
        throw createPermissionDeniedError(
          'You do not have permission to view this research job',
        );
      }

      return job;
    } catch (error: any) {
      this.logger.error(
        `Error in research.info: ${error.message || 'Unknown error'}`,
        error.stack,
      );
      if (error?.code && typeof error.code === 'number') {
        throw error;
      }
      throw createInternalError(error?.message || String(error));
    }
  }
}
