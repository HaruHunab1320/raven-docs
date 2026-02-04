import { type Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('goals')
    .addColumn('creator_id', 'uuid', (col) =>
      col.references('users.id').onDelete('cascade'),
    )
    .execute();

  await db.schema
    .createIndex('goals_workspace_creator_idx')
    .on('goals')
    .columns(['workspace_id', 'creator_id'])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex('goals_workspace_creator_idx').execute();

  await db.schema.alterTable('goals').dropColumn('creator_id').execute();
}
