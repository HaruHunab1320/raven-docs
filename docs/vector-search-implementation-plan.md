# Vector Search & Knowledge System Implementation Plan

## Overview

This document outlines the phased implementation of:
1. pgvector for semantic similarity search
2. Knowledge upload system for RAG
3. Migration of agent memory embeddings from Memgraph to pgvector
4. Refactoring Memgraph to focus on graph operations only

## Architecture Target State

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              User Query                                  │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           Query Router                                   │
│                                                                          │
│  "Find notes about Q3"  ──► Semantic search (pgvector)                  │
│  "What's related to X?" ──► Graph traversal (Memgraph)                  │
│  "How do I use Raven?"  ──► Knowledge RAG (pgvector)                    │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
                ┌─────────────────┴─────────────────┐
                ▼                                   ▼
┌───────────────────────────────┐   ┌───────────────────────────────┐
│     Postgres + pgvector       │   │          Memgraph             │
│                               │   │                               │
│  Tables:                      │   │  Nodes:                       │
│  • agent_memories (content)   │   │  • :MemoryNode (metadata)     │
│  • memory_embeddings          │   │  • :Entity                    │
│  • knowledge_sources          │   │                               │
│  • knowledge_chunks           │   │  Edges:                       │
│                               │   │  • :REFERS_TO                 │
│  Indexes:                     │   │  • :RELATED_TO                │
│  • HNSW on embeddings         │   │                               │
│                               │   │  Queries:                     │
│  Queries:                     │   │  • Graph traversals           │
│  • Similarity search          │   │  • Entity co-occurrence       │
│  • K-nearest neighbors        │   │  • Path finding               │
└───────────────────────────────┘   └───────────────────────────────┘
```

---

## Phase 1: pgvector Foundation

**Goal:** Enable pgvector in Postgres and create infrastructure for vector operations.

### 1.1 Enable pgvector Extension

**File:** `apps/server/src/database/migrations/YYYYMMDDTHHMMSS-add-pgvector.ts`

```typescript
import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Enable pgvector extension
  await sql`CREATE EXTENSION IF NOT EXISTS vector`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP EXTENSION IF EXISTS vector`.execute(db);
}
```

### 1.2 Create Memory Embeddings Table

**File:** `apps/server/src/database/migrations/YYYYMMDDTHHMMSS-create-memory-embeddings.ts`

```typescript
import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('memory_embeddings')
    .addColumn('id', 'uuid', (col) => col.primaryKey())
    .addColumn('memory_id', 'uuid', (col) =>
      col.notNull().references('agent_memories.id').onDelete('cascade'))
    .addColumn('embedding', sql`vector(768)`, (col) => col.notNull())
    .addColumn('model', 'varchar(100)', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`))
    .execute();

  // Create HNSW index for fast similarity search
  await sql`
    CREATE INDEX memory_embeddings_embedding_idx
    ON memory_embeddings
    USING hnsw (embedding vector_cosine_ops)
  `.execute(db);

  // Index for lookups by memory_id
  await db.schema
    .createIndex('memory_embeddings_memory_id_idx')
    .on('memory_embeddings')
    .column('memory_id')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('memory_embeddings').execute();
}
```

### 1.3 Create Vector Search Service

**File:** `apps/server/src/integrations/vector/vector-search.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@raven-docs/db/types/kysely.types';
import { sql } from 'kysely';
import { AIService } from '../ai/ai.service';

export interface VectorSearchResult {
  id: string;
  similarity: number;
}

@Injectable()
export class VectorSearchService {
  private readonly logger = new Logger(VectorSearchService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly aiService: AIService,
  ) {}

  async embedText(text: string): Promise<number[]> {
    const model = process.env.GEMINI_EMBEDDING_MODEL || 'text-embedding-004';
    const result = await this.aiService.embedContent({ model, content: text });
    return result.embedding;
  }

  async searchMemories(params: {
    queryEmbedding: number[];
    workspaceId: string;
    spaceId?: string;
    limit?: number;
    minSimilarity?: number;
  }): Promise<VectorSearchResult[]> {
    const { queryEmbedding, workspaceId, spaceId, limit = 10, minSimilarity = 0.5 } = params;

    const embeddingStr = `[${queryEmbedding.join(',')}]`;

    const results = await sql<{ memory_id: string; similarity: number }>`
      SELECT
        me.memory_id,
        1 - (me.embedding <=> ${embeddingStr}::vector) as similarity
      FROM memory_embeddings me
      JOIN agent_memories am ON am.id = me.memory_id
      WHERE am.workspace_id = ${workspaceId}
        AND (${spaceId}::uuid IS NULL OR am.space_id = ${spaceId})
        AND 1 - (me.embedding <=> ${embeddingStr}::vector) >= ${minSimilarity}
      ORDER BY me.embedding <=> ${embeddingStr}::vector
      LIMIT ${limit}
    `.execute(this.db);

    return results.rows.map(row => ({
      id: row.memory_id,
      similarity: row.similarity,
    }));
  }

  async searchKnowledge(params: {
    queryEmbedding: number[];
    workspaceId: string;
    spaceId?: string;
    limit?: number;
  }): Promise<Array<{ chunkId: string; content: string; similarity: number; sourceName: string }>> {
    const { queryEmbedding, workspaceId, spaceId, limit = 5 } = params;

    const embeddingStr = `[${queryEmbedding.join(',')}]`;

    const results = await sql`
      SELECT
        kc.id as chunk_id,
        kc.content,
        ks.name as source_name,
        1 - (kc.embedding <=> ${embeddingStr}::vector) as similarity
      FROM knowledge_chunks kc
      JOIN knowledge_sources ks ON ks.id = kc.source_id
      WHERE (
        kc.scope = 'system'
        OR (kc.scope = 'workspace' AND kc.workspace_id = ${workspaceId})
        OR (kc.scope = 'space' AND kc.space_id = ${spaceId})
      )
      ORDER BY kc.embedding <=> ${embeddingStr}::vector
      LIMIT ${limit}
    `.execute(this.db);

    return results.rows as any;
  }
}
```

### 1.4 Update Kysely Types

**File:** `packages/db/src/types/kysely.types.ts` (add to existing)

```typescript
export interface MemoryEmbeddingsTable {
  id: string;
  memory_id: string;
  embedding: number[]; // Will be handled as vector in queries
  model: string;
  created_at: Date;
}

// Add to Database interface
export interface Database {
  // ... existing tables
  memory_embeddings: MemoryEmbeddingsTable;
}
```

### 1.5 Deliverables Checklist

- [ ] Migration: Enable pgvector extension
- [ ] Migration: Create memory_embeddings table with HNSW index
- [ ] VectorSearchService with embedText() and searchMemories()
- [ ] Update Kysely types
- [ ] Unit tests for vector operations
- [ ] Verify Cloud SQL pgvector support is enabled

---

## Phase 2: Knowledge System

**Goal:** Build the knowledge upload and retrieval system.

### 2.1 Database Schema

**File:** `apps/server/src/database/migrations/YYYYMMDDTHHMMSS-create-knowledge-tables.ts`

```typescript
import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Knowledge sources table
  await db.schema
    .createTable('knowledge_sources')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('name', 'varchar(255)', (col) => col.notNull())
    .addColumn('type', 'varchar(20)', (col) => col.notNull()) // 'url', 'file', 'page'
    .addColumn('source_url', 'text')
    .addColumn('file_id', 'uuid')
    .addColumn('page_id', 'uuid')
    .addColumn('scope', 'varchar(20)', (col) => col.notNull()) // 'system', 'workspace', 'space'
    .addColumn('workspace_id', 'uuid')
    .addColumn('space_id', 'uuid')
    .addColumn('status', 'varchar(20)', (col) => col.notNull().defaultTo('pending'))
    .addColumn('error_message', 'text')
    .addColumn('last_synced_at', 'timestamptz')
    .addColumn('sync_schedule', 'varchar(50)')
    .addColumn('chunk_count', 'integer', (col) => col.defaultTo(0))
    .addColumn('created_by_id', 'uuid', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Knowledge chunks table
  await db.schema
    .createTable('knowledge_chunks')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('source_id', 'uuid', (col) =>
      col.notNull().references('knowledge_sources.id').onDelete('cascade'))
    .addColumn('content', 'text', (col) => col.notNull())
    .addColumn('embedding', sql`vector(768)`)
    .addColumn('chunk_index', 'integer', (col) => col.notNull())
    .addColumn('metadata', 'jsonb') // heading hierarchy, section, etc.
    .addColumn('token_count', 'integer')
    .addColumn('scope', 'varchar(20)', (col) => col.notNull())
    .addColumn('workspace_id', 'uuid')
    .addColumn('space_id', 'uuid')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // HNSW index for similarity search
  await sql`
    CREATE INDEX knowledge_chunks_embedding_idx
    ON knowledge_chunks
    USING hnsw (embedding vector_cosine_ops)
  `.execute(db);

  // Indexes for filtering
  await db.schema
    .createIndex('knowledge_chunks_source_idx')
    .on('knowledge_chunks')
    .column('source_id')
    .execute();

  await db.schema
    .createIndex('knowledge_chunks_scope_idx')
    .on('knowledge_chunks')
    .columns(['scope', 'workspace_id', 'space_id'])
    .execute();

  await db.schema
    .createIndex('knowledge_sources_scope_idx')
    .on('knowledge_sources')
    .columns(['scope', 'workspace_id', 'space_id'])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('knowledge_chunks').execute();
  await db.schema.dropTable('knowledge_sources').execute();
}
```

### 2.2 Knowledge Processing Service

**File:** `apps/server/src/core/knowledge/knowledge-processor.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@raven-docs/db/types/kysely.types';
import { VectorSearchService } from '../../integrations/vector/vector-search.service';

interface ChunkMetadata {
  headings?: string[];
  section?: string;
  pageNumber?: number;
}

@Injectable()
export class KnowledgeProcessorService {
  private readonly logger = new Logger(KnowledgeProcessorService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    @InjectQueue('knowledge') private knowledgeQueue: Queue,
    private readonly vectorSearch: VectorSearchService,
  ) {}

  async queueSourceProcessing(sourceId: string): Promise<void> {
    await this.knowledgeQueue.add('process-source', { sourceId });
  }

  async processSource(sourceId: string): Promise<void> {
    const source = await this.db
      .selectFrom('knowledge_sources')
      .selectAll()
      .where('id', '=', sourceId)
      .executeTakeFirst();

    if (!source) {
      throw new Error(`Source ${sourceId} not found`);
    }

    try {
      await this.db
        .updateTable('knowledge_sources')
        .set({ status: 'processing', updated_at: new Date() })
        .where('id', '=', sourceId)
        .execute();

      // Fetch content based on source type
      let content: string;
      switch (source.type) {
        case 'url':
          content = await this.fetchUrlContent(source.source_url!);
          break;
        case 'file':
          content = await this.extractFileContent(source.file_id!);
          break;
        case 'page':
          content = await this.getPageContent(source.page_id!);
          break;
        default:
          throw new Error(`Unknown source type: ${source.type}`);
      }

      // Chunk the content
      const chunks = this.chunkContent(content);

      // Delete existing chunks
      await this.db
        .deleteFrom('knowledge_chunks')
        .where('source_id', '=', sourceId)
        .execute();

      // Process chunks in batches
      const batchSize = 10;
      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        await this.processChunkBatch(source, batch, i);
      }

      // Update source status
      await this.db
        .updateTable('knowledge_sources')
        .set({
          status: 'ready',
          chunk_count: chunks.length,
          last_synced_at: new Date(),
          error_message: null,
          updated_at: new Date(),
        })
        .where('id', '=', sourceId)
        .execute();

    } catch (error: any) {
      this.logger.error(`Failed to process source ${sourceId}:`, error);
      await this.db
        .updateTable('knowledge_sources')
        .set({
          status: 'error',
          error_message: error.message,
          updated_at: new Date(),
        })
        .where('id', '=', sourceId)
        .execute();
      throw error;
    }
  }

  private async fetchUrlContent(url: string): Promise<string> {
    // TODO: Implement web scraping with proper HTML to markdown conversion
    const response = await fetch(url);
    const html = await response.text();
    // Use a library like turndown to convert HTML to markdown
    return html; // Placeholder
  }

  private async extractFileContent(fileId: string): Promise<string> {
    // TODO: Implement file content extraction
    // Support: PDF, DOCX, MD, TXT
    // Use libraries like pdf-parse, mammoth, etc.
    return ''; // Placeholder
  }

  private async getPageContent(pageId: string): Promise<string> {
    const page = await this.db
      .selectFrom('pages')
      .select(['content', 'text_content'])
      .where('id', '=', pageId)
      .executeTakeFirst();

    return page?.text_content || '';
  }

  private chunkContent(content: string): Array<{ text: string; metadata: ChunkMetadata }> {
    const chunks: Array<{ text: string; metadata: ChunkMetadata }> = [];

    // Split by headers first
    const sections = content.split(/(?=^#{1,3}\s)/m);

    for (const section of sections) {
      if (!section.trim()) continue;

      // Extract heading if present
      const headingMatch = section.match(/^(#{1,3})\s+(.+)/);
      const heading = headingMatch ? headingMatch[2].trim() : undefined;

      // Split long sections into smaller chunks
      const paragraphs = section.split(/\n\n+/);
      let currentChunk = '';

      for (const para of paragraphs) {
        if ((currentChunk + para).length > 1000) {
          if (currentChunk) {
            chunks.push({
              text: currentChunk.trim(),
              metadata: { headings: heading ? [heading] : [] },
            });
          }
          currentChunk = para;
        } else {
          currentChunk += '\n\n' + para;
        }
      }

      if (currentChunk.trim()) {
        chunks.push({
          text: currentChunk.trim(),
          metadata: { headings: heading ? [heading] : [] },
        });
      }
    }

    return chunks;
  }

  private async processChunkBatch(
    source: any,
    chunks: Array<{ text: string; metadata: ChunkMetadata }>,
    startIndex: number,
  ): Promise<void> {
    // Generate embeddings for all chunks in batch
    const embeddings = await Promise.all(
      chunks.map(chunk => this.vectorSearch.embedText(chunk.text))
    );

    // Insert chunks with embeddings
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = embeddings[i];
      const embeddingStr = `[${embedding.join(',')}]`;

      await this.db
        .insertInto('knowledge_chunks')
        .values({
          source_id: source.id,
          content: chunk.text,
          embedding: embeddingStr as any,
          chunk_index: startIndex + i,
          metadata: JSON.stringify(chunk.metadata),
          token_count: Math.ceil(chunk.text.length / 4), // Rough estimate
          scope: source.scope,
          workspace_id: source.workspace_id,
          space_id: source.space_id,
        })
        .execute();
    }
  }
}
```

### 2.3 Knowledge Source CRUD Service

**File:** `apps/server/src/core/knowledge/knowledge.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@raven-docs/db/types/kysely.types';
import { KnowledgeProcessorService } from './knowledge-processor.service';
import { VectorSearchService } from '../../integrations/vector/vector-search.service';

export interface CreateKnowledgeSourceInput {
  name: string;
  type: 'url' | 'file' | 'page';
  sourceUrl?: string;
  fileId?: string;
  pageId?: string;
  scope: 'system' | 'workspace' | 'space';
  workspaceId?: string;
  spaceId?: string;
  createdById: string;
  syncSchedule?: string;
}

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly processor: KnowledgeProcessorService,
    private readonly vectorSearch: VectorSearchService,
  ) {}

  async createSource(input: CreateKnowledgeSourceInput) {
    const source = await this.db
      .insertInto('knowledge_sources')
      .values({
        name: input.name,
        type: input.type,
        source_url: input.sourceUrl,
        file_id: input.fileId,
        page_id: input.pageId,
        scope: input.scope,
        workspace_id: input.workspaceId,
        space_id: input.spaceId,
        created_by_id: input.createdById,
        status: 'pending',
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Queue processing
    await this.processor.queueSourceProcessing(source.id);

    return source;
  }

  async listSources(params: {
    workspaceId: string;
    spaceId?: string;
    includeSystem?: boolean;
  }) {
    let query = this.db
      .selectFrom('knowledge_sources')
      .selectAll()
      .where((eb) =>
        eb.or([
          eb('workspace_id', '=', params.workspaceId),
          ...(params.spaceId ? [eb('space_id', '=', params.spaceId)] : []),
          ...(params.includeSystem ? [eb('scope', '=', 'system')] : []),
        ])
      )
      .orderBy('created_at', 'desc');

    return query.execute();
  }

  async deleteSource(sourceId: string) {
    // Chunks will cascade delete
    await this.db
      .deleteFrom('knowledge_sources')
      .where('id', '=', sourceId)
      .execute();
  }

  async refreshSource(sourceId: string) {
    await this.processor.queueSourceProcessing(sourceId);
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
      limit: params.limit,
    });
  }
}
```

### 2.4 Knowledge API Controller

**File:** `apps/server/src/core/knowledge/knowledge.controller.ts`

```typescript
import { Controller, Post, Get, Delete, Body, Param, Query } from '@nestjs/common';
import { KnowledgeService, CreateKnowledgeSourceInput } from './knowledge.service';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { JwtUser } from '../../auth/types';

@Controller('knowledge')
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Post('sources')
  async createSource(
    @Body() input: CreateKnowledgeSourceInput,
    @AuthUser() user: JwtUser,
  ) {
    return this.knowledgeService.createSource({
      ...input,
      createdById: user.sub,
    });
  }

  @Get('sources')
  async listSources(
    @Query('workspaceId') workspaceId: string,
    @Query('spaceId') spaceId?: string,
  ) {
    return this.knowledgeService.listSources({
      workspaceId,
      spaceId,
      includeSystem: true,
    });
  }

  @Delete('sources/:id')
  async deleteSource(@Param('id') id: string) {
    return this.knowledgeService.deleteSource(id);
  }

  @Post('sources/:id/refresh')
  async refreshSource(@Param('id') id: string) {
    return this.knowledgeService.refreshSource(id);
  }

  @Post('search')
  async search(
    @Body() body: { query: string; workspaceId: string; spaceId?: string; limit?: number },
  ) {
    return this.knowledgeService.searchKnowledge(body);
  }
}
```

### 2.5 Seed Raven Docs as System Knowledge

**File:** `apps/server/src/database/seeds/seed-system-knowledge.ts`

```typescript
// Script to seed Raven Docs documentation as system knowledge
// Run manually or as part of deployment

export async function seedSystemKnowledge(db: KyselyDB) {
  const docsUrls = [
    'https://docs.ravendocs.com/getting-started',
    'https://docs.ravendocs.com/features/pages',
    'https://docs.ravendocs.com/features/projects',
    'https://docs.ravendocs.com/features/tasks',
    // ... add all doc pages
  ];

  for (const url of docsUrls) {
    await db
      .insertInto('knowledge_sources')
      .values({
        name: `Raven Docs - ${url.split('/').pop()}`,
        type: 'url',
        source_url: url,
        scope: 'system',
        created_by_id: 'system',
        status: 'pending',
      })
      .onConflict((oc) => oc.doNothing())
      .execute();
  }
}
```

### 2.6 Deliverables Checklist

- [ ] Migrations for knowledge_sources and knowledge_chunks
- [ ] KnowledgeProcessorService with chunking logic
- [ ] KnowledgeService for CRUD operations
- [ ] KnowledgeController API endpoints
- [ ] BullMQ queue for async processing
- [ ] URL fetching with HTML to markdown conversion
- [ ] File content extraction (PDF, DOCX, MD, TXT)
- [ ] Seed script for Raven Docs as system knowledge
- [ ] Unit tests
- [ ] API documentation

---

## Phase 3: Migrate Agent Memory Embeddings

**Goal:** Move embedding storage from Memgraph to Postgres, keep graph relationships in Memgraph.

### 3.1 Migration Script

**File:** `apps/server/src/database/migrations/YYYYMMDDTHHMMSS-migrate-memory-embeddings.ts`

```typescript
import { Kysely, sql } from 'kysely';

// Note: This migration requires data migration from Memgraph
// Run the data migration script separately after this schema migration

export async function up(db: Kysely<any>): Promise<void> {
  // memory_embeddings table already created in Phase 1
  // This migration is for documentation purposes

  // Add a flag to track migration status
  await db.schema
    .alterTable('agent_memories')
    .addColumn('embedding_migrated', 'boolean', (col) => col.defaultTo(false))
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('agent_memories')
    .dropColumn('embedding_migrated')
    .execute();
}
```

### 3.2 Data Migration Script

**File:** `apps/server/src/scripts/migrate-embeddings-to-postgres.ts`

```typescript
import { MemgraphService } from '../integrations/memgraph/memgraph.service';
import { KyselyDB } from '@raven-docs/db/types/kysely.types';

export async function migrateEmbeddingsToPostgres(
  memgraph: MemgraphService,
  db: KyselyDB,
) {
  const session = memgraph.getSession();
  const batchSize = 100;
  let offset = 0;
  let totalMigrated = 0;

  try {
    while (true) {
      // Fetch batch from Memgraph
      const result = await session.run(`
        MATCH (m:MemoryNode)
        WHERE m.embedding IS NOT NULL AND size(m.embedding) > 0
        RETURN m.id as id, m.embedding as embedding, m.embeddingModel as model
        SKIP $offset
        LIMIT $limit
      `, { offset, limit: batchSize });

      if (result.records.length === 0) break;

      // Insert into Postgres
      for (const record of result.records) {
        const id = record.get('id');
        const embedding = record.get('embedding');
        const model = record.get('model') || 'text-embedding-004';

        if (!embedding || embedding.length === 0) continue;

        const embeddingStr = `[${embedding.join(',')}]`;

        await db
          .insertInto('memory_embeddings')
          .values({
            id: crypto.randomUUID(),
            memory_id: id,
            embedding: embeddingStr as any,
            model,
          })
          .onConflict((oc) => oc.column('memory_id').doNothing())
          .execute();

        // Mark as migrated
        await db
          .updateTable('agent_memories')
          .set({ embedding_migrated: true })
          .where('id', '=', id)
          .execute();
      }

      totalMigrated += result.records.length;
      console.log(`Migrated ${totalMigrated} embeddings...`);
      offset += batchSize;
    }

    console.log(`Migration complete. Total: ${totalMigrated}`);
  } finally {
    await session.close();
  }
}
```

### 3.3 Refactor Agent Memory Service

**File:** `apps/server/src/core/agent-memory/agent-memory.service.ts` (updates)

```typescript
// Add VectorSearchService to constructor
constructor(
  @InjectKysely() private readonly db: KyselyDB,
  private readonly memgraph: MemgraphService,
  private readonly aiService: AIService,
  private readonly vectorSearch: VectorSearchService, // NEW
) {}

// Remove the cosineSimilarity method (no longer needed)

// Update ingestMemory to store embeddings in Postgres
async ingestMemory(input: {...}): Promise<MemoryRecord> {
  // ... existing Postgres insert for agent_memories ...

  const embeddingInput = summary || contentText;
  const embedding = embeddingInput ? await this.vectorSearch.embedText(embeddingInput) : [];

  // Store embedding in Postgres instead of Memgraph
  if (embedding.length > 0) {
    const embeddingStr = `[${embedding.join(',')}]`;
    await this.db
      .insertInto('memory_embeddings')
      .values({
        id: crypto.randomUUID(),
        memory_id: memoryId,
        embedding: embeddingStr as any,
        model: process.env.GEMINI_EMBEDDING_MODEL || 'text-embedding-004',
      })
      .execute();
  }

  // Memgraph: only store node metadata and relationships, NO embedding
  const session = this.memgraph.getSession();
  try {
    await session.run(`
      MERGE (m:MemoryNode {id: $id})
      SET m.workspaceId = $workspaceId,
          m.spaceId = $spaceId,
          m.creatorId = $creatorId,
          m.source = $source,
          m.summary = $summary,
          m.tags = $tags,
          m.timestamp = $timestamp,
          m.timestampMs = $timestampMs
      // NO embedding property
    `, { ... });

    // Entity relationships still in Memgraph
    if (input.entities?.length) {
      // ... existing entity relationship code ...
    }
  } finally {
    await session.close();
  }

  return { ... };
}

// Refactor queryMemories to use pgvector
async queryMemories(
  filters: MemoryQueryFilters,
  queryText?: string,
): Promise<any[]> {
  const limit = filters.limit || 20;

  // If semantic search needed, use pgvector
  if (queryText) {
    const embedding = await this.vectorSearch.embedText(queryText);
    const similarIds = await this.vectorSearch.searchMemories({
      queryEmbedding: embedding,
      workspaceId: filters.workspaceId,
      spaceId: filters.spaceId,
      limit: limit * 2, // Fetch more for filtering
    });

    if (similarIds.length === 0) {
      return [];
    }

    // Fetch full records from Postgres
    const memories = await this.db
      .selectFrom('agent_memories')
      .selectAll()
      .where('id', 'in', similarIds.map(s => s.id))
      .execute();

    // Merge with similarity scores
    const scoreMap = new Map(similarIds.map(s => [s.id, s.similarity]));
    return memories
      .map(m => ({ ...m, score: scoreMap.get(m.id) || 0 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  // Non-semantic query: just use Postgres
  let query = this.db
    .selectFrom('agent_memories')
    .selectAll()
    .where('workspace_id', '=', filters.workspaceId);

  if (filters.spaceId) {
    query = query.where('space_id', '=', filters.spaceId);
  }
  if (filters.from) {
    query = query.where('created_at', '>=', filters.from);
  }
  if (filters.to) {
    query = query.where('created_at', '<=', filters.to);
  }

  return query.orderBy('created_at', 'desc').limit(limit).execute();
}

// Graph methods stay the same - they still query Memgraph for relationships
async getMemoryGraph(filters: ...) {
  // ... existing Memgraph graph query (no changes) ...
}

async getEntityMemories(filters: ...) {
  // ... existing Memgraph entity query (no changes) ...
}
```

### 3.4 Cleanup: Remove Embeddings from Memgraph

After migration is complete and verified:

```typescript
// Run after migration is verified
async function cleanupMemgraphEmbeddings(memgraph: MemgraphService) {
  const session = memgraph.getSession();
  try {
    await session.run(`
      MATCH (m:MemoryNode)
      REMOVE m.embedding, m.embeddingModel
    `);
  } finally {
    await session.close();
  }
}
```

### 3.5 Deliverables Checklist

- [ ] Data migration script from Memgraph to Postgres
- [ ] Refactor AgentMemoryService.ingestMemory() to store embeddings in Postgres
- [ ] Refactor AgentMemoryService.queryMemories() to use VectorSearchService
- [ ] Keep graph methods unchanged (Memgraph)
- [ ] Integration tests for new query flow
- [ ] Cleanup script to remove embeddings from Memgraph
- [ ] Monitoring for query performance

---

## Phase 4: Memgraph Optimization

**Goal:** Optimize Memgraph for graph-only operations.

### 4.1 Switch to memgraph-mage Image

**File:** `infra/modules/memgraph/main.tf`

```hcl
locals {
  memgraph_startup_script = <<-EOF
    #!/bin/bash
    set -e

    # ... existing setup ...

    # Use memgraph-mage for MAGE algorithms
    docker pull memgraph/memgraph-mage:2.11.0
    docker run -d \
      --name memgraph \
      --restart always \
      -p 7687:7687 \
      -p 7444:7444 \
      -v /var/lib/memgraph:/var/lib/memgraph \
      memgraph/memgraph-mage:2.11.0 \
      --log-level=INFO \
      --also-log-to-stderr
  EOF
}
```

### 4.2 Optimize Graph Queries

Now that embeddings are in Postgres, we can optimize Memgraph for pure graph operations:

```cypher
-- Create indexes for common queries
CREATE INDEX ON :MemoryNode(workspaceId);
CREATE INDEX ON :MemoryNode(spaceId);
CREATE INDEX ON :MemoryNode(timestampMs);
CREATE INDEX ON :Entity(id);
CREATE INDEX ON :Entity(type);
```

### 4.3 Deliverables Checklist

- [ ] Update Terraform to use memgraph-mage:2.11.0
- [ ] Add Memgraph indexes for common query patterns
- [ ] Remove embedding-related code from Memgraph queries
- [ ] Performance testing for graph queries

---

## Phase 5: Agent Integration

**Goal:** Integrate knowledge retrieval into agent chat.

### 5.1 Update Agent Context Builder

**File:** `apps/server/src/core/agent/agent-context.service.ts` (updates)

```typescript
async buildContext(params: {
  workspaceId: string;
  spaceId?: string;
  pageId?: string;
  query?: string;
}): Promise<AgentContext> {
  const context: AgentContext = {
    memories: [],
    knowledge: [],
    entities: [],
  };

  if (params.query) {
    // Semantic search for relevant memories
    context.memories = await this.memoryService.queryMemories(
      { workspaceId: params.workspaceId, spaceId: params.spaceId, limit: 5 },
      params.query,
    );

    // Search knowledge base (including Raven Docs help)
    context.knowledge = await this.knowledgeService.searchKnowledge({
      query: params.query,
      workspaceId: params.workspaceId,
      spaceId: params.spaceId,
      limit: 3,
    });
  }

  // Get relevant entities from graph
  context.entities = await this.memoryService.listTopEntities({
    workspaceId: params.workspaceId,
    spaceId: params.spaceId,
    limit: 10,
  });

  return context;
}
```

### 5.2 Update System Prompt

```typescript
function buildSystemPrompt(context: AgentContext): string {
  let prompt = `You are a helpful assistant for Raven Docs.\n\n`;

  if (context.knowledge.length > 0) {
    prompt += `## Relevant Documentation\n\n`;
    for (const chunk of context.knowledge) {
      prompt += `### ${chunk.sourceName}\n${chunk.content}\n\n`;
    }
  }

  if (context.memories.length > 0) {
    prompt += `## Relevant Context from User's Workspace\n\n`;
    for (const memory of context.memories) {
      prompt += `- ${memory.summary}\n`;
    }
  }

  return prompt;
}
```

### 5.3 Deliverables Checklist

- [ ] Update agent context builder to include knowledge search
- [ ] Update system prompt to include knowledge results
- [ ] Add knowledge attribution in responses
- [ ] Test agent responses with documentation context

---

## Timeline Summary

| Phase | Description | Estimated Effort |
|-------|-------------|------------------|
| 1 | pgvector Foundation | 1-2 days |
| 2 | Knowledge System | 3-5 days |
| 3 | Migrate Agent Memory | 2-3 days |
| 4 | Memgraph Optimization | 1 day |
| 5 | Agent Integration | 1-2 days |

**Total: ~8-13 days**

## Testing Strategy

1. **Unit Tests:** Each service method
2. **Integration Tests:** End-to-end query flows
3. **Performance Tests:** Compare query latency before/after
4. **Migration Tests:** Verify data integrity after migration

## Rollback Plan

1. Keep Memgraph embeddings until Postgres migration is verified
2. Feature flag for new vs old query path
3. Ability to re-run migration if needed

## Monitoring

- Query latency metrics (pgvector vs old approach)
- Embedding generation success/failure rates
- Knowledge chunk counts and processing status
- Memory usage in Postgres vs Memgraph
