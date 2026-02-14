import { Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '../../database/types/kysely.types';
import { VectorSearchService } from '../../integrations/vector/vector-search.service';
import { KnowledgeProcessorService } from './knowledge-processor.service';
import { sql } from 'kysely';
import {
  CreateKnowledgeSourceDto,
  KnowledgeSourceRecord,
  KnowledgeScope,
} from './dto/knowledge.dto';

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly processor: KnowledgeProcessorService,
    private readonly vectorSearch: VectorSearchService,
  ) {}

  async createSource(
    input: CreateKnowledgeSourceDto,
    createdById: string,
  ): Promise<KnowledgeSourceRecord> {
    const result = await sql<KnowledgeSourceRecord>`
      INSERT INTO knowledge_sources (
        name, type, source_url, file_id, page_id,
        scope, workspace_id, space_id, sync_schedule, created_by_id
      )
      VALUES (
        ${input.name},
        ${input.type},
        ${input.sourceUrl || null},
        ${input.fileId || null}::uuid,
        ${input.pageId || null}::uuid,
        ${input.scope},
        ${input.workspaceId || null}::uuid,
        ${input.spaceId || null}::uuid,
        ${input.syncSchedule || null},
        ${createdById}::uuid
      )
      RETURNING
        id, name, type, source_url as "sourceUrl", file_id as "fileId",
        page_id as "pageId", scope, workspace_id as "workspaceId",
        space_id as "spaceId", status, error_message as "errorMessage",
        last_synced_at as "lastSyncedAt", sync_schedule as "syncSchedule",
        chunk_count as "chunkCount", created_by_id as "createdById",
        created_at as "createdAt", updated_at as "updatedAt"
    `.execute(this.db);

    const source = result.rows[0];

    // Queue processing asynchronously (pass content for markdown type)
    this.processSourceAsync(source.id, input.content);

    return source;
  }

  private async processSourceAsync(sourceId: string, content?: string): Promise<void> {
    // Process in background - don't await
    this.processor.processSource(sourceId, content).catch((error) => {
      this.logger.error(`Background processing failed for source ${sourceId}:`, error);
    });
  }

  async getSource(sourceId: string): Promise<KnowledgeSourceRecord | null> {
    const result = await sql<KnowledgeSourceRecord>`
      SELECT
        id, name, type, source_url as "sourceUrl", file_id as "fileId",
        page_id as "pageId", scope, workspace_id as "workspaceId",
        space_id as "spaceId", status, error_message as "errorMessage",
        last_synced_at as "lastSyncedAt", sync_schedule as "syncSchedule",
        chunk_count as "chunkCount", created_by_id as "createdById",
        created_at as "createdAt", updated_at as "updatedAt"
      FROM knowledge_sources
      WHERE id = ${sourceId}::uuid
    `.execute(this.db);

    return result.rows[0] || null;
  }

  async listSources(params: {
    workspaceId: string;
    spaceId?: string;
    includeSystem?: boolean;
  }): Promise<KnowledgeSourceRecord[]> {
    const { workspaceId, spaceId, includeSystem = true } = params;

    const result = await sql<KnowledgeSourceRecord>`
      SELECT
        id, name, type, source_url as "sourceUrl", file_id as "fileId",
        page_id as "pageId", scope, workspace_id as "workspaceId",
        space_id as "spaceId", status, error_message as "errorMessage",
        last_synced_at as "lastSyncedAt", sync_schedule as "syncSchedule",
        chunk_count as "chunkCount", created_by_id as "createdById",
        created_at as "createdAt", updated_at as "updatedAt"
      FROM knowledge_sources
      WHERE (
        (scope = 'workspace' AND workspace_id = ${workspaceId}::uuid)
        OR (scope = 'space' AND space_id = ${spaceId || null}::uuid)
        ${includeSystem ? sql`OR scope = 'system'` : sql``}
      )
      ORDER BY created_at DESC
    `.execute(this.db);

    return result.rows;
  }

  async deleteSource(sourceId: string): Promise<void> {
    // Chunks will cascade delete due to foreign key
    await sql`
      DELETE FROM knowledge_sources WHERE id = ${sourceId}::uuid
    `.execute(this.db);
  }

  async refreshSource(sourceId: string): Promise<void> {
    await sql`
      UPDATE knowledge_sources
      SET status = 'pending', updated_at = now()
      WHERE id = ${sourceId}::uuid
    `.execute(this.db);

    this.processSourceAsync(sourceId);
  }

  /**
   * Refresh all knowledge sources (re-embed with current model)
   */
  async refreshAllSources(): Promise<{ refreshed: number }> {
    const sources = await sql<{ id: string }>`
      SELECT id FROM knowledge_sources WHERE status != 'processing'
    `.execute(this.db);

    this.logger.log(`Refreshing ${sources.rows.length} knowledge sources`);

    for (const source of sources.rows) {
      await this.refreshSource(source.id);
    }

    return { refreshed: sources.rows.length };
  }

  async searchKnowledge(params: {
    query: string;
    workspaceId: string;
    spaceId?: string;
    limit?: number;
  }) {
    const embedding = await this.vectorSearch.embedText(params.query);
    return this.vectorSearch.searchKnowledge({
      queryEmbedding: embedding,
      workspaceId: params.workspaceId,
      spaceId: params.spaceId,
      limit: params.limit || 5,
    });
  }

  async getSourceChunks(
    sourceId: string,
    options?: { limit?: number; offset?: number },
  ) {
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;

    const result = await sql<{
      id: string;
      content: string;
      chunk_index: number;
      metadata: string | null;
      token_count: number | null;
      created_at: Date;
    }>`
      SELECT id, content, chunk_index, metadata::text, token_count, created_at
      FROM knowledge_chunks
      WHERE source_id = ${sourceId}::uuid
      ORDER BY chunk_index
      LIMIT ${limit}
      OFFSET ${offset}
    `.execute(this.db);

    return result.rows.map((row) => ({
      id: row.id,
      content: row.content,
      chunkIndex: row.chunk_index,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      tokenCount: row.token_count,
      createdAt: row.created_at,
    }));
  }
}
