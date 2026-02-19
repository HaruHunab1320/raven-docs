import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Create coding_workspaces table — tracks provisioned git workspaces for coding swarms
  await db.schema
    .createTable('coding_workspaces')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('space_id', 'uuid', (col) =>
      col.references('spaces.id').onDelete('set null'),
    )
    .addColumn('experiment_id', 'uuid', (col) =>
      col.references('pages.id').onDelete('set null'),
    )
    .addColumn('repo_url', 'varchar', (col) => col.notNull())
    .addColumn('branch', 'varchar', (col) => col.notNull())
    .addColumn('worktree_path', 'varchar')
    .addColumn('workspace_type', 'varchar', (col) =>
      col.notNull().defaultTo('worktree'),
    ) // worktree, clone
    .addColumn('base_branch', 'varchar', (col) => col.defaultTo('main'))
    .addColumn('status', 'varchar', (col) =>
      col.notNull().defaultTo('pending'),
    ) // pending, provisioning, ready, finalizing, finalized, cleaned, error
    .addColumn('pr_url', 'varchar')
    .addColumn('pr_number', 'integer')
    .addColumn('commit_sha', 'varchar')
    .addColumn('error_message', 'text')
    .addColumn('config', 'jsonb', (col) =>
      col.defaultTo(sql`'{}'::jsonb`),
    )
    .addColumn('metadata', 'jsonb', (col) =>
      col.defaultTo(sql`'{}'::jsonb`),
    )
    .addColumn('provisioned_by', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('cleaned_at', 'timestamptz')
    .execute();

  // Create swarm_executions table — tracks individual coding agent executions
  await db.schema
    .createTable('swarm_executions')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('space_id', 'uuid', (col) =>
      col.references('spaces.id').onDelete('set null'),
    )
    .addColumn('experiment_id', 'uuid', (col) =>
      col.references('pages.id').onDelete('set null'),
    )
    .addColumn('coding_workspace_id', 'uuid', (col) =>
      col.references('coding_workspaces.id').onDelete('set null'),
    )
    .addColumn('agent_type', 'varchar', (col) =>
      col.notNull().defaultTo('claude-code'),
    ) // claude-code, aider, codex, gemini-cli
    .addColumn('agent_id', 'varchar')
    .addColumn('runtime_session_id', 'varchar')
    .addColumn('terminal_session_id', 'uuid', (col) =>
      col.references('terminal_sessions.id').onDelete('set null'),
    )
    .addColumn('task_description', 'text', (col) => col.notNull())
    .addColumn('task_context', 'jsonb', (col) =>
      col.defaultTo(sql`'{}'::jsonb`),
    )
    .addColumn('status', 'varchar', (col) =>
      col.notNull().defaultTo('pending'),
    ) // pending, provisioning, spawning, running, capturing, finalizing, completed, failed, cancelled
    .addColumn('output_summary', 'text')
    .addColumn('exit_code', 'integer')
    .addColumn('results', 'jsonb', (col) =>
      col.defaultTo(sql`'{}'::jsonb`),
    )
    .addColumn('files_changed', 'jsonb', (col) =>
      col.defaultTo(sql`'[]'::jsonb`),
    )
    .addColumn('started_at', 'timestamptz')
    .addColumn('completed_at', 'timestamptz')
    .addColumn('error_message', 'text')
    .addColumn('config', 'jsonb', (col) =>
      col.defaultTo(sql`'{}'::jsonb`),
    )
    .addColumn('metadata', 'jsonb', (col) =>
      col.defaultTo(sql`'{}'::jsonb`),
    )
    .addColumn('triggered_by', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  // Indexes for coding_workspaces
  await db.schema
    .createIndex('idx_coding_workspaces_workspace')
    .on('coding_workspaces')
    .column('workspace_id')
    .execute();

  await db.schema
    .createIndex('idx_coding_workspaces_experiment')
    .on('coding_workspaces')
    .column('experiment_id')
    .execute();

  await db.schema
    .createIndex('idx_coding_workspaces_status')
    .on('coding_workspaces')
    .column('status')
    .execute();

  // Indexes for swarm_executions
  await db.schema
    .createIndex('idx_swarm_executions_workspace')
    .on('swarm_executions')
    .column('workspace_id')
    .execute();

  await db.schema
    .createIndex('idx_swarm_executions_experiment')
    .on('swarm_executions')
    .column('experiment_id')
    .execute();

  await db.schema
    .createIndex('idx_swarm_executions_status')
    .on('swarm_executions')
    .column('status')
    .execute();

  await db.schema
    .createIndex('idx_swarm_executions_coding_workspace')
    .on('swarm_executions')
    .column('coding_workspace_id')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex('idx_swarm_executions_coding_workspace').execute();
  await db.schema.dropIndex('idx_swarm_executions_status').execute();
  await db.schema.dropIndex('idx_swarm_executions_experiment').execute();
  await db.schema.dropIndex('idx_swarm_executions_workspace').execute();

  await db.schema.dropIndex('idx_coding_workspaces_status').execute();
  await db.schema.dropIndex('idx_coding_workspaces_experiment').execute();
  await db.schema.dropIndex('idx_coding_workspaces_workspace').execute();

  await db.schema.dropTable('swarm_executions').execute();
  await db.schema.dropTable('coding_workspaces').execute();
}
