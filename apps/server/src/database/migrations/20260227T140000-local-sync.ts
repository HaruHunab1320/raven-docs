import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`CREATE SEQUENCE IF NOT EXISTS local_sync_event_cursor_seq`.execute(db);

  await db.schema
    .createTable('local_sync_connectors')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('created_by_id', 'uuid', (col) =>
      col.notNull().references('users.id').onDelete('cascade'),
    )
    .addColumn('name', 'varchar(255)', (col) => col.notNull())
    .addColumn('platform', 'varchar(64)', (col) => col.notNull())
    .addColumn('version', 'varchar(64)')
    .addColumn('status', 'varchar(20)', (col) => col.notNull().defaultTo('online'))
    .addColumn('last_heartbeat_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createTable('local_sync_sources')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('created_by_id', 'uuid', (col) =>
      col.notNull().references('users.id').onDelete('cascade'),
    )
    .addColumn('name', 'varchar(255)', (col) => col.notNull())
    .addColumn('mode', 'varchar(30)', (col) => col.notNull())
    .addColumn('connector_id', 'uuid', (col) =>
      col.notNull().references('local_sync_connectors.id').onDelete('cascade'),
    )
    .addColumn('status', 'varchar(20)', (col) => col.notNull().defaultTo('active'))
    .addColumn('last_remote_cursor', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('include_patterns', 'jsonb', (col) => col.notNull().defaultTo(sql`'[]'::jsonb`))
    .addColumn('exclude_patterns', 'jsonb', (col) => col.notNull().defaultTo(sql`'[]'::jsonb`))
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createTable('local_sync_files')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('source_id', 'uuid', (col) =>
      col.notNull().references('local_sync_sources.id').onDelete('cascade'),
    )
    .addColumn('relative_path', 'text', (col) => col.notNull())
    .addColumn('content_type', 'varchar(128)', (col) => col.notNull())
    .addColumn('content', 'text', (col) => col.notNull())
    .addColumn('last_synced_hash', 'varchar(64)', (col) => col.notNull())
    .addColumn('last_local_hash', 'varchar(64)', (col) => col.notNull())
    .addColumn('last_remote_hash', 'varchar(64)', (col) => col.notNull())
    .addColumn('last_synced_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('state', 'varchar(20)', (col) => col.notNull().defaultTo('ok'))
    .addColumn('versions', 'jsonb', (col) => col.notNull().defaultTo(sql`'[]'::jsonb`))
    .execute();

  await db.schema
    .createTable('local_sync_events')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('source_id', 'uuid', (col) =>
      col.notNull().references('local_sync_sources.id').onDelete('cascade'),
    )
    .addColumn('cursor', 'integer', (col) =>
      col
        .notNull()
        .defaultTo(sql`nextval('local_sync_event_cursor_seq'::regclass)`),
    )
    .addColumn('type', 'varchar(50)', (col) => col.notNull())
    .addColumn('relative_path', 'text')
    .addColumn('payload', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createTable('local_sync_conflicts')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('source_id', 'uuid', (col) =>
      col.notNull().references('local_sync_sources.id').onDelete('cascade'),
    )
    .addColumn('file_id', 'uuid', (col) =>
      col.notNull().references('local_sync_files.id').onDelete('cascade'),
    )
    .addColumn('relative_path', 'text', (col) => col.notNull())
    .addColumn('base_hash', 'varchar(64)', (col) => col.notNull())
    .addColumn('local_hash', 'varchar(64)', (col) => col.notNull())
    .addColumn('remote_hash', 'varchar(64)', (col) => col.notNull())
    .addColumn('local_content', 'text', (col) => col.notNull())
    .addColumn('remote_content', 'text', (col) => col.notNull())
    .addColumn('status', 'varchar(20)', (col) => col.notNull().defaultTo('open'))
    .addColumn('resolution', 'varchar(20)')
    .addColumn('resolved_content', 'text')
    .addColumn('resolved_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createTable('local_sync_operations')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('source_id', 'uuid', (col) =>
      col.notNull().references('local_sync_sources.id').onDelete('cascade'),
    )
    .addColumn('operation_id', 'varchar(255)', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex('local_sync_connectors_workspace_idx')
    .on('local_sync_connectors')
    .column('workspace_id')
    .execute();

  await db.schema
    .createIndex('local_sync_sources_workspace_idx')
    .on('local_sync_sources')
    .column('workspace_id')
    .execute();

  await db.schema
    .createIndex('local_sync_sources_connector_idx')
    .on('local_sync_sources')
    .column('connector_id')
    .execute();

  await db.schema
    .createIndex('local_sync_files_source_path_uidx')
    .on('local_sync_files')
    .columns(['source_id', 'relative_path'])
    .unique()
    .execute();

  await db.schema
    .createIndex('local_sync_events_source_cursor_idx')
    .on('local_sync_events')
    .columns(['source_id', 'cursor'])
    .execute();

  await db.schema
    .createIndex('local_sync_conflicts_source_status_idx')
    .on('local_sync_conflicts')
    .columns(['source_id', 'status'])
    .execute();

  await db.schema
    .createIndex('local_sync_operations_source_op_uidx')
    .on('local_sync_operations')
    .columns(['source_id', 'operation_id'])
    .unique()
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('local_sync_operations').execute();
  await db.schema.dropTable('local_sync_conflicts').execute();
  await db.schema.dropTable('local_sync_events').execute();
  await db.schema.dropTable('local_sync_files').execute();
  await db.schema.dropTable('local_sync_sources').execute();
  await db.schema.dropTable('local_sync_connectors').execute();
  await sql`DROP SEQUENCE IF EXISTS local_sync_event_cursor_seq`.execute(db);
}
