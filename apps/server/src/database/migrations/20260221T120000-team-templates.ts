import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('team_templates')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('name', 'varchar', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('version', 'varchar', (col) => col.defaultTo('1.0.0'))
    .addColumn('is_system', 'boolean', (col) => col.defaultTo(false))
    .addColumn('org_pattern', 'jsonb', (col) => col.notNull())
    .addColumn('metadata', 'jsonb', (col) => col.defaultTo(sql`'{}'::jsonb`))
    .addColumn('created_by', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.defaultTo(sql`now()`).notNull(),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.defaultTo(sql`now()`).notNull(),
    )
    .addColumn('deleted_at', 'timestamptz')
    .execute();

  await db.schema
    .createIndex('idx_team_templates_workspace_id')
    .on('team_templates')
    .column('workspace_id')
    .execute();

  await db.schema
    .createIndex('idx_team_templates_is_system')
    .on('team_templates')
    .column('is_system')
    .execute();

  // Seed system templates
  const systemTemplates = [
    {
      name: 'Research Team',
      description:
        'A lead researcher coordinates 3 researchers and a synthesizer. Sequential workflow: select lead, parallel research, aggregate findings, review, approve.',
      is_system: true,
      org_pattern: JSON.stringify({
        name: 'Research Team',
        version: '1.0.0',
        description:
          'A lead researcher coordinates 3 researchers and a synthesizer.',
        structure: {
          name: 'Research Team',
          description: 'Research-focused team with lead, researchers, and synthesizer',
          roles: {
            lead: {
              name: 'Lead Researcher',
              description: 'Coordinates the research effort and reviews findings',
              capabilities: ['research', 'review', 'coordinate'],
              minInstances: 1,
              maxInstances: 1,
              singleton: true,
            },
            researcher: {
              name: 'Researcher',
              description: 'Conducts deep research on assigned topics',
              capabilities: ['research', 'analysis', 'writing'],
              reportsTo: 'lead',
              minInstances: 3,
              maxInstances: 3,
            },
            synthesizer: {
              name: 'Synthesizer',
              description: 'Combines and synthesizes research findings into cohesive reports',
              capabilities: ['synthesis', 'writing', 'analysis'],
              reportsTo: 'lead',
              minInstances: 1,
              maxInstances: 1,
              singleton: true,
            },
          },
        },
        workflow: {
          name: 'Research Workflow',
          description: 'Sequential research with parallel investigation',
          steps: [
            { type: 'select', role: 'lead', criteria: 'best' },
            {
              type: 'parallel',
              steps: [
                { type: 'assign', role: 'researcher', task: 'Investigate assigned research topic' },
                { type: 'assign', role: 'researcher', task: 'Investigate assigned research topic' },
                { type: 'assign', role: 'researcher', task: 'Investigate assigned research topic' },
              ],
            },
            { type: 'aggregate', method: 'merge', sources: ['researcher'] },
            { type: 'review', reviewer: 'lead', subject: 'research findings' },
            { type: 'approve', approver: 'lead', subject: 'final report' },
          ],
        },
      }),
    },
    {
      name: 'Code Review Squad',
      description:
        'A lead reviewer plus 2 reviewers. Parallel review, aggregate feedback, then approve.',
      is_system: true,
      org_pattern: JSON.stringify({
        name: 'Code Review Squad',
        version: '1.0.0',
        description: 'A lead reviewer plus 2 reviewers for thorough code reviews.',
        structure: {
          name: 'Code Review Squad',
          description: 'Code review team with parallel reviewers',
          roles: {
            lead_reviewer: {
              name: 'Lead Reviewer',
              description: 'Coordinates reviews and makes final approval decisions',
              capabilities: ['code-review', 'approve', 'coordinate'],
              minInstances: 1,
              maxInstances: 1,
              singleton: true,
            },
            reviewer: {
              name: 'Reviewer',
              description: 'Reviews code changes for quality, correctness, and style',
              capabilities: ['code-review', 'analysis', 'testing'],
              reportsTo: 'lead_reviewer',
              minInstances: 2,
              maxInstances: 2,
            },
          },
        },
        workflow: {
          name: 'Code Review Workflow',
          description: 'Parallel review followed by aggregation and approval',
          steps: [
            {
              type: 'parallel',
              steps: [
                { type: 'assign', role: 'reviewer', task: 'Review code changes' },
                { type: 'assign', role: 'reviewer', task: 'Review code changes' },
              ],
            },
            { type: 'aggregate', method: 'merge', sources: ['reviewer'] },
            { type: 'approve', approver: 'lead_reviewer', subject: 'code review' },
          ],
        },
      }),
    },
    {
      name: 'Content Pipeline',
      description:
        'Writer, editor, and fact-checker. Sequential: write, edit, fact-check, approve.',
      is_system: true,
      org_pattern: JSON.stringify({
        name: 'Content Pipeline',
        version: '1.0.0',
        description: 'Sequential content production pipeline.',
        structure: {
          name: 'Content Pipeline',
          description: 'Content production with writer, editor, and fact-checker',
          roles: {
            writer: {
              name: 'Writer',
              description: 'Creates initial content drafts',
              capabilities: ['writing', 'research', 'creativity'],
              minInstances: 1,
              maxInstances: 1,
              singleton: true,
            },
            editor: {
              name: 'Editor',
              description: 'Reviews and improves content for clarity and quality',
              capabilities: ['editing', 'review', 'writing'],
              minInstances: 1,
              maxInstances: 1,
              singleton: true,
            },
            fact_checker: {
              name: 'Fact Checker',
              description: 'Verifies accuracy of claims and sources',
              capabilities: ['research', 'verification', 'analysis'],
              reportsTo: 'editor',
              minInstances: 1,
              maxInstances: 1,
              singleton: true,
            },
          },
        },
        workflow: {
          name: 'Content Workflow',
          description: 'Sequential content production',
          steps: [
            { type: 'assign', role: 'writer', task: 'Write initial content draft' },
            { type: 'review', reviewer: 'editor', subject: 'content draft' },
            { type: 'assign', role: 'fact_checker', task: 'Verify facts and sources' },
            { type: 'approve', approver: 'editor', subject: 'final content' },
          ],
        },
      }),
    },
    {
      name: 'Investigation Unit',
      description:
        'Lead investigator, 2 analysts, and a summarizer. Parallel investigation, aggregate, quality check with loop, then approve.',
      is_system: true,
      org_pattern: JSON.stringify({
        name: 'Investigation Unit',
        version: '1.0.0',
        description: 'Investigation team with quality gating.',
        structure: {
          name: 'Investigation Unit',
          description: 'Investigation team with lead, analysts, and summarizer',
          roles: {
            lead: {
              name: 'Lead Investigator',
              description: 'Coordinates the investigation and makes final decisions',
              capabilities: ['investigation', 'coordinate', 'approve'],
              minInstances: 1,
              maxInstances: 1,
              singleton: true,
            },
            analyst: {
              name: 'Analyst',
              description: 'Conducts detailed analysis of assigned areas',
              capabilities: ['analysis', 'research', 'investigation'],
              reportsTo: 'lead',
              minInstances: 2,
              maxInstances: 2,
            },
            summarizer: {
              name: 'Summarizer',
              description: 'Creates concise summaries of investigation findings',
              capabilities: ['synthesis', 'writing', 'analysis'],
              reportsTo: 'lead',
              minInstances: 1,
              maxInstances: 1,
              singleton: true,
            },
          },
        },
        workflow: {
          name: 'Investigation Workflow',
          description: 'Parallel investigation with quality gating',
          steps: [
            {
              type: 'parallel',
              steps: [
                { type: 'assign', role: 'analyst', task: 'Investigate assigned area' },
                { type: 'assign', role: 'analyst', task: 'Investigate assigned area' },
              ],
            },
            { type: 'aggregate', method: 'merge', sources: ['analyst'] },
            {
              type: 'condition',
              check: 'quality_score >= 0.8',
              then: { type: 'approve', approver: 'lead', subject: 'investigation results' },
              else: {
                type: 'assign',
                role: 'analyst',
                task: 'Re-investigate areas with insufficient quality',
              },
            },
            { type: 'assign', role: 'summarizer', task: 'Create final summary' },
            { type: 'approve', approver: 'lead', subject: 'final investigation report' },
          ],
        },
      }),
    },
  ];

  for (const template of systemTemplates) {
    await db
      .insertInto('team_templates')
      .values({
        name: template.name,
        description: template.description,
        is_system: template.is_system,
        org_pattern: template.org_pattern,
      })
      .execute();
  }
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex('idx_team_templates_is_system').execute();
  await db.schema.dropIndex('idx_team_templates_workspace_id').execute();
  await db.schema.dropTable('team_templates').execute();
}
