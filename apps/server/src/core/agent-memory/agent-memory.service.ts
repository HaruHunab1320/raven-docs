import { Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@raven-docs/db/types/kysely.types';
import { MemgraphService } from '../../integrations/memgraph/memgraph.service';
import { VectorSearchService } from '../../integrations/vector/vector-search.service';
import { v7 as uuid7 } from 'uuid';
import { int as neo4jInt } from 'neo4j-driver';
import { sql } from 'kysely';

export interface MemoryRecord {
  id: string;
  workspaceId: string;
  spaceId?: string | null;
  creatorId?: string | null;
  source?: string | null;
  summary?: string | null;
  content?: any;
  tags?: string[] | null;
  timestamp: Date;
}

interface MemoryQueryFilters {
  workspaceId: string;
  spaceId?: string;
  creatorId?: string;
  tags?: string[];
  sources?: string[];
  from?: Date;
  to?: Date;
  limit?: number;
}

@Injectable()
export class AgentMemoryService {
  private readonly logger = new Logger(AgentMemoryService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly memgraph: MemgraphService,
    private readonly vectorSearch: VectorSearchService,
  ) {}

  private buildContentText(content: any): string {
    if (!content) return '';
    if (typeof content === 'string') return content;
    try {
      return JSON.stringify(content);
    } catch {
      return String(content);
    }
  }

  private buildSummary(contentText: string, summary?: string) {
    if (summary) return summary;
    if (!contentText) return 'Memory';
    return contentText.length > 160
      ? `${contentText.slice(0, 157)}...`
      : contentText;
  }

  private normalizeJsonValue(value: any) {
    if (value === undefined) return null;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return { text: value };
      }
    }
    if (typeof value === 'bigint') {
      return value.toString();
    }
    if (typeof value === 'function' || typeof value === 'symbol') {
      return { text: String(value) };
    }
    try {
      JSON.stringify(value);
      return value;
    } catch {
      this.logger.warn('Agent memory payload was not JSON-serializable. Storing as text.');
      return { text: String(value) };
    }
  }

  private safeJsonStringify(value: any) {
    try {
      return JSON.stringify(value);
    } catch {
      return JSON.stringify({ text: String(value) });
    }
  }


  async ingestMemory(input: {
    workspaceId: string;
    spaceId?: string;
    creatorId?: string;
    source?: string;
    content?: any;
    summary?: string;
    tags?: string[];
    timestamp?: Date;
    entities?: Array<{ id: string; type: string; name: string }>;
  }): Promise<MemoryRecord> {
    const timestamp = input.timestamp || new Date();
    const contentText = this.buildContentText(input.content);
    const summary = this.buildSummary(contentText, input.summary);
    const tags = input.tags || [];
    const memoryId = uuid7();
    const content = input.content ?? null;
    const normalizedContent = this.normalizeJsonValue(content);
    const contentJson =
      normalizedContent === null
        ? null
        : (sql`${this.safeJsonStringify(normalizedContent)}::jsonb` as unknown as any);
    const normalizedTags = tags.map((tag) => String(tag));
    const tagsJson = sql`${this.safeJsonStringify(normalizedTags)}::jsonb` as unknown as any;

    await this.db
      .insertInto('agentMemories')
      .values({
        id: memoryId,
        workspaceId: input.workspaceId,
        spaceId: input.spaceId || null,
        creatorId: input.creatorId || null,
        source: input.source || null,
        summary,
        content: contentJson,
        tags: tagsJson,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .execute();

    // Store embedding in Postgres via pgvector (O(log n) queries with HNSW index)
    const embeddingInput = summary || contentText;
    if (embeddingInput) {
      try {
        const embedding = await this.vectorSearch.embedText(embeddingInput);
        if (embedding.length > 0) {
          await this.vectorSearch.storeMemoryEmbedding({
            memoryId,
            embedding,
          });
        }
      } catch (error) {
        this.logger.warn(`Failed to generate embedding for memory ${memoryId}:`, error);
        // Continue without embedding - memory is still stored
      }
    }

    // Store graph data in Memgraph (for relationships and graph traversals only)
    const session = this.memgraph.getSession();
    try {
      await session.run(
        `
        MERGE (m:MemoryNode {id: $id})
        SET m.workspaceId = $workspaceId,
            m.spaceId = $spaceId,
            m.creatorId = $creatorId,
            m.source = $source,
            m.summary = $summary,
            m.tags = $tags,
            m.timestamp = $timestamp,
            m.timestampMs = $timestampMs
        `,
        {
          id: memoryId,
          workspaceId: input.workspaceId,
          spaceId: input.spaceId || null,
          creatorId: input.creatorId || null,
          source: input.source || null,
          summary,
          tags: normalizedTags,
          timestamp: timestamp.toISOString(),
          timestampMs: timestamp.getTime(),
        },
      );

      if (input.entities?.length) {
        for (const entity of input.entities) {
          await session.run(
            `
            MERGE (e:Entity {id: $entityId})
            SET e.type = $entityType, e.name = $entityName
            WITH e
            MATCH (m:MemoryNode {id: $memoryId})
            MERGE (m)-[:REFERS_TO]->(e)
            `,
            {
              entityId: entity.id,
              entityType: entity.type,
              entityName: entity.name,
              memoryId,
            },
          );
        }
      }
    } finally {
      await session.close();
    }

    return {
      id: memoryId,
      workspaceId: input.workspaceId,
      spaceId: input.spaceId || null,
      creatorId: input.creatorId || null,
      source: input.source || null,
      summary,
      content,
      tags: normalizedTags,
      timestamp,
    };
  }

  async getMemoryById(workspaceId: string, id: string) {
    return this.db
      .selectFrom('agentMemories')
      .select([
        'id',
        'workspaceId',
        'spaceId',
        'creatorId',
        'source',
        'summary',
        'content',
        'tags',
        'createdAt',
      ])
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId)
      .executeTakeFirst();
  }

  async updateMemory(input: {
    id: string;
    workspaceId: string;
    summary?: string | null;
    content?: any;
    tags?: string[];
  }) {
    const existing = await this.getMemoryById(input.workspaceId, input.id);
    if (!existing) return null;

    const nextContent =
      input.content === undefined ? existing.content : input.content;
    const nextTags =
      input.tags === undefined
        ? (existing.tags as string[] | null) || []
        : input.tags;
    const nextSummary =
      input.summary === undefined ? existing.summary : input.summary;

    const normalizedContent = this.normalizeJsonValue(nextContent);
    const contentJson =
      normalizedContent === null
        ? null
        : (sql`${this.safeJsonStringify(normalizedContent)}::jsonb` as unknown as any);
    const tagsJson = sql`${this.safeJsonStringify(nextTags || [])}::jsonb` as unknown as any;

    await this.db
      .updateTable('agentMemories')
      .set({
        summary: nextSummary,
        content: contentJson,
        tags: tagsJson,
        updatedAt: new Date(),
      })
      .where('id', '=', input.id)
      .where('workspaceId', '=', input.workspaceId)
      .execute();

    const session = this.memgraph.getSession();
    try {
      await session.run(
        `
        MATCH (m:MemoryNode {id: $id})
        SET m.tags = $tags,
            m.summary = $summary
        `,
        {
          id: input.id,
          tags: nextTags || [],
          summary: nextSummary || existing.summary || null,
        },
      );
    } finally {
      await session.close();
    }

    return {
      id: existing.id,
      workspaceId: existing.workspaceId,
      spaceId: existing.spaceId,
      creatorId: existing.creatorId,
      source: existing.source,
      summary: nextSummary,
      content: nextContent,
      tags: nextTags || [],
      timestamp: existing.createdAt,
    } as MemoryRecord;
  }

  async deleteMemories(
    filters: MemoryQueryFilters,
    contentPrefixes: string[] = [],
  ) {
    if (!contentPrefixes.length && !filters.tags?.length && !filters.sources?.length) {
      return { deleted: 0, ids: [] as string[] };
    }

    let query = this.db
      .selectFrom('agentMemories')
      .select('id')
      .where('workspaceId', '=', filters.workspaceId);

    if (filters.spaceId) {
      query = query.where('spaceId', '=', filters.spaceId);
    }

    if (filters.creatorId) {
      query = query.where('creatorId', '=', filters.creatorId);
    }

    if (filters.sources?.length) {
      query = query.where('source', 'in', filters.sources);
    }

    if (filters.tags?.length) {
      const tagsJson = sql`${this.safeJsonStringify(filters.tags)}::jsonb` as unknown as any;
      query = query.where(sql<boolean>`${sql.ref('tags')} @> ${tagsJson}`);
    }

    if (contentPrefixes.length) {
      const textExpr = sql`COALESCE(${sql.ref('content')}->>'text', ${sql.ref(
        'summary',
      )}, '')`;
      const conditions = contentPrefixes.map(
        (prefix) => sql<boolean>`${textExpr} ILIKE ${`${prefix}%`}`,
      );
      query = query.where((eb) => eb.or(conditions));
    }

    if (filters.limit) {
      query = query.limit(filters.limit);
    }

    const rows = await query.execute();
    const ids = rows.map((row) => row.id);
    if (!ids.length) {
      return { deleted: 0, ids };
    }

    await this.db.deleteFrom('agentMemories').where('id', 'in', ids).execute();

    const session = this.memgraph.getSession();
    try {
      await session.run(
        `
        MATCH (m:MemoryNode)
        WHERE m.id IN $ids
        DETACH DELETE m
        `,
        { ids },
      );
    } finally {
      await session.close();
    }

    return { deleted: ids.length, ids };
  }

  private async fetchMemoryContent(ids: string[]) {
    if (!ids.length) return new Map();
    const rows = await this.db
      .selectFrom('agentMemories')
      .select(['id', 'content', 'summary', 'tags', 'source', 'createdAt'])
      .where('id', 'in', ids)
      .execute();

    return new Map(rows.map((row) => [row.id, row]));
  }

  async queryMemories(
    filters: MemoryQueryFilters,
    queryText?: string,
  ): Promise<any[]> {
    const limit = filters.limit || 20;

    // If semantic search is needed, use pgvector (O(log n) with HNSW index)
    if (queryText) {
      const embedding = await this.vectorSearch.embedText(queryText);
      const similarIds = await this.vectorSearch.searchMemories({
        queryEmbedding: embedding,
        workspaceId: filters.workspaceId,
        spaceId: filters.spaceId,
        limit: limit * 2, // Fetch extra for post-filtering
        minSimilarity: 0.4,
      });

      if (similarIds.length === 0) {
        return [];
      }

      // Fetch full memory records from Postgres
      const ids = similarIds.map((s) => s.id);
      const memories = await this.db
        .selectFrom('agentMemories')
        .select([
          'id',
          'workspaceId',
          'spaceId',
          'creatorId',
          'source',
          'summary',
          'content',
          'tags',
          'createdAt',
        ])
        .where('id', 'in', ids)
        .execute();

      // Merge with similarity scores and apply additional filters
      const scoreMap = new Map(similarIds.map((s) => [s.id, s.similarity]));
      let results = memories
        .map((m) => ({
          id: m.id,
          workspaceId: m.workspaceId,
          spaceId: m.spaceId,
          source: m.source,
          summary: m.summary,
          content: m.content,
          tags: m.tags || [],
          timestamp: m.createdAt,
          score: scoreMap.get(m.id) || 0,
        }))
        .sort((a, b) => b.score - a.score);

      // Apply additional filters
      if (filters.tags?.length) {
        results = results.filter((m) =>
          filters.tags!.some((tag) => (m.tags as string[])?.includes(tag)),
        );
      }
      if (filters.sources?.length) {
        results = results.filter((m) =>
          filters.sources!.includes(m.source || ''),
        );
      }
      if (filters.from) {
        results = results.filter(
          (m) => new Date(m.timestamp) >= filters.from!,
        );
      }
      if (filters.to) {
        results = results.filter((m) => new Date(m.timestamp) <= filters.to!);
      }

      return results.slice(0, limit);
    }

    // Non-semantic query: use Postgres directly
    let query = this.db
      .selectFrom('agentMemories')
      .select([
        'id',
        'workspaceId',
        'spaceId',
        'creatorId',
        'source',
        'summary',
        'content',
        'tags',
        'createdAt',
      ])
      .where('workspaceId', '=', filters.workspaceId);

    if (filters.spaceId) {
      query = query.where('spaceId', '=', filters.spaceId);
    }
    if (filters.creatorId) {
      query = query.where('creatorId', '=', filters.creatorId);
    }
    if (filters.sources?.length) {
      query = query.where('source', 'in', filters.sources);
    }
    if (filters.tags?.length) {
      const tagsJson = sql`${this.safeJsonStringify(filters.tags)}::jsonb` as unknown as any;
      query = query.where(sql<boolean>`${sql.ref('tags')} @> ${tagsJson}`);
    }
    if (filters.from) {
      query = query.where('createdAt', '>=', filters.from);
    }
    if (filters.to) {
      query = query.where('createdAt', '<=', filters.to);
    }

    const rows = await query
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .execute();

    return rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspaceId,
      spaceId: row.spaceId,
      source: row.source,
      summary: row.summary,
      content: row.content,
      tags: row.tags || [],
      timestamp: row.createdAt,
    }));
  }

  async getDailyMemories(filters: MemoryQueryFilters, date?: Date) {
    const target = date || new Date();
    const start = new Date(target);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 1);

    return this.queryMemories(
      {
        ...filters,
        from: start,
        to: end,
        limit: filters.limit || 50,
      },
      undefined,
    );
  }

  async listMemoryDays(filters: MemoryQueryFilters) {
    const days = filters.limit || 14;
    const end = new Date();
    const start = new Date(end);
    start.setDate(end.getDate() - days + 1);
    const session = this.memgraph.getSession();
    const params: any = {
      workspaceId: filters.workspaceId,
      spaceId: filters.spaceId || null,
      creatorId: filters.creatorId || null,
      fromMs: start.getTime(),
      toMs: end.getTime(),
    };

    const whereParts = [
      'm.workspaceId = $workspaceId',
      filters.spaceId ? 'm.spaceId = $spaceId' : null,
      filters.creatorId ? 'm.creatorId = $creatorId' : null,
      'm.timestampMs >= $fromMs',
      'm.timestampMs <= $toMs',
    ].filter(Boolean);

    const whereClause = whereParts.length
      ? `WHERE ${whereParts.join(' AND ')}`
      : '';

    try {
      const result = await session.run(
        `
        MATCH (m:MemoryNode)
        ${whereClause}
        RETURN m.timestamp AS timestamp
        `,
        params,
      );

      const counts = new Map<string, number>();
      for (const record of result.records) {
        const timestamp = record.get('timestamp') as string | null;
        if (!timestamp) continue;
        const day = timestamp.slice(0, 10);
        if (!day) continue;
        counts.set(day, (counts.get(day) || 0) + 1);
      }

      return Array.from(counts.entries())
        .map(([day, count]) => ({ day, count }))
        .sort((a, b) => (a.day < b.day ? 1 : -1))
        .slice(0, days);
    } finally {
      await session.close();
    }
  }

  async getMemoryGraph(filters: MemoryQueryFilters & {
    maxNodes?: number;
    maxEdges?: number;
    minWeight?: number;
  }) {
    const session = this.memgraph.getSession();
    const nodeLimit = Math.max(filters.maxNodes || 24, 1);
    const edgeLimit = Math.max(filters.maxEdges || 64, 1);
    const minWeight = Math.max(filters.minWeight || 1, 1);
    const params: any = {
      workspaceId: filters.workspaceId,
      spaceId: filters.spaceId || null,
      creatorId: filters.creatorId || null,
      tags: filters.tags || [],
      sources: filters.sources || [],
      fromMs: filters.from ? filters.from.getTime() : null,
      toMs: filters.to ? filters.to.getTime() : null,
      nodeLimit: neo4jInt(nodeLimit),
      edgeLimit: neo4jInt(edgeLimit),
      minWeight: neo4jInt(minWeight),
    };

    const whereParts = [
      'm.workspaceId = $workspaceId',
      filters.spaceId ? 'm.spaceId = $spaceId' : null,
      filters.creatorId ? 'm.creatorId = $creatorId' : null,
      filters.tags?.length ? 'ANY(tag IN $tags WHERE tag IN m.tags)' : null,
      filters.sources?.length ? 'm.source IN $sources' : null,
      filters.from ? 'm.timestampMs >= $fromMs' : null,
      filters.to ? 'm.timestampMs <= $toMs' : null,
    ].filter(Boolean);

    const whereClause = whereParts.length
      ? `WHERE ${whereParts.join(' AND ')}`
      : '';

    const toNumber = (value: any) => {
      if (typeof value === 'number') return value;
      if (value && typeof value.toNumber === 'function') {
        return value.toNumber();
      }
      return Number(value);
    };

    try {
      const nodesResult = await session.run(
        `
        MATCH (m:MemoryNode)
        ${whereClause}
        MATCH (m)-[:REFERS_TO]->(e:Entity)
        RETURN e AS entity, count(DISTINCT m) AS memoryCount, max(m.timestampMs) AS lastSeen
        ORDER BY memoryCount DESC
        LIMIT $nodeLimit
        `,
        params,
      );

      const nodes = nodesResult.records.map((record) => {
        const entity = record.get('entity').properties;
        return {
          id: entity.id as string,
          label: (entity.name as string) || 'Entity',
          type: (entity.type as string) || 'entity',
          count: toNumber(record.get('memoryCount')),
          lastSeen: record.get('lastSeen')
            ? new Date(toNumber(record.get('lastSeen'))).toISOString()
            : null,
        };
      });

      if (!nodes.length) {
        return { nodes: [], edges: [] };
      }

      const entityIds = nodes.map((node) => node.id);
      const edgesResult = await session.run(
        `
        MATCH (m:MemoryNode)
        ${whereClause}
        MATCH (m)-[:REFERS_TO]->(e:Entity)
        WHERE e.id IN $entityIds
        WITH m, collect(DISTINCT e) AS entities
        UNWIND entities AS a
        UNWIND entities AS b
        WITH a, b, count(*) AS weight
        WHERE a.id < b.id AND weight >= $minWeight
        RETURN a.id AS source, b.id AS target, weight
        ORDER BY weight DESC
        LIMIT $edgeLimit
        `,
        {
          ...params,
          entityIds,
        },
      );

      const edges = edgesResult.records.map((record) => ({
        source: record.get('source') as string,
        target: record.get('target') as string,
        weight: toNumber(record.get('weight')),
      }));

      return { nodes, edges };
    } finally {
      await session.close();
    }
  }

  async getEntityMemories(filters: MemoryQueryFilters & {
    entityId: string;
    limit?: number;
  }) {
    const session = this.memgraph.getSession();
    const limit = Math.max(filters.limit || 20, 1);
    const params: any = {
      workspaceId: filters.workspaceId,
      spaceId: filters.spaceId || null,
      creatorId: filters.creatorId || null,
      entityId: filters.entityId,
      fetchLimit: neo4jInt(Math.max(limit * 4, 40)),
    };

    const whereParts = [
      'm.workspaceId = $workspaceId',
      filters.spaceId ? 'm.spaceId = $spaceId' : null,
      filters.creatorId ? 'm.creatorId = $creatorId' : null,
    ].filter(Boolean);

    const whereClause = whereParts.length
      ? `AND ${whereParts.join(' AND ')}`
      : '';

    try {
      const result = await session.run(
        `
        MATCH (m:MemoryNode)-[:REFERS_TO]->(e:Entity {id: $entityId})
        WHERE m.workspaceId = $workspaceId
        ${whereClause}
        RETURN m
        ORDER BY m.timestampMs DESC
        LIMIT $fetchLimit
        `,
        params,
      );

      const records = result.records.map((record) => record.get('m').properties);
      const ids = records.map((record) => record.id as string);
      const contentMap = await this.fetchMemoryContent(ids);

      return records.slice(0, limit).map((record) => {
        const stored = contentMap.get(record.id);
        return {
          id: record.id,
          workspaceId: record.workspaceId,
          spaceId: record.spaceId,
          source: record.source,
          summary: record.summary,
          tags: record.tags || [],
          timestamp: new Date(Number(record.timestampMs)),
          content: stored?.content,
        };
      });
    } finally {
      await session.close();
    }
  }

  async getEntityDetails(filters: MemoryQueryFilters & {
    entityId: string;
    limit?: number;
  }) {
    const session = this.memgraph.getSession();
    const limit = Math.max(filters.limit || 20, 1);
    const params: any = {
      workspaceId: filters.workspaceId,
      spaceId: filters.spaceId || null,
      creatorId: filters.creatorId || null,
      entityId: filters.entityId,
      fetchLimit: neo4jInt(Math.max(limit * 4, 40)),
    };

    const whereParts = [
      'm.workspaceId = $workspaceId',
      filters.spaceId ? 'm.spaceId = $spaceId' : null,
      filters.creatorId ? 'm.creatorId = $creatorId' : null,
    ].filter(Boolean);

    const whereClause = whereParts.length
      ? `AND ${whereParts.join(' AND ')}`
      : '';

    const toNumber = (value: any) => {
      if (typeof value === 'number') return value;
      if (value && typeof value.toNumber === 'function') {
        return value.toNumber();
      }
      return Number(value);
    };

    try {
      const entityResult = await session.run(
        `
        MATCH (m:MemoryNode)-[:REFERS_TO]->(e:Entity {id: $entityId})
        WHERE m.workspaceId = $workspaceId
        ${whereClause}
        RETURN e AS entity, count(DISTINCT m) AS memoryCount, max(m.timestampMs) AS lastSeen
        `,
        params,
      );

      const record = entityResult.records[0];
      const entityProps = record?.get('entity')?.properties;
      const entity = entityProps
        ? {
            id: entityProps.id as string,
            name: (entityProps.name as string) || 'Entity',
            type: (entityProps.type as string) || 'entity',
            count: toNumber(record?.get('memoryCount') ?? 0),
            lastSeen: record?.get('lastSeen')
              ? new Date(toNumber(record.get('lastSeen'))).toISOString()
              : null,
          }
        : null;

      const memories = await this.getEntityMemories({
        ...filters,
        limit,
      });

      return { entity, memories };
    } finally {
      await session.close();
    }
  }

  async getEntityLinks(filters: MemoryQueryFilters & {
    taskIds?: string[];
    goalIds?: string[];
    limit?: number;
  }) {
    const buildLinks = (rows: Array<{ content: any; createdAt: any }>, key: string) => {
      const map = new Map<string, Map<string, { entityId: string; entityName?: string; createdAt: Date }>>();
      rows.forEach((row) => {
        const content = row.content as Record<string, any> | null;
        if (!content) return;
        const targetId = content[key];
        const entityId = content.entityId;
        if (!targetId || !entityId) return;
        const entryMap = map.get(targetId) || new Map();
        const createdAt = row.createdAt ? new Date(row.createdAt) : new Date();
        const existing = entryMap.get(entityId);
        if (!existing || existing.createdAt < createdAt) {
          entryMap.set(entityId, {
            entityId,
            entityName: content.entityName,
            createdAt,
          });
        }
        map.set(targetId, entryMap);
      });

      const limit = Math.max(filters.limit || 6, 1);
      return Object.fromEntries(
        Array.from(map.entries()).map(([targetId, entities]) => [
          targetId,
          Array.from(entities.values())
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .slice(0, limit)
            .map((entry) => ({
              entityId: entry.entityId,
              entityName: entry.entityName,
            })),
        ]),
      );
    };

    let baseQuery = this.db
      .selectFrom('agentMemories')
      .select(['content', 'createdAt'])
      .where('workspaceId', '=', filters.workspaceId)
      .where('source', '=', 'entity-link');

    if (filters.spaceId) {
      baseQuery = baseQuery.where('spaceId', '=', filters.spaceId);
    }

    if (filters.creatorId) {
      baseQuery = baseQuery.where('creatorId', '=', filters.creatorId);
    }

    const scopedQuery = baseQuery;

    let taskLinks = {};
    let goalLinks = {};

    if (filters.taskIds?.length) {
      const rows = await scopedQuery
        .where(sql`content->>'taskId'`, 'in', filters.taskIds)
        .execute();
      taskLinks = buildLinks(rows, 'taskId');
    }

    if (filters.goalIds?.length) {
      const rows = await scopedQuery
        .where(sql`content->>'goalId'`, 'in', filters.goalIds)
        .execute();
      goalLinks = buildLinks(rows, 'goalId');
    }

    return { taskLinks, goalLinks };
  }

  async listTopEntities(filters: MemoryQueryFilters & { limit?: number }) {
    const session = this.memgraph.getSession();
    const limit = Math.max(filters.limit || 10, 1);
    const params: any = {
      workspaceId: filters.workspaceId,
      spaceId: filters.spaceId || null,
      creatorId: filters.creatorId || null,
      tags: filters.tags || [],
      sources: filters.sources || [],
      fromMs: filters.from ? filters.from.getTime() : null,
      toMs: filters.to ? filters.to.getTime() : null,
      limit: neo4jInt(limit),
    };

    const whereParts = [
      'm.workspaceId = $workspaceId',
      filters.spaceId ? 'm.spaceId = $spaceId' : null,
      filters.creatorId ? 'm.creatorId = $creatorId' : null,
      filters.tags?.length ? 'ANY(tag IN $tags WHERE tag IN m.tags)' : null,
      filters.sources?.length ? 'm.source IN $sources' : null,
      filters.from ? 'm.timestampMs >= $fromMs' : null,
      filters.to ? 'm.timestampMs <= $toMs' : null,
    ].filter(Boolean);

    const whereClause = whereParts.length
      ? `WHERE ${whereParts.join(' AND ')}`
      : '';

    const toNumber = (value: any) => {
      if (typeof value === 'number') return value;
      if (value && typeof value.toNumber === 'function') {
        return value.toNumber();
      }
      return Number(value);
    };

    try {
      const result = await session.run(
        `
        MATCH (m:MemoryNode)
        ${whereClause}
        MATCH (m)-[:REFERS_TO]->(e:Entity)
        RETURN e AS entity, count(DISTINCT m) AS memoryCount
        ORDER BY memoryCount DESC
        LIMIT $limit
        `,
        params,
      );

      return result.records.map((record) => {
        const entity = record.get('entity').properties;
        return {
          id: entity.id as string,
          name: (entity.name as string) || 'Entity',
          type: (entity.type as string) || 'entity',
          count: toNumber(record.get('memoryCount')),
        };
      });
    } finally {
      await session.close();
    }
  }
}
