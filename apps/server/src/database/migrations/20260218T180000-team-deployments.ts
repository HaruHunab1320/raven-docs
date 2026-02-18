import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Create team_deployments table — tracks deployed agent teams
  await db.schema
    .createTable('team_deployments')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('space_id', 'uuid', (col) =>
      col.notNull().references('spaces.id').onDelete('cascade'),
    )
    .addColumn('project_id', 'uuid', (col) =>
      col.references('projects.id').onDelete('set null'),
    )
    .addColumn('template_name', 'varchar', (col) => col.notNull())
    .addColumn('status', 'varchar', (col) =>
      col.notNull().defaultTo('active'),
    ) // active, paused, completed, torn_down
    .addColumn('config', 'jsonb', (col) =>
      col.notNull().defaultTo(sql`'{}'::jsonb`),
    ) // full template snapshot at deploy time
    .addColumn('deployed_by', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('torn_down_at', 'timestamptz')
    .execute();

  // Create team_agents table — individual agent instances within a deployment
  await db.schema
    .createTable('team_agents')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('deployment_id', 'uuid', (col) =>
      col.notNull().references('team_deployments.id').onDelete('cascade'),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('user_id', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    ) // pseudo-user created for this agent
    .addColumn('role', 'varchar', (col) => col.notNull()) // collaborator, researcher, synthesizer, etc.
    .addColumn('instance_number', 'integer', (col) => col.notNull()) // 1-based index for role
    .addColumn('status', 'varchar', (col) =>
      col.notNull().defaultTo('idle'),
    ) // idle, running, paused, error
    .addColumn('system_prompt', 'text', (col) => col.notNull())
    .addColumn('capabilities', sql`text[]`, (col) =>
      col.notNull().defaultTo(sql`'{}'::text[]`),
    )
    .addColumn('last_run_at', 'timestamptz')
    .addColumn('last_run_summary', 'text')
    .addColumn('total_actions', 'integer', (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn('total_errors', 'integer', (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  // Indexes
  await db.schema
    .createIndex('idx_team_deployments_workspace')
    .on('team_deployments')
    .column('workspace_id')
    .execute();

  await db.schema
    .createIndex('idx_team_deployments_space')
    .on('team_deployments')
    .column('space_id')
    .execute();

  await db.schema
    .createIndex('idx_team_deployments_status')
    .on('team_deployments')
    .column('status')
    .execute();

  await db.schema
    .createIndex('idx_team_agents_deployment')
    .on('team_agents')
    .column('deployment_id')
    .execute();

  await db.schema
    .createIndex('idx_team_agents_workspace')
    .on('team_agents')
    .column('workspace_id')
    .execute();

  await db.schema
    .createIndex('idx_team_agents_user')
    .on('team_agents')
    .column('user_id')
    .execute();

  await db.schema
    .createIndex('idx_team_agents_status')
    .on('team_agents')
    .column('status')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex('idx_team_agents_status').execute();
  await db.schema.dropIndex('idx_team_agents_user').execute();
  await db.schema.dropIndex('idx_team_agents_workspace').execute();
  await db.schema.dropIndex('idx_team_agents_deployment').execute();
  await db.schema.dropIndex('idx_team_deployments_status').execute();
  await db.schema.dropIndex('idx_team_deployments_space').execute();
  await db.schema.dropIndex('idx_team_deployments_workspace').execute();

  await db.schema.dropTable('team_agents').execute();
  await db.schema.dropTable('team_deployments').execute();
}
