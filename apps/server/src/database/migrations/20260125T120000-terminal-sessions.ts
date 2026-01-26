import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Create enum for terminal session status
  await sql`
    CREATE TYPE terminal_session_status AS ENUM (
      'pending',
      'connecting',
      'active',
      'login_required',
      'disconnected',
      'terminated'
    )
  `.execute(db);

  // Create terminal_sessions table
  await db.schema
    .createTable('terminal_sessions')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.references('workspaces.id').onDelete('cascade').notNull(),
    )
    .addColumn('agent_id', 'varchar', (col) =>
      col.references('parallax_agents.id').onDelete('cascade').notNull(),
    )
    .addColumn('runtime_session_id', 'varchar', (col) => col.notNull())
    .addColumn('status', sql`terminal_session_status`, (col) =>
      col.notNull().defaultTo('pending'),
    )
    .addColumn('title', 'varchar')
    .addColumn('cols', 'integer', (col) => col.defaultTo(80))
    .addColumn('rows', 'integer', (col) => col.defaultTo(24))
    .addColumn('runtime_endpoint', 'varchar')
    .addColumn('last_activity_at', 'timestamptz')
    .addColumn('connected_user_id', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .addColumn('metadata', 'jsonb', (col) => col.defaultTo('{}'))
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('terminated_at', 'timestamptz')
    .execute();

  // Create index for looking up sessions by agent
  await db.schema
    .createIndex('terminal_sessions_agent_id_idx')
    .on('terminal_sessions')
    .column('agent_id')
    .execute();

  // Create index for looking up active sessions by workspace
  await db.schema
    .createIndex('terminal_sessions_workspace_status_idx')
    .on('terminal_sessions')
    .columns(['workspace_id', 'status'])
    .execute();

  // Create terminal_session_logs table for activity capture
  await db.schema
    .createTable('terminal_session_logs')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('session_id', 'uuid', (col) =>
      col.references('terminal_sessions.id').onDelete('cascade').notNull(),
    )
    .addColumn('log_type', 'varchar', (col) => col.notNull()) // 'stdout', 'stderr', 'stdin', 'system'
    .addColumn('content', 'text')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  // Create index for looking up logs by session
  await db.schema
    .createIndex('terminal_session_logs_session_id_idx')
    .on('terminal_session_logs')
    .column('session_id')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('terminal_session_logs').execute();
  await db.schema.dropTable('terminal_sessions').execute();
  await sql`DROP TYPE terminal_session_status`.execute(db);
}
