import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('tasks')
    .addColumn('tsv', sql`tsvector`)
    .execute();

  await sql`
    UPDATE tasks
    SET tsv =
      setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(description, '')), 'B')
  `.execute(db);

  await db.schema
    .createIndex('tasks_tsv_idx')
    .on('tasks')
    .using('GIN')
    .column('tsv')
    .execute();

  await sql`
    CREATE OR REPLACE FUNCTION tasks_tsvector_trigger() RETURNS trigger AS $$
    begin
      new.tsv :=
        setweight(to_tsvector('english', coalesce(new.title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(new.description, '')), 'B');
      return new;
    end;
    $$ LANGUAGE plpgsql;
  `.execute(db);

  await sql`
    CREATE OR REPLACE TRIGGER tasks_tsvector_update
    BEFORE INSERT OR UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION tasks_tsvector_trigger();
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS tasks_tsvector_update ON tasks`.execute(db);
  await sql`DROP FUNCTION IF EXISTS tasks_tsvector_trigger`.execute(db);
  await db.schema.dropIndex('tasks_tsv_idx').ifExists().execute();
  await db.schema.alterTable('tasks').dropColumn('tsv').execute();
}
