import { Injectable, Inject, Logger } from '@nestjs/common';
import { KYSELY } from '../../../lib/kysely/nestjs-kysely';
import { DB } from '../../types/db';
import { Kysely, Transaction } from 'kysely';
import {
  InsertableProject,
  Project,
  UpdatableProject,
} from '../../types/entity.types';
import { dbOrTx } from '../../utils';
import { PaginationOptions } from '../../../lib/pagination/pagination-options';
import { Paginated } from '../../../lib/pagination/paginated';
import { paginate } from '../../../lib/pagination/paginate';

@Injectable()
export class ProjectRepo {
  private readonly logger = new Logger(ProjectRepo.name);

  constructor(@Inject(KYSELY) private readonly db: Kysely<DB>) {}

  async findById(
    projectId: string,
    options?: {
      includeCreator?: boolean;
      includeDeleted?: boolean;
    },
    trx?: Transaction<DB>,
  ): Promise<Project | undefined> {
    let query = dbOrTx(this.db, trx)
      .selectFrom('projects')
      .selectAll('projects')
      .where('projects.id', '=', projectId);

    if (!options?.includeDeleted) {
      query = query.where('projects.deletedAt', 'is', null);
    }

    if (options?.includeCreator) {
      query = query
        .leftJoin('users as creator', 'creator.id', 'projects.creatorId')
        .select([
          'creator.id as creator_id',
          'creator.name as creator_name',
          'creator.email as creator_email',
          'creator.avatarUrl as creator_avatar_url',
        ]);
    }

    const project = await query.executeTakeFirst();
    return project as Project | undefined;
  }

  async findBySpaceId(
    spaceId: string,
    pagination: PaginationOptions,
    options?: {
      includeArchived?: boolean;
      includeCreator?: boolean;
      searchTerm?: string;
    },
    trx?: Transaction<DB>,
  ): Promise<Paginated<Project>> {
    let query = dbOrTx(this.db, trx)
      .selectFrom('projects')
      .selectAll('projects')
      .where('projects.spaceId', '=', spaceId)
      .where('projects.deletedAt', 'is', null);

    if (!options?.includeArchived) {
      query = query.where('projects.isArchived', '=', false);
    }

    if (options?.searchTerm) {
      query = query.where((eb) =>
        eb.or([
          eb('projects.name', 'ilike', `%${options.searchTerm}%`),
          eb('projects.description', 'ilike', `%${options.searchTerm}%`),
        ]),
      );
    }

    if (options?.includeCreator) {
      query = query
        .leftJoin('users as creator', 'creator.id', 'projects.creatorId')
        .select([
          'creator.id as creator_id',
          'creator.name as creator_name',
          'creator.email as creator_email',
          'creator.avatarUrl as creator_avatar_url',
        ]);
    }

    this.logger.debug('findBySpaceId query SQL:', query.compile().sql);
    return paginate(query, pagination);
  }

  async findByWorkspaceId(
    workspaceId: string,
    pagination: PaginationOptions,
    options?: {
      includeArchived?: boolean;
      includeCreator?: boolean;
      searchTerm?: string;
    },
    trx?: Transaction<DB>,
  ): Promise<Paginated<Project>> {
    let query = dbOrTx(this.db, trx)
      .selectFrom('projects')
      .selectAll('projects')
      .where('projects.workspaceId', '=', workspaceId)
      .where('projects.deletedAt', 'is', null);

    if (!options?.includeArchived) {
      query = query.where('projects.isArchived', '=', false);
    }

    if (options?.searchTerm) {
      query = query.where((eb) =>
        eb.or([
          eb('projects.name', 'ilike', `%${options.searchTerm}%`),
          eb('projects.description', 'ilike', `%${options.searchTerm}%`),
        ]),
      );
    }

    if (options?.includeCreator) {
      query = query
        .leftJoin('users as creator', 'creator.id', 'projects.creatorId')
        .select([
          'creator.id as creator_id',
          'creator.name as creator_name',
          'creator.email as creator_email',
          'creator.avatarUrl as creator_avatar_url',
        ]);
    }

    this.logger.debug('findByWorkspaceId query SQL:', query.compile().sql);
    return paginate(query, pagination);
  }

  async create(
    projectData: InsertableProject,
    trx?: Transaction<DB>,
  ): Promise<Project> {
    this.logger.debug(
      'ProjectRepo.create called with data:',
      JSON.stringify(projectData, null, 2),
    );
    try {
      const project = await dbOrTx(this.db, trx)
        .insertInto('projects')
        .values(projectData)
        .returningAll()
        .executeTakeFirstOrThrow();

      this.logger.debug(
        'ProjectRepo.create success, returned:',
        JSON.stringify(project, null, 2),
      );
      return project as Project;
    } catch (error) {
      this.logger.error('ProjectRepo.create error:', error);
      throw error;
    }
  }

  async update(
    projectId: string,
    updateData: UpdatableProject,
    trx?: Transaction<DB>,
  ): Promise<Project | undefined> {
    this.logger.debug('ProjectRepo.update called with:', {
      projectId,
      updateData,
    });
    try {
      const project = await dbOrTx(this.db, trx)
        .updateTable('projects')
        .set({ ...updateData, updatedAt: new Date() })
        .where('id', '=', projectId)
        .where('deletedAt', 'is', null)
        .returningAll()
        .executeTakeFirst();

      this.logger.debug('ProjectRepo.update result:', project);
      return project as Project | undefined;
    } catch (error) {
      this.logger.error('ProjectRepo.update error:', error);
      throw error;
    }
  }

  async softDelete(projectId: string, trx?: Transaction<DB>): Promise<void> {
    await dbOrTx(this.db, trx)
      .updateTable('projects')
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where('id', '=', projectId)
      .where('deletedAt', 'is', null)
      .execute();
  }

  async restore(
    projectId: string,
    trx?: Transaction<DB>,
  ): Promise<Project | undefined> {
    const project = await dbOrTx(this.db, trx)
      .updateTable('projects')
      .set({ deletedAt: null, updatedAt: new Date() })
      .where('id', '=', projectId)
      .returningAll()
      .executeTakeFirst();

    return project as Project | undefined;
  }

  async findDeletedBySpaceId(spaceId: string): Promise<Project[]> {
    const projects = await this.db
      .selectFrom('projects')
      .selectAll()
      .where('spaceId', '=', spaceId)
      .where('deletedAt', 'is not', null)
      .orderBy('deletedAt', 'desc')
      .execute();

    return projects as Project[];
  }

  async deleteDeletedBefore(
    cutoff: Date,
    trx?: Transaction<DB>,
  ): Promise<number> {
    const result = await dbOrTx(this.db, trx)
      .deleteFrom('projects')
      .where('deletedAt', '<', cutoff)
      .executeTakeFirst();

    return Number(result?.numDeletedRows || 0);
  }

  async forceDelete(projectId: string, trx?: Transaction<DB>): Promise<void> {
    await dbOrTx(this.db, trx)
      .deleteFrom('projects')
      .where('id', '=', projectId)
      .execute();
  }

  async archive(
    projectId: string,
    trx?: Transaction<DB>,
  ): Promise<Project | undefined> {
    const project = await dbOrTx(this.db, trx)
      .updateTable('projects')
      .set({ isArchived: true, updatedAt: new Date() })
      .where('id', '=', projectId)
      .where('deletedAt', 'is', null)
      .returningAll()
      .executeTakeFirst();

    return project as Project | undefined;
  }

  async unarchive(
    projectId: string,
    trx?: Transaction<DB>,
  ): Promise<Project | undefined> {
    const project = await dbOrTx(this.db, trx)
      .updateTable('projects')
      .set({ isArchived: false, updatedAt: new Date() })
      .where('id', '=', projectId)
      .where('deletedAt', 'is', null)
      .returningAll()
      .executeTakeFirst();

    return project as Project | undefined;
  }
}
