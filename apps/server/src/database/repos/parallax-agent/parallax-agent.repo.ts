/**
 * Repository for managing Parallax agents
 * Handles agent registration, access control, and queries
 */
import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '../../types/kysely.types';
import { sql } from 'kysely';

export type ParallaxAgentStatus = 'pending' | 'approved' | 'denied' | 'revoked';

export interface ParallaxAgent {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  capabilities: string[];
  status: ParallaxAgentStatus;
  requestedPermissions: string[];
  grantedPermissions: string[];
  mcpApiKeyId: string | null;
  metadata: Record<string, any>;
  endpoint: string | null;
  requestedAt: Date;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  denialReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertableParallaxAgent {
  id: string;
  workspaceId: string;
  name: string;
  description?: string | null;
  capabilities: string[];
  status?: ParallaxAgentStatus;
  requestedPermissions: string[];
  grantedPermissions?: string[];
  mcpApiKeyId?: string | null;
  metadata?: Record<string, any>;
  endpoint?: string | null;
}

export interface UpdateableParallaxAgent {
  name?: string;
  description?: string | null;
  capabilities?: string[];
  status?: ParallaxAgentStatus;
  requestedPermissions?: string[];
  grantedPermissions?: string[];
  mcpApiKeyId?: string | null;
  metadata?: Record<string, any>;
  endpoint?: string | null;
  resolvedAt?: Date | null;
  resolvedBy?: string | null;
  denialReason?: string | null;
  updatedAt?: Date;
}

@Injectable()
export class ParallaxAgentRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  private baseFields = [
    'id',
    'workspaceId',
    'name',
    'description',
    'capabilities',
    'status',
    'requestedPermissions',
    'grantedPermissions',
    'mcpApiKeyId',
    'metadata',
    'endpoint',
    'requestedAt',
    'resolvedAt',
    'resolvedBy',
    'denialReason',
    'createdAt',
    'updatedAt',
  ] as const;

  async create(agent: InsertableParallaxAgent): Promise<ParallaxAgent> {
    return this.db
      .insertInto('parallaxAgents')
      .values({
        ...agent,
        metadata: JSON.stringify(agent.metadata || {}),
        grantedPermissions: agent.grantedPermissions || [],
      })
      .returning(this.baseFields)
      .executeTakeFirstOrThrow() as Promise<ParallaxAgent>;
  }

  async findById(id: string): Promise<ParallaxAgent | undefined> {
    return this.db
      .selectFrom('parallaxAgents')
      .select(this.baseFields)
      .where('id', '=', id)
      .executeTakeFirst() as Promise<ParallaxAgent | undefined>;
  }

  async findByIdAndWorkspace(
    id: string,
    workspaceId: string,
  ): Promise<ParallaxAgent | undefined> {
    return this.db
      .selectFrom('parallaxAgents')
      .select(this.baseFields)
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId)
      .executeTakeFirst() as Promise<ParallaxAgent | undefined>;
  }

  async findByWorkspace(
    workspaceId: string,
    status?: ParallaxAgentStatus,
  ): Promise<ParallaxAgent[]> {
    let query = this.db
      .selectFrom('parallaxAgents')
      .select(this.baseFields)
      .where('workspaceId', '=', workspaceId);

    if (status) {
      query = query.where('status', '=', status);
    }

    return query.orderBy('createdAt', 'desc').execute() as Promise<
      ParallaxAgent[]
    >;
  }

  async findPendingByWorkspace(workspaceId: string): Promise<ParallaxAgent[]> {
    return this.findByWorkspace(workspaceId, 'pending');
  }

  async findApprovedByWorkspace(workspaceId: string): Promise<ParallaxAgent[]> {
    return this.findByWorkspace(workspaceId, 'approved');
  }

  async findByCapabilities(
    workspaceId: string,
    capabilities: string[],
  ): Promise<ParallaxAgent[]> {
    return this.db
      .selectFrom('parallaxAgents')
      .select(this.baseFields)
      .where('workspaceId', '=', workspaceId)
      .where('status', '=', 'approved')
      .where(sql<boolean>`capabilities && ${sql.val(capabilities)}`)
      .orderBy('name', 'asc')
      .execute() as Promise<ParallaxAgent[]>;
  }

  async update(
    id: string,
    workspaceId: string,
    data: UpdateableParallaxAgent,
  ): Promise<ParallaxAgent> {
    const updateData: Record<string, any> = { ...data };

    if (data.metadata) {
      updateData.metadata = JSON.stringify(data.metadata);
    }

    updateData.updatedAt = sql`now()`;

    return this.db
      .updateTable('parallaxAgents')
      .set(updateData)
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId)
      .returning(this.baseFields)
      .executeTakeFirstOrThrow() as Promise<ParallaxAgent>;
  }

  async delete(id: string, workspaceId: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom('parallaxAgents')
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId)
      .executeTakeFirst();

    return (result.numDeletedRows ?? 0) > 0;
  }

  async countByWorkspace(workspaceId: string): Promise<number> {
    const result = await this.db
      .selectFrom('parallaxAgents')
      .select(sql`count(*)`.as('count'))
      .where('workspaceId', '=', workspaceId)
      .where('status', '=', 'approved')
      .executeTakeFirst();

    return Number(result?.count || 0);
  }
}
