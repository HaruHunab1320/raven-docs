/**
 * Repository for managing MCP API keys
 * Provides methods to create, retrieve, update and delete API keys
 */
import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '../../types/kysely.types';
import { sql } from 'kysely';
import {
  InsertableMCPApiKey,
  MCPApiKey,
  UpdateableMCPApiKey,
} from '../../types/entity.types';
import { randomUUID } from 'crypto';
import { McpApiKeys } from '../../types/db';

@Injectable()
export class MCPApiKeyRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  public baseFields: Array<keyof McpApiKeys> = [
    'id',
    'userId',
    'workspaceId',
    'name',
    'hashedKey',
    'createdAt',
    'lastUsedAt',
  ];

  async createApiKey(
    apiKey: Omit<InsertableMCPApiKey, 'id'>,
  ): Promise<MCPApiKey> {
    const id = randomUUID();
    return this.db
      .insertInto('mcpApiKeys')
      .values({
        ...apiKey,
        id,
      })
      .returning(this.baseFields)
      .executeTakeFirstOrThrow();
  }

  async getApiKeyById(id: string): Promise<MCPApiKey | undefined> {
    return this.db
      .selectFrom('mcpApiKeys')
      .select(this.baseFields)
      .where('id', '=', id)
      .executeTakeFirst();
  }

  async getApiKeyByHashedKey(
    hashedKey: string,
  ): Promise<MCPApiKey | undefined> {
    return this.db
      .selectFrom('mcpApiKeys')
      .select(this.baseFields)
      .where('hashedKey', '=', hashedKey)
      .executeTakeFirst();
  }

  async getApiKeysByUserId(userId: string): Promise<MCPApiKey[]> {
    return this.db
      .selectFrom('mcpApiKeys')
      .select(this.baseFields)
      .where('userId', '=', userId)
      .execute();
  }

  async getApiKeysByWorkspaceId(workspaceId: string): Promise<MCPApiKey[]> {
    return this.db
      .selectFrom('mcpApiKeys')
      .select(this.baseFields)
      .where('workspaceId', '=', workspaceId)
      .execute();
  }

  async updateApiKey(
    id: string,
    data: UpdateableMCPApiKey,
  ): Promise<MCPApiKey> {
    return this.db
      .updateTable('mcpApiKeys')
      .set(data)
      .where('id', '=', id)
      .returning(this.baseFields)
      .executeTakeFirstOrThrow();
  }

  async updateLastUsedAt(hashedKey: string): Promise<void> {
    await this.db
      .updateTable('mcpApiKeys')
      .set({
        lastUsedAt: sql`NOW()`,
      })
      .where('hashedKey', '=', hashedKey)
      .execute();
  }

  async deleteApiKey(id: string, userId: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom('mcpApiKeys')
      .where('id', '=', id)
      .where('userId', '=', userId)
      .executeTakeFirst();

    return !!result;
  }
}
