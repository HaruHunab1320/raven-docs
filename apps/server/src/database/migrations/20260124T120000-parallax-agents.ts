import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Create agent status enum
  await db.schema
    .createType('parallax_agent_status')
    .asEnum(['pending', 'approved', 'denied', 'revoked'])
    .execute();

  // Create parallax_agents table
  await db.schema
    .createTable('parallax_agents')
    .addColumn('id', 'varchar', (col) => col.primaryKey()) // Matches Parallax agent ID
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('name', 'varchar', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('capabilities', sql`text[]`, (col) => col.notNull())
    .addColumn('status', sql`parallax_agent_status`, (col) =>
      col.defaultTo('pending').notNull(),
    )
    .addColumn('requested_permissions', sql`text[]`, (col) => col.notNull())
    .addColumn('granted_permissions', sql`text[]`, (col) =>
      col.defaultTo(sql`'{}'::text[]`),
    )
    .addColumn('mcp_api_key_id', 'varchar', (col) =>
      col.references('mcp_api_keys.id').onDelete('set null'),
    )
    .addColumn('metadata', 'jsonb', (col) => col.defaultTo(sql`'{}'::jsonb`))
    .addColumn('endpoint', 'varchar')
    .addColumn('requested_at', 'timestamptz', (col) =>
      col.defaultTo(sql`now()`),
    )
    .addColumn('resolved_at', 'timestamptz')
    .addColumn('resolved_by', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .addColumn('denial_reason', 'text')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  // Create agent assignment type enum
  await db.schema
    .createType('parallax_assignment_type')
    .asEnum(['project', 'task'])
    .execute();

  // Create agent role enum
  await db.schema
    .createType('parallax_agent_role')
    .asEnum(['member', 'lead'])
    .execute();

  // Create parallax_agent_assignments table
  await db.schema
    .createTable('parallax_agent_assignments')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('agent_id', 'varchar', (col) =>
      col.notNull().references('parallax_agents.id').onDelete('cascade'),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('assignment_type', sql`parallax_assignment_type`, (col) =>
      col.notNull(),
    )
    .addColumn('project_id', 'uuid', (col) =>
      col.references('projects.id').onDelete('cascade'),
    )
    .addColumn('task_id', 'uuid', (col) =>
      col.references('tasks.id').onDelete('cascade'),
    )
    .addColumn('role', sql`parallax_agent_role`, (col) =>
      col.defaultTo('member'),
    )
    .addColumn('assigned_at', 'timestamptz', (col) =>
      col.defaultTo(sql`now()`),
    )
    .addColumn('assigned_by', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .addColumn('unassigned_at', 'timestamptz')
    .execute();

  // Create parallax_agent_activity table
  await db.schema
    .createTable('parallax_agent_activity')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('agent_id', 'varchar', (col) =>
      col.references('parallax_agents.id').onDelete('cascade'),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('activity_type', 'varchar', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('metadata', 'jsonb', (col) => col.defaultTo(sql`'{}'::jsonb`))
    .addColumn('project_id', 'uuid', (col) =>
      col.references('projects.id').onDelete('set null'),
    )
    .addColumn('task_id', 'uuid', (col) =>
      col.references('tasks.id').onDelete('set null'),
    )
    .addColumn('page_id', 'uuid', (col) =>
      col.references('pages.id').onDelete('set null'),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  // Create parallax_agent_activity_daily table for aggregated stats
  await db.schema
    .createTable('parallax_agent_activity_daily')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('agent_id', 'varchar', (col) =>
      col.references('parallax_agents.id').onDelete('cascade'),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('activity_date', 'date', (col) => col.notNull())
    .addColumn('activity_type', 'varchar', (col) => col.notNull())
    .addColumn('count', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('sample_metadata', 'jsonb', (col) =>
      col.defaultTo(sql`'[]'::jsonb`),
    )
    .addUniqueConstraint('parallax_agent_activity_daily_unique', [
      'agent_id',
      'activity_date',
      'activity_type',
    ])
    .execute();

  // Add agent_live columns to projects table
  await db.schema
    .alterTable('projects')
    .addColumn('agent_live', 'boolean', (col) => col.defaultTo(false))
    .execute();

  await db.schema
    .alterTable('projects')
    .addColumn('agent_live_changed_at', 'timestamptz')
    .execute();

  await db.schema
    .alterTable('projects')
    .addColumn('agent_live_changed_by', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .execute();

  // Add agent_live column to tasks table (nullable for inheritance)
  await db.schema
    .alterTable('tasks')
    .addColumn('agent_live', 'boolean') // NULL = inherit from project
    .execute();

  // Create indexes for parallax_agents
  await db.schema
    .createIndex('idx_parallax_agents_workspace')
    .on('parallax_agents')
    .column('workspace_id')
    .execute();

  await db.schema
    .createIndex('idx_parallax_agents_status')
    .on('parallax_agents')
    .column('status')
    .execute();

  // Create indexes for parallax_agent_assignments
  await db.schema
    .createIndex('idx_parallax_assignments_agent')
    .on('parallax_agent_assignments')
    .column('agent_id')
    .execute();

  await db.schema
    .createIndex('idx_parallax_assignments_project')
    .on('parallax_agent_assignments')
    .column('project_id')
    .execute();

  await db.schema
    .createIndex('idx_parallax_assignments_task')
    .on('parallax_agent_assignments')
    .column('task_id')
    .execute();

  await db.schema
    .createIndex('idx_parallax_assignments_active')
    .on('parallax_agent_assignments')
    .columns(['agent_id', 'unassigned_at'])
    .execute();

  // Create indexes for parallax_agent_activity
  await db.schema
    .createIndex('idx_parallax_activity_agent')
    .on('parallax_agent_activity')
    .column('agent_id')
    .execute();

  await db.schema
    .createIndex('idx_parallax_activity_created')
    .on('parallax_agent_activity')
    .column('created_at')
    .execute();

  await db.schema
    .createIndex('idx_parallax_activity_workspace')
    .on('parallax_agent_activity')
    .column('workspace_id')
    .execute();

  // Create index for agent_live on projects
  await db.schema
    .createIndex('idx_projects_agent_live')
    .on('projects')
    .column('agent_live')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop indexes
  await db.schema.dropIndex('idx_projects_agent_live').execute();
  await db.schema.dropIndex('idx_parallax_activity_workspace').execute();
  await db.schema.dropIndex('idx_parallax_activity_created').execute();
  await db.schema.dropIndex('idx_parallax_activity_agent').execute();
  await db.schema.dropIndex('idx_parallax_assignments_active').execute();
  await db.schema.dropIndex('idx_parallax_assignments_task').execute();
  await db.schema.dropIndex('idx_parallax_assignments_project').execute();
  await db.schema.dropIndex('idx_parallax_assignments_agent').execute();
  await db.schema.dropIndex('idx_parallax_agents_status').execute();
  await db.schema.dropIndex('idx_parallax_agents_workspace').execute();

  // Remove agent_live columns from tasks
  await db.schema.alterTable('tasks').dropColumn('agent_live').execute();

  // Remove agent_live columns from projects
  await db.schema
    .alterTable('projects')
    .dropColumn('agent_live_changed_by')
    .execute();
  await db.schema
    .alterTable('projects')
    .dropColumn('agent_live_changed_at')
    .execute();
  await db.schema.alterTable('projects').dropColumn('agent_live').execute();

  // Drop tables in reverse order
  await db.schema.dropTable('parallax_agent_activity_daily').execute();
  await db.schema.dropTable('parallax_agent_activity').execute();
  await db.schema.dropTable('parallax_agent_assignments').execute();
  await db.schema.dropTable('parallax_agents').execute();

  // Drop enums
  await db.schema.dropType('parallax_agent_role').execute();
  await db.schema.dropType('parallax_assignment_type').execute();
  await db.schema.dropType('parallax_agent_status').execute();
}
