import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('pattern_detections')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('space_id', 'uuid', (col) =>
      col.references('spaces.id').onDelete('cascade'),
    )
    .addColumn('pattern_type', 'varchar', (col) => col.notNull())
    .addColumn('severity', 'varchar', (col) =>
      col.notNull().defaultTo('medium'),
    )
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('details', 'jsonb', (col) =>
      col.notNull().defaultTo(sql`'{}'::jsonb`),
    )
    .addColumn('status', 'varchar', (col) =>
      col.notNull().defaultTo('detected'),
    )
    .addColumn('action_taken', 'jsonb')
    .addColumn('detected_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('acknowledged_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('deleted_at', 'timestamptz')
    .execute();

  await db.schema
    .createIndex('idx_pattern_detections_workspace')
    .on('pattern_detections')
    .column('workspace_id')
    .execute();

  await db.schema
    .createIndex('idx_pattern_detections_space')
    .on('pattern_detections')
    .column('space_id')
    .execute();

  await db.schema
    .createIndex('idx_pattern_detections_type')
    .on('pattern_detections')
    .column('pattern_type')
    .execute();

  await db.schema
    .createIndex('idx_pattern_detections_status')
    .on('pattern_detections')
    .column('status')
    .execute();

  await db.schema
    .createIndex('idx_pattern_detections_detected_at')
    .on('pattern_detections')
    .column('detected_at')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex('idx_pattern_detections_detected_at').execute();
  await db.schema.dropIndex('idx_pattern_detections_status').execute();
  await db.schema.dropIndex('idx_pattern_detections_type').execute();
  await db.schema.dropIndex('idx_pattern_detections_space').execute();
  await db.schema.dropIndex('idx_pattern_detections_workspace').execute();
  await db.schema.dropTable('pattern_detections').execute();
}
