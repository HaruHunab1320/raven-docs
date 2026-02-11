import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Knowledge sources table - tracks uploaded documents, URLs, and internal pages
  await db.schema
    .createTable('knowledge_sources')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('name', 'varchar(255)', (col) => col.notNull())
    .addColumn('type', 'varchar(20)', (col) => col.notNull()) // 'url', 'file', 'page'
    .addColumn('source_url', 'text')
    .addColumn('file_id', 'uuid')
    .addColumn('page_id', 'uuid')
    .addColumn('scope', 'varchar(20)', (col) => col.notNull()) // 'system', 'workspace', 'space'
    .addColumn('workspace_id', 'uuid')
    .addColumn('space_id', 'uuid')
    .addColumn('status', 'varchar(20)', (col) =>
      col.notNull().defaultTo('pending'),
    ) // 'pending', 'processing', 'ready', 'error'
    .addColumn('error_message', 'text')
    .addColumn('last_synced_at', 'timestamptz')
    .addColumn('sync_schedule', 'varchar(50)')
    .addColumn('chunk_count', 'integer', (col) => col.defaultTo(0))
    .addColumn('created_by_id', 'uuid', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  // Knowledge chunks table - vectorized content chunks
  await db.schema
    .createTable('knowledge_chunks')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('source_id', 'uuid', (col) =>
      col.notNull().references('knowledge_sources.id').onDelete('cascade'),
    )
    .addColumn('content', 'text', (col) => col.notNull())
    .addColumn('embedding', sql`vector(768)`)
    .addColumn('chunk_index', 'integer', (col) => col.notNull())
    .addColumn('metadata', 'jsonb') // heading hierarchy, section, page number, etc.
    .addColumn('token_count', 'integer')
    .addColumn('scope', 'varchar(20)', (col) => col.notNull())
    .addColumn('workspace_id', 'uuid')
    .addColumn('space_id', 'uuid')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  // HNSW index for fast similarity search on knowledge chunks
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
