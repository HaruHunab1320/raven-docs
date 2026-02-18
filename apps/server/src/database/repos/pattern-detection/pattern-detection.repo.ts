import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@raven-docs/db/types/kysely.types';

@Injectable()
export class PatternDetectionRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async create(data: {
    workspaceId: string;
    spaceId?: string;
    patternType: string;
    severity: string;
    title: string;
    details: Record<string, any>;
  }) {
    return this.db
      .insertInto('patternDetections')
      .values({
        workspaceId: data.workspaceId,
        spaceId: data.spaceId || null,
        patternType: data.patternType,
        severity: data.severity,
        title: data.title,
        details: JSON.stringify(data.details),
      })
      .returningAll()
      .executeTakeFirst();
  }

  async findById(id: string) {
    return this.db
      .selectFrom('patternDetections')
      .selectAll()
      .where('id', '=', id)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
  }

  async listByWorkspace(
    workspaceId: string,
    opts?: {
      spaceId?: string;
      status?: string;
      patternType?: string;
      limit?: number;
    },
  ) {
    let query = this.db
      .selectFrom('patternDetections')
      .selectAll()
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null);

    if (opts?.spaceId) {
      query = query.where('spaceId', '=', opts.spaceId);
    }
    if (opts?.status) {
      query = query.where('status', '=', opts.status);
    }
    if (opts?.patternType) {
      query = query.where('patternType', '=', opts.patternType);
    }

    return query
      .orderBy('detectedAt', 'desc')
      .limit(opts?.limit || 100)
      .execute();
  }

  async updateStatus(
    id: string,
    status: string,
    actionTaken?: Record<string, any>,
  ) {
    const updates: Record<string, any> = {
      status,
      updatedAt: new Date(),
    };
    if (status === 'acknowledged') {
      updates.acknowledgedAt = new Date();
    }
    if (actionTaken) {
      updates.actionTaken = JSON.stringify(actionTaken);
    }

    return this.db
      .updateTable('patternDetections')
      .set(updates)
      .where('id', '=', id)
      .where('deletedAt', 'is', null)
      .returningAll()
      .executeTakeFirst();
  }

  async findExistingPattern(
    workspaceId: string,
    patternType: string,
    detailsKey: string,
    detailsValue: string,
  ) {
    return this.db
      .selectFrom('patternDetections')
      .selectAll()
      .where('workspaceId', '=', workspaceId)
      .where('patternType', '=', patternType)
      .where('status', '!=', 'dismissed')
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
  }
}
