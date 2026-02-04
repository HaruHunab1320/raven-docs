import { type Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('agent_review_prompts')
    .addColumn('creator_id', 'uuid', (col) =>
      col.references('users.id').onDelete('cascade'),
    )
    .execute();

  // Drop old unique constraint and create new one including creator_id
  await db.schema
    .alterTable('agent_review_prompts')
    .dropConstraint('agent_review_prompts_unique')
    .execute();

  await db.schema
    .alterTable('agent_review_prompts')
    .addUniqueConstraint('agent_review_prompts_unique', [
      'space_id',
      'week_key',
      'question',
      'creator_id',
    ])
    .execute();

  await db.schema
    .createIndex('agent_review_prompts_workspace_creator_idx')
    .on('agent_review_prompts')
    .columns(['workspace_id', 'creator_id'])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .dropIndex('agent_review_prompts_workspace_creator_idx')
    .execute();

  await db.schema
    .alterTable('agent_review_prompts')
    .dropConstraint('agent_review_prompts_unique')
    .execute();

  await db.schema
    .alterTable('agent_review_prompts')
    .addUniqueConstraint('agent_review_prompts_unique', [
      'space_id',
      'week_key',
      'question',
    ])
    .execute();

  await db.schema
    .alterTable('agent_review_prompts')
    .dropColumn('creator_id')
    .execute();
}
