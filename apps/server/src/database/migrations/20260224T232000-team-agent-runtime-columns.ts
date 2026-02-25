import { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('team_agents')
    .addColumn('agent_type', 'varchar')
    .execute();

  await db.schema
    .alterTable('team_agents')
    .addColumn('workdir', 'varchar')
    .execute();

  await db.schema
    .alterTable('team_agents')
    .addColumn('runtime_session_id', 'varchar')
    .execute();

  await db.schema
    .alterTable('team_agents')
    .addColumn('terminal_session_id', 'uuid')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('team_agents')
    .dropColumn('terminal_session_id')
    .execute();

  await db.schema
    .alterTable('team_agents')
    .dropColumn('runtime_session_id')
    .execute();

  await db.schema
    .alterTable('team_agents')
    .dropColumn('workdir')
    .execute();

  await db.schema
    .alterTable('team_agents')
    .dropColumn('agent_type')
    .execute();
}
