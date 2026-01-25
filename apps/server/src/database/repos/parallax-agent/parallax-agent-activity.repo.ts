/**
 * Repository for managing Parallax agent activity logs
 * Provides audit trail for all agent actions
 */
import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '../../types/kysely.types';
import { sql } from 'kysely';

export interface ParallaxAgentActivity {
  id: string;
  agentId: string;
  workspaceId: string;
  activityType: string;
  description: string | null;
  metadata: Record<string, any>;
  projectId: string | null;
  taskId: string | null;
  pageId: string | null;
  createdAt: Date;
}

export interface InsertableAgentActivity {
  agentId: string;
  workspaceId: string;
  activityType: string;
  description?: string | null;
  metadata?: Record<string, any>;
  projectId?: string | null;
  taskId?: string | null;
  pageId?: string | null;
}

export interface ParallaxAgentActivityDaily {
  id: string;
  agentId: string;
  workspaceId: string;
  activityDate: Date;
  activityType: string;
  count: number;
  sampleMetadata: Record<string, any>[];
}

@Injectable()
export class ParallaxAgentActivityRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  private baseFields = [
    'id',
    'agentId',
    'workspaceId',
    'activityType',
    'description',
    'metadata',
    'projectId',
    'taskId',
    'pageId',
    'createdAt',
  ] as const;

  async create(
    activity: InsertableAgentActivity,
  ): Promise<ParallaxAgentActivity> {
    return this.db
      .insertInto('parallaxAgentActivity')
      .values({
        ...activity,
        metadata: JSON.stringify(activity.metadata || {}),
      })
      .returning(this.baseFields)
      .executeTakeFirstOrThrow() as Promise<ParallaxAgentActivity>;
  }

  async createMany(
    activities: InsertableAgentActivity[],
  ): Promise<ParallaxAgentActivity[]> {
    if (activities.length === 0) return [];

    return this.db
      .insertInto('parallaxAgentActivity')
      .values(
        activities.map((a) => ({
          ...a,
          metadata: JSON.stringify(a.metadata || {}),
        })),
      )
      .returning(this.baseFields)
      .execute() as Promise<ParallaxAgentActivity[]>;
  }

  async findByAgent(
    agentId: string,
    workspaceId: string,
    limit = 50,
    offset = 0,
  ): Promise<ParallaxAgentActivity[]> {
    return this.db
      .selectFrom('parallaxAgentActivity')
      .select(this.baseFields)
      .where('agentId', '=', agentId)
      .where('workspaceId', '=', workspaceId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .offset(offset)
      .execute() as Promise<ParallaxAgentActivity[]>;
  }

  async findByWorkspace(
    workspaceId: string,
    limit = 100,
    offset = 0,
  ): Promise<ParallaxAgentActivity[]> {
    return this.db
      .selectFrom('parallaxAgentActivity')
      .select(this.baseFields)
      .where('workspaceId', '=', workspaceId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .offset(offset)
      .execute() as Promise<ParallaxAgentActivity[]>;
  }

  async findByProject(
    projectId: string,
    limit = 50,
  ): Promise<ParallaxAgentActivity[]> {
    return this.db
      .selectFrom('parallaxAgentActivity')
      .select(this.baseFields)
      .where('projectId', '=', projectId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .execute() as Promise<ParallaxAgentActivity[]>;
  }

  async findByTask(
    taskId: string,
    limit = 50,
  ): Promise<ParallaxAgentActivity[]> {
    return this.db
      .selectFrom('parallaxAgentActivity')
      .select(this.baseFields)
      .where('taskId', '=', taskId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .execute() as Promise<ParallaxAgentActivity[]>;
  }

  async findByDateRange(
    workspaceId: string,
    startDate: Date,
    endDate: Date,
    agentId?: string,
  ): Promise<ParallaxAgentActivity[]> {
    let query = this.db
      .selectFrom('parallaxAgentActivity')
      .select(this.baseFields)
      .where('workspaceId', '=', workspaceId)
      .where('createdAt', '>=', startDate)
      .where('createdAt', '<=', endDate);

    if (agentId) {
      query = query.where('agentId', '=', agentId);
    }

    return query.orderBy('createdAt', 'desc').execute() as Promise<
      ParallaxAgentActivity[]
    >;
  }

  async countByAgent(
    agentId: string,
    workspaceId: string,
    since?: Date,
  ): Promise<number> {
    let query = this.db
      .selectFrom('parallaxAgentActivity')
      .select(sql`count(*)`.as('count'))
      .where('agentId', '=', agentId)
      .where('workspaceId', '=', workspaceId);

    if (since) {
      query = query.where('createdAt', '>=', since);
    }

    const result = await query.executeTakeFirst();
    return Number(result?.count || 0);
  }

  async deleteOlderThan(cutoffDate: Date): Promise<number> {
    const result = await this.db
      .deleteFrom('parallaxAgentActivity')
      .where('createdAt', '<', cutoffDate)
      .executeTakeFirst();

    return Number(result.numDeletedRows ?? 0);
  }

  // Aggregation methods for daily summaries

  async aggregateToDaily(cutoffDate: Date): Promise<void> {
    // This performs the aggregation in a single SQL statement
    await this.db
      .insertInto('parallaxAgentActivityDaily')
      .columns([
        'agentId',
        'workspaceId',
        'activityDate',
        'activityType',
        'count',
        'sampleMetadata',
      ])
      .expression(
        this.db
          .selectFrom('parallaxAgentActivity')
          .select([
            'agentId',
            'workspaceId',
            sql`DATE(created_at)`.as('activityDate'),
            'activityType',
            sql`COUNT(*)::integer`.as('count'),
            sql`jsonb_agg(metadata ORDER BY created_at DESC)`.as(
              'sampleMetadata',
            ),
          ])
          .where('createdAt', '<', cutoffDate)
          .groupBy([
            'agentId',
            'workspaceId',
            sql`DATE(created_at)`,
            'activityType',
          ]),
      )
      .onConflict((oc) =>
        oc.columns(['agentId', 'activityDate', 'activityType']).doUpdateSet({
          count: sql`parallax_agent_activity_daily.count + EXCLUDED.count`,
          sampleMetadata: sql`EXCLUDED.sample_metadata`,
        }),
      )
      .execute();
  }

  async getDailySummary(
    agentId: string,
    workspaceId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<ParallaxAgentActivityDaily[]> {
    return this.db
      .selectFrom('parallaxAgentActivityDaily')
      .select([
        'id',
        'agentId',
        'workspaceId',
        'activityDate',
        'activityType',
        'count',
        'sampleMetadata',
      ])
      .where('agentId', '=', agentId)
      .where('workspaceId', '=', workspaceId)
      .where('activityDate', '>=', startDate)
      .where('activityDate', '<=', endDate)
      .orderBy('activityDate', 'desc')
      .execute() as Promise<ParallaxAgentActivityDaily[]>;
  }
}
