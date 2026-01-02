import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Create projects table
  await db.schema
    .createTable('projects')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('name', 'varchar', (col) => col.notNull())
    .addColumn('description', 'text', (col) => col)
    .addColumn('icon', 'varchar', (col) => col)
    .addColumn('color', 'varchar', (col) => col)
    .addColumn('is_archived', 'boolean', (col) =>
      col.defaultTo(false).notNull(),
    )
    .addColumn('start_date', 'timestamptz', (col) => col)
    .addColumn('end_date', 'timestamptz', (col) => col)
    .addColumn('space_id', 'uuid', (col) =>
      col.references('spaces.id').onDelete('cascade').notNull(),
    )
    .addColumn('creator_id', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.references('workspaces.id').onDelete('cascade').notNull(),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('deleted_at', 'timestamptz', (col) => col)
    .execute();

  // Create task_status enum
  await db.schema
    .createType('task_status')
    .asEnum(['todo', 'in_progress', 'in_review', 'done', 'blocked'])
    .execute();

  // Create task_priority enum
  await db.schema
    .createType('task_priority')
    .asEnum(['low', 'medium', 'high', 'urgent'])
    .execute();

  // Create tasks table
  await db.schema
    .createTable('tasks')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('title', 'varchar', (col) => col.notNull())
    .addColumn('description', 'text', (col) => col)
    .addColumn('status', sql`task_status`, (col) =>
      col.defaultTo('todo').notNull(),
    )
    .addColumn('priority', sql`task_priority`, (col) =>
      col.defaultTo('medium').notNull(),
    )
    .addColumn('position', 'varchar', (col) => col)
    .addColumn('due_date', 'timestamptz', (col) => col)
    .addColumn('is_completed', 'boolean', (col) =>
      col.defaultTo(false).notNull(),
    )
    .addColumn('completed_at', 'timestamptz', (col) => col)
    .addColumn('estimated_time', 'int4', (col) => col) // minutes
    .addColumn('project_id', 'uuid', (col) =>
      col.references('projects.id').onDelete('cascade'),
    )
    .addColumn('parent_task_id', 'uuid', (col) =>
      col.references('tasks.id').onDelete('set null'),
    )
    .addColumn('page_id', 'uuid', (col) =>
      col.references('pages.id').onDelete('set null'),
    )
    .addColumn('creator_id', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .addColumn('assignee_id', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .addColumn('space_id', 'uuid', (col) =>
      col.references('spaces.id').onDelete('cascade').notNull(),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.references('workspaces.id').onDelete('cascade').notNull(),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('deleted_at', 'timestamptz', (col) => col)
    .execute();

  // Create task_labels table
  await db.schema
    .createTable('task_labels')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('name', 'varchar', (col) => col.notNull())
    .addColumn('color', 'varchar', (col) => col.notNull())
    .addColumn('workspace_id', 'uuid', (col) =>
      col.references('workspaces.id').onDelete('cascade').notNull(),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  // Create task_label_assignments table
  await db.schema
    .createTable('task_label_assignments')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('task_id', 'uuid', (col) =>
      col.references('tasks.id').onDelete('cascade').notNull(),
    )
    .addColumn('label_id', 'uuid', (col) =>
      col.references('task_labels.id').onDelete('cascade').notNull(),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addUniqueConstraint('task_label_assignments_unique', [
      'task_id',
      'label_id',
    ])
    .execute();

  // Create task_watchers table
  await db.schema
    .createTable('task_watchers')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('task_id', 'uuid', (col) =>
      col.references('tasks.id').onDelete('cascade').notNull(),
    )
    .addColumn('user_id', 'uuid', (col) =>
      col.references('users.id').onDelete('cascade').notNull(),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addUniqueConstraint('task_watchers_unique', ['task_id', 'user_id'])
    .execute();

  // Create task_dependencies table
  await db.schema
    .createTable('task_dependencies')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('task_id', 'uuid', (col) =>
      col.references('tasks.id').onDelete('cascade').notNull(),
    )
    .addColumn('depends_on_task_id', 'uuid', (col) =>
      col.references('tasks.id').onDelete('cascade').notNull(),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addUniqueConstraint('task_dependencies_unique', [
      'task_id',
      'depends_on_task_id',
    ])
    .execute();

  // Create project_views table for different project views (Kanban, list, etc)
  await db.schema
    .createTable('project_views')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('name', 'varchar', (col) => col.notNull())
    .addColumn('type', 'varchar', (col) => col.notNull()) // kanban, list, calendar, etc
    .addColumn('config', 'jsonb', (col) => col)
    .addColumn('is_default', 'boolean', (col) => col.defaultTo(false).notNull())
    .addColumn('project_id', 'uuid', (col) =>
      col.references('projects.id').onDelete('cascade').notNull(),
    )
    .addColumn('creator_id', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop tables in reverse order to avoid reference conflicts
  await db.schema.dropTable('project_views').execute();
  await db.schema.dropTable('task_dependencies').execute();
  await db.schema.dropTable('task_watchers').execute();
  await db.schema.dropTable('task_label_assignments').execute();
  await db.schema.dropTable('task_labels').execute();
  await db.schema.dropTable('tasks').execute();
  await db.schema.dropTable('projects').execute();

  // Drop enums
  await db.schema.dropType('task_priority').execute();
  await db.schema.dropType('task_status').execute();
}
