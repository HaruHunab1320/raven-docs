import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Drop existing HNSW indexes (they don't support > 2000 dims)
  await sql`DROP INDEX IF EXISTS memory_embeddings_embedding_idx`.execute(db);
  await sql`DROP INDEX IF EXISTS knowledge_chunks_embedding_idx`.execute(db);

  // Clear existing embeddings (they're incompatible with new dimensions)
  await sql`DELETE FROM memory_embeddings`.execute(db);
  await sql`UPDATE knowledge_chunks SET embedding = NULL`.execute(db);

  // Update memory_embeddings to 3072 dimensions for gemini-embedding-001
  await sql`
    ALTER TABLE memory_embeddings
    ALTER COLUMN embedding TYPE vector(3072)
  `.execute(db);

  // Update knowledge_chunks to 3072 dimensions
  await sql`
    ALTER TABLE knowledge_chunks
    ALTER COLUMN embedding TYPE vector(3072)
  `.execute(db);

  // Note: pgvector HNSW and IVFFlat indexes have a 2000 dimension limit
  // For 3072-dim vectors, we skip indexing. Queries use sequential scan.
  // This is fine for small-to-medium datasets. For production scale,
  // consider using a model with <= 2000 dims or an external vector DB.
}

export async function down(db: Kysely<any>): Promise<void> {
  // Clear embeddings
  await sql`DELETE FROM memory_embeddings`.execute(db);
  await sql`UPDATE knowledge_chunks SET embedding = NULL`.execute(db);

  // Revert to 768 dimensions
  await sql`
    ALTER TABLE memory_embeddings
    ALTER COLUMN embedding TYPE vector(768)
  `.execute(db);

  await sql`
    ALTER TABLE knowledge_chunks
    ALTER COLUMN embedding TYPE vector(768)
  `.execute(db);

  // Recreate HNSW indexes (768 dims fits within 2000 limit)
  await sql`
    CREATE INDEX memory_embeddings_embedding_idx
    ON memory_embeddings
    USING hnsw (embedding vector_cosine_ops)
  `.execute(db);

  await sql`
    CREATE INDEX knowledge_chunks_embedding_idx
    ON knowledge_chunks
    USING hnsw (embedding vector_cosine_ops)
  `.execute(db);
}
