import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Enable pgvector extension for vector similarity search
  await sql`CREATE EXTENSION IF NOT EXISTS vector`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP EXTENSION IF EXISTS vector`.execute(db);
}
