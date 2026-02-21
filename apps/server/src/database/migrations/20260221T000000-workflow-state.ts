import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Add workflow columns to team_deployments
  await db.schema
    .alterTable('team_deployments')
    .addColumn('org_pattern', 'jsonb')
    .execute();

  await db.schema
    .alterTable('team_deployments')
    .addColumn('execution_plan', 'jsonb')
    .execute();

  await db.schema
    .alterTable('team_deployments')
    .addColumn('workflow_state', 'jsonb', (col) =>
      col.defaultTo(sql`'{}'::jsonb`),
    )
    .execute();

  // Add workflow columns to team_agents
  await db.schema
    .alterTable('team_agents')
    .addColumn('current_step_id', 'varchar')
    .execute();

  await db.schema
    .alterTable('team_agents')
    .addColumn('reports_to_agent_id', 'uuid', (col) =>
      col.references('team_agents.id').onDelete('set null'),
    )
    .execute();

  // Index for reporting chain lookups
  await db.schema
    .createIndex('idx_team_agents_reports_to')
    .on('team_agents')
    .column('reports_to_agent_id')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex('idx_team_agents_reports_to').execute();

  await db.schema
    .alterTable('team_agents')
    .dropColumn('reports_to_agent_id')
    .execute();

  await db.schema
    .alterTable('team_agents')
    .dropColumn('current_step_id')
    .execute();

  await db.schema
    .alterTable('team_deployments')
    .dropColumn('workflow_state')
    .execute();

  await db.schema
    .alterTable('team_deployments')
    .dropColumn('execution_plan')
    .execute();

  await db.schema
    .alterTable('team_deployments')
    .dropColumn('org_pattern')
    .execute();
}
