import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('bug_reports')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('workspace_id', 'uuid')
    .addColumn('space_id', 'uuid')
    .addColumn('reporter_id', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .addColumn('source', 'varchar', (col) => col.notNull())
    .addColumn('severity', 'varchar', (col) => col.notNull().defaultTo('medium'))
    .addColumn('status', 'varchar', (col) => col.notNull().defaultTo('open'))
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('error_message', 'text')
    .addColumn('error_stack', 'text')
    .addColumn('error_code', 'varchar')
    .addColumn('user_journey', 'jsonb')
    .addColumn('context', 'jsonb')
    .addColumn('metadata', 'jsonb')
    .addColumn('occurrence_count', 'integer', (col) => col.notNull().defaultTo(1))
    .addColumn('occurred_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('resolved_at', 'timestamptz')
    .addColumn('deleted_at', 'timestamptz')
    .execute();

  // Create indexes for common queries
  await db.schema
    .createIndex('bug_reports_source_idx')
    .on('bug_reports')
    .column('source')
    .execute();

  await db.schema
    .createIndex('bug_reports_severity_idx')
    .on('bug_reports')
    .column('severity')
    .execute();

  await db.schema
    .createIndex('bug_reports_status_idx')
    .on('bug_reports')
    .column('status')
    .execute();

  await db.schema
    .createIndex('bug_reports_occurred_at_idx')
    .on('bug_reports')
    .column('occurred_at')
    .execute();

  await db.schema
    .createIndex('bug_reports_workspace_id_idx')
    .on('bug_reports')
    .column('workspace_id')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('bug_reports').execute();
}
