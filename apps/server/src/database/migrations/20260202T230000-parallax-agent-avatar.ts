import { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Add avatar_url column to parallax_agents
  await db.schema
    .alterTable('parallax_agents')
    .addColumn('avatar_url', 'varchar')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('parallax_agents')
    .dropColumn('avatar_url')
    .execute();
}
