import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '../../types/kysely.types';
import { dbOrTx } from '../../utils';

@Injectable()
export class SwarmExecutionRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async create(
    data: {
      workspaceId: string;
      taskDescription: string;
      spaceId?: string;
      experimentId?: string;
      codingWorkspaceId?: string;
      agentType?: string;
      taskContext?: Record<string, any>;
      config?: Record<string, any>;
      metadata?: Record<string, any>;
      triggeredBy?: string;
    },
    trx?: KyselyTransaction,
  ) {
    const db = dbOrTx(this.db, trx);
    return db
      .insertInto('swarmExecutions')
      .values({
        workspaceId: data.workspaceId,
        taskDescription: data.taskDescription,
        spaceId: data.spaceId || null,
        experimentId: data.experimentId || null,
        codingWorkspaceId: data.codingWorkspaceId || null,
        agentType: data.agentType || 'claude-code',
        taskContext: data.taskContext ? JSON.stringify(data.taskContext) : undefined,
        config: data.config ? JSON.stringify(data.config) : undefined,
        metadata: data.metadata ? JSON.stringify(data.metadata) : undefined,
        triggeredBy: data.triggeredBy || null,
        status: 'pending',
      })
      .returningAll()
      .executeTakeFirst();
  }

  async findById(id: string, trx?: KyselyTransaction) {
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('swarmExecutions')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  async findByExperiment(experimentId: string) {
    return this.db
      .selectFrom('swarmExecutions')
      .selectAll()
      .where('experimentId', '=', experimentId)
      .orderBy('createdAt', 'desc')
      .execute();
  }

  async findByWorkspace(
    workspaceId: string,
    opts?: { status?: string; spaceId?: string; experimentId?: string; limit?: number },
  ) {
    let query = this.db
      .selectFrom('swarmExecutions')
      .selectAll()
      .where('workspaceId', '=', workspaceId);

    if (opts?.status) {
      query = query.where('status', '=', opts.status);
    }
    if (opts?.spaceId) {
      query = query.where('spaceId', '=', opts.spaceId);
    }
    if (opts?.experimentId) {
      query = query.where('experimentId', '=', opts.experimentId);
    }

    query = query.orderBy('createdAt', 'desc');

    if (opts?.limit) {
      query = query.limit(opts.limit);
    }

    return query.execute();
  }

  async findActiveByWorkspace(workspaceId: string) {
    return this.db
      .selectFrom('swarmExecutions')
      .selectAll()
      .where('workspaceId', '=', workspaceId)
      .where('status', 'in', [
        'pending',
        'provisioning',
        'spawning',
        'running',
        'capturing',
        'finalizing',
      ])
      .orderBy('createdAt', 'desc')
      .execute();
  }

  async findAllActive() {
    return this.db
      .selectFrom('swarmExecutions')
      .selectAll()
      .where('status', 'in', [
        'pending',
        'provisioning',
        'spawning',
        'running',
        'capturing',
        'finalizing',
      ])
      .orderBy('createdAt', 'desc')
      .execute();
  }

  async updateStatus(
    id: string,
    status: string,
    extras?: Record<string, any>,
    trx?: KyselyTransaction,
  ) {
    const db = dbOrTx(this.db, trx);
    const updateData: any = { status, updatedAt: new Date(), ...extras };
    return db
      .updateTable('swarmExecutions')
      .set(updateData)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  async updateResults(
    id: string,
    results: {
      outputSummary?: string;
      exitCode?: number;
      results?: Record<string, any>;
      filesChanged?: any[];
    },
  ) {
    const updateData: any = { updatedAt: new Date() };
    if (results.outputSummary !== undefined) updateData.outputSummary = results.outputSummary;
    if (results.exitCode !== undefined) updateData.exitCode = results.exitCode;
    if (results.results) updateData.results = JSON.stringify(results.results);
    if (results.filesChanged) updateData.filesChanged = JSON.stringify(results.filesChanged);

    return this.db
      .updateTable('swarmExecutions')
      .set(updateData)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }
}
