import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('mcp_api_keys')
    .addColumn('id', 'varchar', (col) => col.primaryKey().notNull())
    .addColumn('user_id', 'varchar', (col) => col.notNull())
    .addColumn('workspace_id', 'varchar', (col) => col.notNull())
    .addColumn('name', 'varchar', (col) => col.notNull())
    .addColumn('hashed_key', 'varchar', (col) => col.notNull().unique())
    .addColumn('created_at', 'timestamp', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('last_used_at', 'timestamp')
    .execute();

  // Add indexes for faster lookups
  await db.schema
    .createIndex('mcp_api_keys_user_idx')
    .on('mcp_api_keys')
    .column('user_id')
    .execute();

  await db.schema
    .createIndex('mcp_api_keys_workspace_idx')
    .on('mcp_api_keys')
    .column('workspace_id')
    .execute();

  await db.schema
    .createIndex('mcp_api_keys_hashed_key_idx')
    .on('mcp_api_keys')
    .column('hashed_key')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('mcp_api_keys').execute();
}
