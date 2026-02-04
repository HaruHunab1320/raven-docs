import { Kysely } from 'kysely';

/**
 * Add agent_id column to users table to identify agent users.
 * When a user is an agent, this column links to their parallax_agents record.
 * This allows agents to be first-class users with their own goals, memories, etc.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('users')
    .addColumn('agent_id', 'varchar', (col) => col)
    .execute();

  // Add index for looking up users by agent_id
  await db.schema
    .createIndex('users_agent_id_idx')
    .on('users')
    .column('agent_id')
    .where('agent_id', 'is not', null)
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex('users_agent_id_idx').execute();
  await db.schema.alterTable('users').dropColumn('agent_id').execute();
}
