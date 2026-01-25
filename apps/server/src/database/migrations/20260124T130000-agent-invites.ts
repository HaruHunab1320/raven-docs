import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Create agent_invites table
  await db.schema
    .createTable('agent_invites')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('name', 'varchar', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('token', 'varchar', (col) => col.notNull().unique())
    .addColumn('permissions', sql`text[]`, (col) =>
      col.defaultTo(sql`'{}'::text[]`),
    )
    .addColumn('uses_remaining', 'integer') // NULL = unlimited
    .addColumn('uses_count', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('expires_at', 'timestamptz')
    .addColumn('revoked_at', 'timestamptz')
    .addColumn('created_by', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  // Add invite_id to parallax_agents to track which invite was used
  await db.schema
    .alterTable('parallax_agents')
    .addColumn('invite_id', 'uuid', (col) =>
      col.references('agent_invites.id').onDelete('set null'),
    )
    .execute();

  // Add agent_accessible column to pages (default true, users can opt-out)
  await db.schema
    .alterTable('pages')
    .addColumn('agent_accessible', 'boolean', (col) => col.defaultTo(true))
    .execute();

  // Add agent_accessible column to tasks (NULL = inherit from project, explicit value overrides)
  await db.schema
    .alterTable('tasks')
    .addColumn('agent_accessible', 'boolean') // NULL = inherit
    .execute();

  // Create indexes
  await db.schema
    .createIndex('idx_agent_invites_workspace')
    .on('agent_invites')
    .column('workspace_id')
    .execute();

  await db.schema
    .createIndex('idx_agent_invites_token')
    .on('agent_invites')
    .column('token')
    .execute();

  await db.schema
    .createIndex('idx_pages_agent_accessible')
    .on('pages')
    .column('agent_accessible')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop indexes
  await db.schema.dropIndex('idx_pages_agent_accessible').execute();
  await db.schema.dropIndex('idx_agent_invites_token').execute();
  await db.schema.dropIndex('idx_agent_invites_workspace').execute();

  // Remove columns
  await db.schema.alterTable('tasks').dropColumn('agent_accessible').execute();
  await db.schema.alterTable('pages').dropColumn('agent_accessible').execute();
  await db.schema.alterTable('parallax_agents').dropColumn('invite_id').execute();

  // Drop table
  await db.schema.dropTable('agent_invites').execute();
}
