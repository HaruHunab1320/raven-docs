import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '../../types/kysely.types';
import { dbOrTx } from '../../utils';

@Injectable()
export class CodingWorkspaceRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async create(
    data: {
      workspaceId: string;
      repoUrl: string;
      branch: string;
      spaceId?: string;
      experimentId?: string;
      workspaceType?: string;
      baseBranch?: string;
      config?: Record<string, any>;
      metadata?: Record<string, any>;
      provisionedBy?: string;
    },
    trx?: KyselyTransaction,
  ) {
    const db = dbOrTx(this.db, trx);
    return db
      .insertInto('codingWorkspaces')
      .values({
        workspaceId: data.workspaceId,
        repoUrl: data.repoUrl,
        branch: data.branch,
        spaceId: data.spaceId || null,
        experimentId: data.experimentId || null,
        workspaceType: data.workspaceType || 'worktree',
        baseBranch: data.baseBranch || 'main',
        config: data.config ? JSON.stringify(data.config) : undefined,
        metadata: data.metadata ? JSON.stringify(data.metadata) : undefined,
        provisionedBy: data.provisionedBy || null,
        status: 'pending',
      })
      .returningAll()
      .executeTakeFirst();
  }

  async findById(id: string, trx?: KyselyTransaction) {
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('codingWorkspaces')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  async findByExperiment(experimentId: string) {
    return this.db
      .selectFrom('codingWorkspaces')
      .selectAll()
      .where('experimentId', '=', experimentId)
      .orderBy('createdAt', 'desc')
      .execute();
  }

  async findByWorkspace(
    workspaceId: string,
    opts?: { status?: string; spaceId?: string },
  ) {
    let query = this.db
      .selectFrom('codingWorkspaces')
      .selectAll()
      .where('workspaceId', '=', workspaceId);

    if (opts?.status) {
      query = query.where('status', '=', opts.status);
    }
    if (opts?.spaceId) {
      query = query.where('spaceId', '=', opts.spaceId);
    }

    return query.orderBy('createdAt', 'desc').execute();
  }

  async updateStatus(
    id: string,
    status: string,
    extras?: Record<string, any>,
    trx?: KyselyTransaction,
  ) {
    const db = dbOrTx(this.db, trx);
    const updateData: any = { status, updatedAt: new Date(), ...extras };
    if (status === 'cleaned') {
      updateData.cleanedAt = new Date();
    }
    return db
      .updateTable('codingWorkspaces')
      .set(updateData)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  async update(id: string, data: Record<string, any>, trx?: KyselyTransaction) {
    const db = dbOrTx(this.db, trx);
    return db
      .updateTable('codingWorkspaces')
      .set({ ...data, updatedAt: new Date() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }
}
