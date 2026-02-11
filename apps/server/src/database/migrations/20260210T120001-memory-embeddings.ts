import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Create memory_embeddings table for vector storage
  await db.schema
    .createTable('memory_embeddings')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('memory_id', 'uuid', (col) =>
      col.notNull().references('agent_memories.id').onDelete('cascade'),
    )
    .addColumn('embedding', sql`vector(768)`, (col) => col.notNull())
    .addColumn('model', 'varchar(100)', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  // Create HNSW index for fast approximate nearest neighbor search
  // Using cosine distance (vector_cosine_ops)
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
    .unique()
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('memory_embeddings').execute();
}
