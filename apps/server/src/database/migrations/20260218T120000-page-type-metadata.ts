import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Add page_type column for typed pages (hypothesis, experiment, paper, etc.)
  await sql`ALTER TABLE pages ADD COLUMN page_type VARCHAR(50) DEFAULT NULL`.execute(
    db,
  );

  // Add metadata JSONB column for type-specific structured data
  await sql`ALTER TABLE pages ADD COLUMN metadata JSONB DEFAULT NULL`.execute(
    db,
  );

  // Index on page_type for filtering queries (partial index, only non-null)
  await sql`CREATE INDEX idx_pages_page_type ON pages(page_type) WHERE page_type IS NOT NULL`.execute(
    db,
  );

  // GIN index on metadata for JSONB queries (partial index, only non-null)
  await sql`CREATE INDEX idx_pages_metadata ON pages USING GIN (metadata) WHERE metadata IS NOT NULL`.execute(
    db,
  );

  // Composite index for workspace + page_type queries
  await sql`CREATE INDEX idx_pages_workspace_page_type ON pages(workspace_id, page_type) WHERE page_type IS NOT NULL`.execute(
    db,
  );
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP INDEX IF EXISTS idx_pages_workspace_page_type`.execute(db);
  await sql`DROP INDEX IF EXISTS idx_pages_metadata`.execute(db);
  await sql`DROP INDEX IF EXISTS idx_pages_page_type`.execute(db);
  await sql`ALTER TABLE pages DROP COLUMN IF EXISTS metadata`.execute(db);
  await sql`ALTER TABLE pages DROP COLUMN IF EXISTS page_type`.execute(db);
}
