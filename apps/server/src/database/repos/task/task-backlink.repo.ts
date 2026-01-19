import {
  InsertableTaskBacklink,
  TaskBacklink,
  UpdatableTaskBacklink,
} from '@raven-docs/db/types/entity.types';
import { KyselyDB, KyselyTransaction } from '@raven-docs/db/types/kysely.types';
import { dbOrTx } from '@raven-docs/db/utils';
import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';

@Injectable()
export class TaskBacklinkRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async findById(
    backlinkId: string,
    workspaceId: string,
    trx?: KyselyTransaction,
  ): Promise<TaskBacklink> {
    const db = dbOrTx(this.db, trx);

    return db
      .selectFrom('taskBacklinks')
      .select([
        'id',
        'sourcePageId',
        'targetTaskId',
        'workspaceId',
        'createdAt',
        'updatedAt',
      ])
      .where('id', '=', backlinkId)
      .where('workspaceId', '=', workspaceId)
      .executeTakeFirst();
  }

  async insertBacklink(
    insertableBacklink: InsertableTaskBacklink,
    trx?: KyselyTransaction,
  ) {
    const db = dbOrTx(this.db, trx);
    return db
      .insertInto('taskBacklinks')
      .values(insertableBacklink)
      .onConflict((oc) =>
        oc.columns(['sourcePageId', 'targetTaskId']).doNothing(),
      )
      .returningAll()
      .executeTakeFirst();
  }

  async updateBacklink(
    updatableBacklink: UpdatableTaskBacklink,
    backlinkId: string,
    trx?: KyselyTransaction,
  ) {
    const db = dbOrTx(this.db, trx);
    return db
      .updateTable('taskBacklinks')
      .set(updatableBacklink)
      .where('id', '=', backlinkId)
      .execute();
  }

  async deleteBacklink(
    backlinkId: string,
    trx?: KyselyTransaction,
  ): Promise<void> {
    const db = dbOrTx(this.db, trx);
    await db
      .deleteFrom('taskBacklinks')
      .where('id', '=', backlinkId)
      .execute();
  }

  async listPagesForTask(
    taskId: string,
    workspaceId: string,
    limit = 20,
    trx?: KyselyTransaction,
  ) {
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('taskBacklinks')
      .innerJoin('pages', 'pages.id', 'taskBacklinks.sourcePageId')
      .select([
        'pages.id',
        'pages.slugId',
        'pages.title',
        'pages.icon',
        'pages.spaceId',
      ])
      .where('taskBacklinks.targetTaskId', '=', taskId)
      .where('taskBacklinks.workspaceId', '=', workspaceId)
      .where('pages.deletedAt', 'is', null)
      .orderBy('pages.updatedAt', 'desc')
      .limit(limit)
      .execute();
  }
}
