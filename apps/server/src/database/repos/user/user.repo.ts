import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '@raven-docs/db/types/kysely.types';
import { Users } from '@raven-docs/db/types/db';
import { hashPassword } from '../../../common/helpers';
import { dbOrTx } from '@raven-docs/db/utils';
import {
  InsertableUser,
  UpdatableUser,
  User,
} from '@raven-docs/db/types/entity.types';
import { PaginationOptions } from '../../pagination/pagination-options';
import { executeWithPagination } from '@raven-docs/db/pagination/pagination';
import { sql } from 'kysely';

@Injectable()
export class UserRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  public baseFields: Array<keyof Users> = [
    'id',
    'email',
    'name',
    'emailVerifiedAt',
    'avatarUrl',
    'role',
    'workspaceId',
    'locale',
    'timezone',
    'settings',
    'lastLoginAt',
    'deactivatedAt',
    'createdAt',
    'updatedAt',
    'deletedAt',
  ];

  async findById(
    userId: string,
    workspaceId: string,
    opts?: {
      includePassword?: boolean;
      trx?: KyselyTransaction;
    },
  ): Promise<User> {
    const db = dbOrTx(this.db, opts?.trx);
    return db
      .selectFrom('users')
      .select(this.baseFields)
      .$if(opts?.includePassword, (qb) => qb.select('password'))
      .where('id', '=', userId)
      .where('workspaceId', '=', workspaceId)
      .executeTakeFirst();
  }

  async findByEmail(
    email: string,
    workspaceId: string,
    opts?: {
      includePassword?: boolean;
      trx?: KyselyTransaction;
    },
  ): Promise<User> {
    const db = dbOrTx(this.db, opts?.trx);
    return db
      .selectFrom('users')
      .select(this.baseFields)
      .$if(opts?.includePassword, (qb) => qb.select('password'))
      .where(sql`LOWER(email)`, '=', sql`LOWER(${email})`)
      .where('workspaceId', '=', workspaceId)
      .executeTakeFirst();
  }

  async updateUser(
    updatableUser: UpdatableUser,
    userId: string,
    workspaceId: string,
    trx?: KyselyTransaction,
  ) {
    const db = dbOrTx(this.db, trx);

    return await db
      .updateTable('users')
      .set({ ...updatableUser, updatedAt: new Date() })
      .where('id', '=', userId)
      .where('workspaceId', '=', workspaceId)
      .execute();
  }

  async updateLastLogin(userId: string, workspaceId: string) {
    return await this.db
      .updateTable('users')
      .set({
        lastLoginAt: new Date(),
      })
      .where('id', '=', userId)
      .where('workspaceId', '=', workspaceId)
      .execute();
  }

  async findFirstOwner(workspaceId: string): Promise<User | undefined> {
    return this.db
      .selectFrom('users')
      .select(this.baseFields)
      .where('workspaceId', '=', workspaceId)
      .where(sql`LOWER(role)`, '=', 'owner')
      .orderBy('createdAt', 'asc')
      .limit(1)
      .executeTakeFirst();
  }

  async insertUser(
    insertableUser: InsertableUser,
    trx?: KyselyTransaction,
  ): Promise<User> {
    const user: InsertableUser = {
      name:
        insertableUser.name || insertableUser.email.split('@')[0].toLowerCase(),
      email: insertableUser.email.toLowerCase(),
      password: await hashPassword(insertableUser.password),
      locale: 'en-US',
      role: insertableUser?.role,
      lastLoginAt: new Date(),
    };

    const db = dbOrTx(this.db, trx);
    return db
      .insertInto('users')
      .values({ ...insertableUser, ...user })
      .returning(this.baseFields)
      .executeTakeFirst();
  }

  /**
   * Create a user account for an agent.
   * Agents don't have passwords - they authenticate via MCP API keys.
   */
  async insertAgentUser(
    agentUser: {
      agentId: string;
      name: string;
      email: string;
      workspaceId: string;
      avatarUrl?: string;
    },
    trx?: KyselyTransaction,
  ): Promise<User> {
    const db = dbOrTx(this.db, trx);
    return db
      .insertInto('users')
      .values({
        agentId: agentUser.agentId,
        name: agentUser.name,
        email: agentUser.email.toLowerCase(),
        workspaceId: agentUser.workspaceId,
        avatarUrl: agentUser.avatarUrl || null,
        locale: 'en-US',
        role: 'agent',
        password: null, // Agents don't have passwords
        emailVerifiedAt: new Date(), // Agents are pre-verified
      })
      .returning(this.baseFields)
      .executeTakeFirst();
  }

  /**
   * Find a user by their agent ID within a workspace.
   */
  async findByAgentId(
    agentId: string,
    workspaceId: string,
  ): Promise<User | undefined> {
    return this.db
      .selectFrom('users')
      .select(this.baseFields)
      .where('agentId', '=', agentId)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
  }

  async roleCountByWorkspaceId(
    role: string,
    workspaceId: string,
  ): Promise<number> {
    const { count } = await this.db
      .selectFrom('users')
      .select((eb) => eb.fn.count('role').as('count'))
      .where('role', '=', role)
      .where('workspaceId', '=', workspaceId)
      .executeTakeFirst();

    return count as number;
  }

  async getUsersPaginated(workspaceId: string, pagination: PaginationOptions) {
    let query = this.db
      .selectFrom('users')
      .select(this.baseFields)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .orderBy('createdAt', 'asc');

    if (pagination.query) {
      query = query.where((eb) =>
        eb('users.name', 'ilike', `%${pagination.query}%`).or(
          'users.email',
          'ilike',
          `%${pagination.query}%`,
        ),
      );
    }

    const result = executeWithPagination(query, {
      page: pagination.page,
      perPage: pagination.limit,
    });

    return result;
  }

  async updatePreference(
    userId: string,
    prefKey: string,
    prefValue: string | boolean,
  ) {
    return await this.db
      .updateTable('users')
      .set({
        settings: sql`COALESCE(settings, '{}'::jsonb)
                || jsonb_build_object('preferences', COALESCE(settings->'preferences', '{}'::jsonb)
                || jsonb_build_object('${sql.raw(prefKey)}', ${sql.lit(prefValue)}))`,
        updatedAt: new Date(),
      })
      .where('id', '=', userId)
      .returning(this.baseFields)
      .executeTakeFirst();
  }

  /**
   * Find a user by their linked Slack user ID.
   */
  async findBySlackUserId(
    slackUserId: string,
    workspaceId: string,
  ): Promise<User | undefined> {
    return this.db
      .selectFrom('users')
      .select(this.baseFields)
      .where(
        sql`settings->'integrations'->'slack'->>'slackUserId'`,
        '=',
        slackUserId,
      )
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
  }

  /**
   * Link a Slack user ID to this Raven user.
   */
  async linkSlackUser(
    userId: string,
    workspaceId: string,
    slackUserId: string,
  ): Promise<User | undefined> {
    const slackData = {
      slackUserId,
      linkedAt: new Date().toISOString(),
    };

    return await this.db
      .updateTable('users')
      .set({
        settings: sql`COALESCE(settings, '{}'::jsonb)
                || jsonb_build_object('integrations', COALESCE(settings->'integrations', '{}'::jsonb)
                || jsonb_build_object('slack', ${JSON.stringify(slackData)}::jsonb))`,
        updatedAt: new Date(),
      })
      .where('id', '=', userId)
      .where('workspaceId', '=', workspaceId)
      .returning(this.baseFields)
      .executeTakeFirst();
  }

  /**
   * Unlink a Slack user ID from this Raven user.
   */
  async unlinkSlackUser(
    userId: string,
    workspaceId: string,
  ): Promise<User | undefined> {
    return await this.db
      .updateTable('users')
      .set({
        settings: sql`settings #- '{integrations,slack}'`,
        updatedAt: new Date(),
      })
      .where('id', '=', userId)
      .where('workspaceId', '=', workspaceId)
      .returning(this.baseFields)
      .executeTakeFirst();
  }
}
