import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '../../types/kysely.types';
import { dbOrTx } from '../../utils';

@Injectable()
export class TeamTemplateRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async findById(id: string, trx?: KyselyTransaction) {
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('teamTemplates')
      .selectAll()
      .where('id', '=', id)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
  }

  async listSystemTemplates() {
    return this.db
      .selectFrom('teamTemplates')
      .selectAll()
      .where('isSystem', '=', true)
      .where('deletedAt', 'is', null)
      .orderBy('name')
      .execute();
  }

  async listByWorkspace(workspaceId: string) {
    return this.db
      .selectFrom('teamTemplates')
      .selectAll()
      .where((eb) =>
        eb.or([
          eb('isSystem', '=', true),
          eb('workspaceId', '=', workspaceId),
        ]),
      )
      .where('deletedAt', 'is', null)
      .orderBy('isSystem', 'desc')
      .orderBy('name')
      .execute();
  }

  async listCustomByWorkspace(workspaceId: string) {
    return this.db
      .selectFrom('teamTemplates')
      .selectAll()
      .where('workspaceId', '=', workspaceId)
      .where('isSystem', '=', false)
      .where('deletedAt', 'is', null)
      .orderBy('name')
      .execute();
  }

  async create(
    data: {
      workspaceId: string;
      name: string;
      description?: string;
      version?: string;
      orgPattern: Record<string, any>;
      metadata?: Record<string, any>;
      createdBy: string;
    },
    trx?: KyselyTransaction,
  ) {
    const db = dbOrTx(this.db, trx);
    return db
      .insertInto('teamTemplates')
      .values({
        workspaceId: data.workspaceId,
        name: data.name,
        description: data.description || null,
        version: data.version || '1.0.0',
        isSystem: false,
        orgPattern: JSON.stringify(data.orgPattern),
        metadata: data.metadata ? JSON.stringify(data.metadata) : undefined,
        createdBy: data.createdBy,
      })
      .returningAll()
      .executeTakeFirst();
  }

  async update(
    id: string,
    data: {
      name?: string;
      description?: string;
      version?: string;
      orgPattern?: Record<string, any>;
      metadata?: Record<string, any>;
    },
    trx?: KyselyTransaction,
  ) {
    const db = dbOrTx(this.db, trx);
    const updateData: Record<string, any> = { updatedAt: new Date() };

    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.version !== undefined) updateData.version = data.version;
    if (data.orgPattern !== undefined)
      updateData.orgPattern = JSON.stringify(data.orgPattern);
    if (data.metadata !== undefined)
      updateData.metadata = JSON.stringify(data.metadata);

    return db
      .updateTable('teamTemplates')
      .set(updateData)
      .where('id', '=', id)
      .where('deletedAt', 'is', null)
      .returningAll()
      .executeTakeFirst();
  }

  async softDelete(id: string) {
    return this.db
      .updateTable('teamTemplates')
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where('id', '=', id)
      .where('isSystem', '=', false)
      .where('deletedAt', 'is', null)
      .returningAll()
      .executeTakeFirst();
  }

  async duplicate(
    id: string,
    workspaceId: string,
    createdBy: string,
  ) {
    const source = await this.findById(id);
    if (!source) return null;

    return this.db
      .insertInto('teamTemplates')
      .values({
        workspaceId,
        name: `${source.name} (Copy)`,
        description: source.description,
        version: '1.0.0',
        isSystem: false,
        orgPattern: typeof source.orgPattern === 'string'
          ? source.orgPattern
          : JSON.stringify(source.orgPattern),
        metadata: typeof source.metadata === 'string'
          ? source.metadata
          : JSON.stringify(source.metadata || {}),
        createdBy,
      })
      .returningAll()
      .executeTakeFirst();
  }
}
