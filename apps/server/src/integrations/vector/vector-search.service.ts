import { Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '../../database/types/kysely.types';
import { sql } from 'kysely';
import { AIService } from '../ai/ai.service';

export interface VectorSearchResult {
  id: string;
  similarity: number;
}

export interface KnowledgeSearchResult {
  chunkId: string;
  content: string;
  similarity: number;
  sourceName: string;
  metadata: Record<string, any> | null;
}

@Injectable()
export class VectorSearchService {
  private readonly logger = new Logger(VectorSearchService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly aiService: AIService,
  ) {}

  async embedText(text: string): Promise<number[]> {
    const model = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001';
    const result = await this.aiService.embedContent({ model, content: text });
    return result.embedding;
  }

  private formatEmbedding(embedding: number[]): string {
    return `[${embedding.join(',')}]`;
  }

  async storeMemoryEmbedding(params: {
    memoryId: string;
    embedding: number[];
    model?: string;
  }): Promise<void> {
    const embeddingStr = this.formatEmbedding(params.embedding);
    const model = params.model || process.env.GEMINI_EMBEDDING_MODEL || 'text-embedding-004';

    await sql`
      INSERT INTO memory_embeddings (memory_id, embedding, model)
      VALUES (
        ${params.memoryId}::uuid,
        ${embeddingStr}::vector,
        ${model}
      )
      ON CONFLICT (memory_id) DO UPDATE SET
        embedding = ${embeddingStr}::vector,
        model = ${model}
    `.execute(this.db);
  }

  async deleteMemoryEmbedding(memoryId: string): Promise<void> {
    await sql`
      DELETE FROM memory_embeddings WHERE memory_id = ${memoryId}::uuid
    `.execute(this.db);
  }

  async searchMemories(params: {
    queryEmbedding: number[];
    workspaceId: string;
    spaceId?: string;
    limit?: number;
    minSimilarity?: number;
  }): Promise<VectorSearchResult[]> {
    const {
      queryEmbedding,
      workspaceId,
      spaceId,
      limit = 10,
      minSimilarity = 0.5,
    } = params;

    const embeddingStr = this.formatEmbedding(queryEmbedding);

    const results = await sql<{ memory_id: string; similarity: number }>`
      SELECT
        me.memory_id,
        1 - (me.embedding <=> ${embeddingStr}::vector) as similarity
      FROM memory_embeddings me
      JOIN agent_memories am ON am.id = me.memory_id
      WHERE am.workspace_id = ${workspaceId}::uuid
        AND (${spaceId}::uuid IS NULL OR am.space_id = ${spaceId}::uuid)
        AND 1 - (me.embedding <=> ${embeddingStr}::vector) >= ${minSimilarity}
      ORDER BY me.embedding <=> ${embeddingStr}::vector
      LIMIT ${limit}
    `.execute(this.db);

    return results.rows.map((row) => ({
      id: row.memory_id,
      similarity: Number(row.similarity),
    }));
  }

  async searchKnowledge(params: {
    queryEmbedding: number[];
    workspaceId: string;
    spaceId?: string;
    limit?: number;
  }): Promise<KnowledgeSearchResult[]> {
    const { queryEmbedding, workspaceId, spaceId, limit = 5 } = params;

    const embeddingStr = this.formatEmbedding(queryEmbedding);

    const results = await sql<{
      chunk_id: string;
      content: string;
      source_name: string;
      similarity: number;
      metadata: string | null;
    }>`
      SELECT
        kc.id as chunk_id,
        kc.content,
        ks.name as source_name,
        1 - (kc.embedding <=> ${embeddingStr}::vector) as similarity,
        kc.metadata::text as metadata
      FROM knowledge_chunks kc
      JOIN knowledge_sources ks ON ks.id = kc.source_id
      WHERE (
        kc.scope = 'system'
        OR (kc.scope = 'workspace' AND kc.workspace_id = ${workspaceId}::uuid)
        OR (kc.scope = 'space' AND kc.space_id = ${spaceId}::uuid)
      )
      AND kc.embedding IS NOT NULL
      ORDER BY kc.embedding <=> ${embeddingStr}::vector
      LIMIT ${limit}
    `.execute(this.db);

    return results.rows.map((row) => ({
      chunkId: row.chunk_id,
      content: row.content,
      sourceName: row.source_name,
      similarity: Number(row.similarity),
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
    }));
  }

  async storeKnowledgeChunk(params: {
    sourceId: string;
    content: string;
    embedding: number[];
    chunkIndex: number;
    metadata?: Record<string, any>;
    tokenCount?: number;
    scope: 'system' | 'workspace' | 'space';
    workspaceId?: string;
    spaceId?: string;
  }): Promise<string> {
    const embeddingStr = this.formatEmbedding(params.embedding);

    const result = await sql<{ id: string }>`
      INSERT INTO knowledge_chunks (
        source_id, content, embedding, chunk_index, metadata,
        token_count, scope, workspace_id, space_id
      )
      VALUES (
        ${params.sourceId}::uuid,
        ${params.content},
        ${embeddingStr}::vector,
        ${params.chunkIndex},
        ${params.metadata ? JSON.stringify(params.metadata) : null}::jsonb,
        ${params.tokenCount || null},
        ${params.scope},
        ${params.workspaceId || null}::uuid,
        ${params.spaceId || null}::uuid
      )
      RETURNING id
    `.execute(this.db);

    return result.rows[0]?.id || '';
  }

  async deleteKnowledgeChunks(sourceId: string): Promise<void> {
    await sql`
      DELETE FROM knowledge_chunks WHERE source_id = ${sourceId}::uuid
    `.execute(this.db);
  }
}
