import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Check if column exists before adding (repair migration)
  const result = await sql<{ exists: boolean }>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'tasks' AND column_name = 'page_task_id'
    ) as exists
  `.execute(db);

  if (!result.rows[0]?.exists) {
    await db.schema
      .alterTable('tasks')
      .addColumn('page_task_id', 'text')
      .execute();
  }
}

export async function down(db: Kysely<any>): Promise<void> {
  // Don't drop in down - this is a repair migration
}
