import { Kysely } from 'kysely';

/**
 * Add research-specific team templates aligned with the Research Intelligence System vision:
 * - Research Swarm: the canonical Phase 3 team (Lead PI + Workers + Synthesizer + Reviewer)
 * - Hypothesis Validation Squad: for testing and evaluating hypotheses
 * - Literature Survey Team: for systematic evidence gathering
 * - Experiment Pipeline: for designing, coding, running, and analyzing experiments
 *
 * Also updates the existing "Research Team" template to include a Reviewer role.
 */
export async function up(db: Kysely<any>): Promise<void> {
  // 1. Update existing Research Team to include a Reviewer role
  const existingResearchTeam = await db
    .selectFrom('team_templates')
    .selectAll()
    .where('name', '=', 'Research Team')
    .where('is_system', '=', true)
    .executeTakeFirst();

  if (existingResearchTeam) {
    const updatedPattern = {
      name: 'Research Team',
      version: '1.1.0',
      description:
        'A lead researcher coordinates 3 researchers, a synthesizer, and a reviewer.',
      structure: {
        name: 'Research Team',
        description:
          'Research-focused team with lead, researchers, synthesizer, and reviewer',
        roles: {
          lead: {
            name: 'Lead Researcher',
            description:
              'Coordinates the research effort, decomposes goals into tasks, assigns work, and reviews findings',
            capabilities: [
              'research',
              'review',
              'coordinate',
              'task.create',
              'task.update',
              'hypothesis.create',
              'hypothesis.update',
            ],
            minInstances: 1,
            maxInstances: 1,
            singleton: true,
          },
          researcher: {
            name: 'Researcher',
            description:
              'Conducts deep research on assigned topics, claims open tasks matching capabilities, and reports findings',
            capabilities: [
              'research',
              'analysis',
              'writing',
              'context.query',
              'experiment.register',
              'experiment.complete',
              'openquestion.create',
            ],
            reportsTo: 'lead',
            minInstances: 3,
            maxInstances: 5,
          },
          synthesizer: {
            name: 'Synthesizer',
            description:
              'Monitors completed experiments and generates synthesis pages combining findings into cohesive reports',
            capabilities: [
              'synthesis',
              'writing',
              'analysis',
              'context.query',
              'relationship.create',
            ],
            reportsTo: 'lead',
            minInstances: 1,
            maxInstances: 1,
            singleton: true,
          },
          reviewer: {
            name: 'Reviewer',
            description:
              'Picks up in_review tasks, evaluates quality and correctness, approves or returns with feedback',
            capabilities: [
              'review',
              'analysis',
              'task.update',
              'context.query',
            ],
            reportsTo: 'lead',
            minInstances: 1,
            maxInstances: 1,
            singleton: true,
          },
        },
      },
      workflow: {
        name: 'Research Workflow',
        description:
          'Lead decomposes goals, researchers work in parallel, synthesizer combines, reviewer validates',
        steps: [
          { type: 'select', role: 'lead', criteria: 'best' },
          {
            type: 'assign',
            role: 'lead',
            task: 'Decompose research goal into tasks and assign to researchers',
          },
          {
            type: 'parallel',
            steps: [
              {
                type: 'assign',
                role: 'researcher',
                task: 'Claim and execute assigned research task',
              },
              {
                type: 'assign',
                role: 'researcher',
                task: 'Claim and execute assigned research task',
              },
              {
                type: 'assign',
                role: 'researcher',
                task: 'Claim and execute assigned research task',
              },
            ],
          },
          { type: 'aggregate', method: 'merge', sources: ['researcher'] },
          {
            type: 'assign',
            role: 'synthesizer',
            task: 'Generate synthesis page combining research findings',
          },
          { type: 'review', reviewer: 'reviewer', subject: 'research synthesis' },
          { type: 'approve', approver: 'lead', subject: 'final research report' },
        ],
      },
    };

    await db
      .updateTable('team_templates')
      .set({
        description: updatedPattern.description,
        org_pattern: JSON.stringify(updatedPattern),
        version: '1.1.0',
        updated_at: new Date(),
      })
      .where('id', '=', existingResearchTeam.id)
      .execute();
  }

  // 2. Seed new research-vision templates
  const newTemplates = [
    {
      name: 'Research Swarm',
      description:
        'The canonical multi-agent research team from Phase 3. Lead PI decomposes goals, workers claim tasks, synthesizer combines findings, reviewer validates quality. Uses kanban as coordination protocol.',
      is_system: true,
      org_pattern: JSON.stringify({
        name: 'Research Swarm',
        version: '1.0.0',
        description:
          'Full autonomous research swarm with PI-led task decomposition and kanban coordination.',
        structure: {
          name: 'Research Swarm',
          description:
            'PI-led research swarm with workers, synthesizer, and reviewer using kanban coordination',
          roles: {
            pi: {
              name: 'Principal Investigator',
              description:
                'Decomposes research goals into tasks, assigns work to the team, monitors progress, and makes strategic decisions. Uses context.query to understand current knowledge state.',
              capabilities: [
                'coordinate',
                'task.create',
                'task.update',
                'hypothesis.create',
                'hypothesis.update',
                'context.query',
                'openquestion.create',
                'relationship.create',
              ],
              minInstances: 1,
              maxInstances: 1,
              singleton: true,
            },
            worker: {
              name: 'Research Worker',
              description:
                'Queries for unassigned tasks matching capabilities, claims and executes them, updates results. Specializes in research execution — running experiments, gathering evidence, testing hypotheses.',
              capabilities: [
                'research',
                'analysis',
                'writing',
                'context.query',
                'experiment.register',
                'experiment.complete',
                'openquestion.create',
                'task.update',
              ],
              reportsTo: 'pi',
              minInstances: 3,
              maxInstances: 6,
            },
            synthesizer: {
              name: 'Research Synthesizer',
              description:
                'Monitors completed experiments, detects convergent findings, generates synthesis pages that combine results into coherent narratives. Creates relationship edges between connected findings.',
              capabilities: [
                'synthesis',
                'writing',
                'analysis',
                'context.query',
                'relationship.create',
                'openquestion.create',
              ],
              reportsTo: 'pi',
              minInstances: 1,
              maxInstances: 2,
            },
            reviewer: {
              name: 'Quality Reviewer',
              description:
                'Picks up in_review tasks, evaluates evidence quality, checks methodology, validates claims against evidence. Approves or returns work with specific feedback.',
              capabilities: [
                'review',
                'analysis',
                'task.update',
                'context.query',
                'hypothesis.update',
              ],
              reportsTo: 'pi',
              minInstances: 1,
              maxInstances: 2,
            },
          },
        },
        workflow: {
          name: 'Research Swarm Workflow',
          description:
            'PI decomposes → workers execute in parallel → synthesizer combines → reviewer validates → PI approves',
          steps: [
            {
              type: 'assign',
              role: 'pi',
              task: 'Analyze research goal, query existing context, decompose into tasks, and assign to workers',
            },
            {
              type: 'parallel',
              steps: [
                {
                  type: 'assign',
                  role: 'worker',
                  task: 'Claim unassigned task, execute research, register experiments, update findings',
                },
                {
                  type: 'assign',
                  role: 'worker',
                  task: 'Claim unassigned task, execute research, register experiments, update findings',
                },
                {
                  type: 'assign',
                  role: 'worker',
                  task: 'Claim unassigned task, execute research, register experiments, update findings',
                },
              ],
            },
            { type: 'aggregate', method: 'merge', sources: ['worker'] },
            {
              type: 'assign',
              role: 'synthesizer',
              task: 'Monitor completed experiments, generate synthesis pages, create relationship edges',
            },
            {
              type: 'review',
              reviewer: 'reviewer',
              subject: 'synthesized research findings and evidence quality',
            },
            {
              type: 'condition',
              check: 'evidence_quality >= 0.7',
              then: {
                type: 'approve',
                approver: 'pi',
                subject: 'research findings for knowledge base integration',
              },
              else: {
                type: 'assign',
                role: 'pi',
                task: 'Identify gaps, create follow-up tasks for additional investigation',
              },
            },
          ],
        },
      }),
    },
    {
      name: 'Hypothesis Validation Squad',
      description:
        'Specialized team for testing hypotheses. An evaluator selects and prioritizes hypotheses, experiment designers create test plans, analysts execute and analyze results, and a decision maker evaluates evidence for status changes.',
      is_system: true,
      org_pattern: JSON.stringify({
        name: 'Hypothesis Validation Squad',
        version: '1.0.0',
        description:
          'Systematic hypothesis testing with experiment design, execution, and evidence evaluation.',
        structure: {
          name: 'Hypothesis Validation Squad',
          description:
            'Team for rigorous hypothesis testing with intake gates and evidence quality scoring',
          roles: {
            evaluator: {
              name: 'Hypothesis Evaluator',
              description:
                'Selects and prioritizes hypotheses for testing, ensures intake gate requirements are met, makes final status decisions with rationale.',
              capabilities: [
                'coordinate',
                'hypothesis.create',
                'hypothesis.update',
                'context.query',
                'task.create',
                'task.update',
                'relationship.create',
              ],
              minInstances: 1,
              maxInstances: 1,
              singleton: true,
            },
            experiment_designer: {
              name: 'Experiment Designer',
              description:
                'Designs experiments to test hypotheses. Specifies exact commands, seed policies, config parameters, and success criteria. Ensures reproducibility.',
              capabilities: [
                'research',
                'analysis',
                'experiment.register',
                'context.query',
              ],
              reportsTo: 'evaluator',
              minInstances: 1,
              maxInstances: 2,
            },
            analyst: {
              name: 'Data Analyst',
              description:
                'Executes experiments, analyzes results, records metrics, identifies unexpected observations, and suggests follow-ups.',
              capabilities: [
                'analysis',
                'research',
                'experiment.complete',
                'context.query',
                'task.update',
                'openquestion.create',
              ],
              reportsTo: 'evaluator',
              minInstances: 2,
              maxInstances: 3,
            },
            evidence_reviewer: {
              name: 'Evidence Reviewer',
              description:
                'Reviews completed experiments for evidence quality, checks for replication, ablation studies, and independent implementations. Computes evidence quality scores.',
              capabilities: [
                'review',
                'analysis',
                'hypothesis.update',
                'relationship.create',
                'context.query',
              ],
              reportsTo: 'evaluator',
              minInstances: 1,
              maxInstances: 1,
              singleton: true,
            },
          },
        },
        workflow: {
          name: 'Hypothesis Validation Workflow',
          description:
            'Select hypothesis → design experiments → parallel execution → aggregate → evidence review → decision',
          steps: [
            {
              type: 'assign',
              role: 'evaluator',
              task: 'Select hypothesis for testing, verify intake gate prerequisites, create experiment tasks',
            },
            {
              type: 'assign',
              role: 'experiment_designer',
              task: 'Design reproducible experiments with exact commands, seed policies, and success criteria',
            },
            {
              type: 'parallel',
              steps: [
                {
                  type: 'assign',
                  role: 'analyst',
                  task: 'Execute experiment, analyze results, record metrics and observations',
                },
                {
                  type: 'assign',
                  role: 'analyst',
                  task: 'Execute experiment, analyze results, record metrics and observations',
                },
              ],
            },
            { type: 'aggregate', method: 'merge', sources: ['analyst'] },
            {
              type: 'review',
              reviewer: 'evidence_reviewer',
              subject: 'experiment results and evidence quality',
            },
            {
              type: 'assign',
              role: 'evaluator',
              task: 'Make hypothesis status decision based on evidence, record rationale in statusDecision field',
            },
            {
              type: 'approve',
              approver: 'evaluator',
              subject: 'hypothesis status change',
            },
          ],
        },
      }),
    },
    {
      name: 'Literature Survey Team',
      description:
        'Systematic evidence gathering team. A survey lead defines scope, searchers find and annotate sources, a reader extracts key claims, and a synthesizer produces a structured literature review with citation edges.',
      is_system: true,
      org_pattern: JSON.stringify({
        name: 'Literature Survey Team',
        version: '1.0.0',
        description:
          'Systematic literature review with search, annotation, extraction, and synthesis.',
        structure: {
          name: 'Literature Survey Team',
          description:
            'Team for comprehensive literature surveys with structured output',
          roles: {
            survey_lead: {
              name: 'Survey Lead',
              description:
                'Defines survey scope and search criteria, prioritizes sources, ensures comprehensive coverage across domain tags.',
              capabilities: [
                'coordinate',
                'research',
                'context.query',
                'task.create',
                'task.update',
                'openquestion.create',
              ],
              minInstances: 1,
              maxInstances: 1,
              singleton: true,
            },
            searcher: {
              name: 'Source Searcher',
              description:
                'Searches for relevant papers, experiments, and evidence. Annotates sources with relevance and quality assessments.',
              capabilities: [
                'research',
                'analysis',
                'context.query',
                'relationship.create',
              ],
              reportsTo: 'survey_lead',
              minInstances: 2,
              maxInstances: 3,
            },
            reader: {
              name: 'Critical Reader',
              description:
                'Deep-reads sources, extracts key claims, identifies methodological strengths/weaknesses, flags contradictions. Creates CITES, VALIDATES, and CONTRADICTS edges.',
              capabilities: [
                'analysis',
                'research',
                'writing',
                'context.query',
                'relationship.create',
                'openquestion.create',
              ],
              reportsTo: 'survey_lead',
              minInstances: 1,
              maxInstances: 2,
            },
            synthesizer: {
              name: 'Review Synthesizer',
              description:
                'Produces structured literature review combining all extracted evidence. Identifies consensus, gaps, and open questions.',
              capabilities: [
                'synthesis',
                'writing',
                'context.query',
                'relationship.create',
                'hypothesis.create',
              ],
              reportsTo: 'survey_lead',
              minInstances: 1,
              maxInstances: 1,
              singleton: true,
            },
          },
        },
        workflow: {
          name: 'Literature Survey Workflow',
          description:
            'Define scope → parallel search → aggregate → critical reading → synthesis → review',
          steps: [
            {
              type: 'assign',
              role: 'survey_lead',
              task: 'Define survey scope, domain tags, search criteria, and coverage requirements',
            },
            {
              type: 'parallel',
              steps: [
                {
                  type: 'assign',
                  role: 'searcher',
                  task: 'Search for relevant sources, annotate with relevance and quality scores',
                },
                {
                  type: 'assign',
                  role: 'searcher',
                  task: 'Search for relevant sources, annotate with relevance and quality scores',
                },
              ],
            },
            { type: 'aggregate', method: 'merge', sources: ['searcher'] },
            {
              type: 'assign',
              role: 'reader',
              task: 'Deep-read top sources, extract claims, identify contradictions, create citation edges',
            },
            {
              type: 'assign',
              role: 'synthesizer',
              task: 'Produce structured literature review with evidence summary, gaps, and open questions',
            },
            {
              type: 'review',
              reviewer: 'survey_lead',
              subject: 'literature review completeness and accuracy',
            },
            {
              type: 'approve',
              approver: 'survey_lead',
              subject: 'final literature review',
            },
          ],
        },
      }),
    },
    {
      name: 'Experiment Pipeline',
      description:
        'End-to-end experiment execution. A planner designs experiments with reproducibility requirements, a coder implements them (integrates with coding swarms), a data analyst runs and analyzes results, and a report writer documents findings.',
      is_system: true,
      org_pattern: JSON.stringify({
        name: 'Experiment Pipeline',
        version: '1.0.0',
        description:
          'End-to-end experiment execution from design through code, analysis, and reporting.',
        structure: {
          name: 'Experiment Pipeline',
          description:
            'Full experiment lifecycle team with coding integration',
          roles: {
            planner: {
              name: 'Experiment Planner',
              description:
                'Designs experiments with exact commands, seed policies, config parameters, success criteria, and reproducibility requirements. Links experiments to hypotheses.',
              capabilities: [
                'coordinate',
                'research',
                'experiment.register',
                'hypothesis.update',
                'context.query',
                'task.create',
              ],
              minInstances: 1,
              maxInstances: 1,
              singleton: true,
            },
            coder: {
              name: 'Experiment Coder',
              description:
                'Implements experiment code in isolated git worktrees. Writes reproducible scripts with proper seed handling, config management, and artifact output paths.',
              capabilities: [
                'coding',
                'analysis',
                'task.update',
              ],
              reportsTo: 'planner',
              minInstances: 1,
              maxInstances: 2,
            },
            analyst: {
              name: 'Results Analyst',
              description:
                'Runs experiments, captures output, analyzes metrics, identifies unexpected observations, and computes artifact checksums for integrity.',
              capabilities: [
                'analysis',
                'research',
                'experiment.complete',
                'context.query',
                'task.update',
                'openquestion.create',
              ],
              reportsTo: 'planner',
              minInstances: 1,
              maxInstances: 2,
            },
            report_writer: {
              name: 'Report Writer',
              description:
                'Documents experiment results in structured pages, creates VALIDATES/CONTRADICTS relationship edges, and suggests follow-up experiments.',
              capabilities: [
                'writing',
                'synthesis',
                'relationship.create',
                'context.query',
                'openquestion.create',
              ],
              reportsTo: 'planner',
              minInstances: 1,
              maxInstances: 1,
              singleton: true,
            },
          },
        },
        workflow: {
          name: 'Experiment Pipeline Workflow',
          description:
            'Plan → code → execute → analyze → report → review',
          steps: [
            {
              type: 'assign',
              role: 'planner',
              task: 'Design experiment with reproducibility requirements, register in system, create coding tasks',
            },
            {
              type: 'assign',
              role: 'coder',
              task: 'Implement experiment code with proper seed handling, config management, and artifact paths',
            },
            {
              type: 'assign',
              role: 'analyst',
              task: 'Execute experiment, capture results, analyze metrics, compute artifact checksums',
            },
            {
              type: 'condition',
              check: 'experiment_succeeded',
              then: {
                type: 'assign',
                role: 'report_writer',
                task: 'Document results, create relationship edges, suggest follow-up experiments',
              },
              else: {
                type: 'assign',
                role: 'planner',
                task: 'Analyze failure, adjust experiment design, create retry tasks',
              },
            },
            {
              type: 'review',
              reviewer: 'planner',
              subject: 'experiment report and evidence edges',
            },
            {
              type: 'approve',
              approver: 'planner',
              subject: 'experiment pipeline results',
            },
          ],
        },
      }),
    },
  ];

  for (const template of newTemplates) {
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
  // Remove the new templates
  for (const name of [
    'Research Swarm',
    'Hypothesis Validation Squad',
    'Literature Survey Team',
    'Experiment Pipeline',
  ]) {
    await db
      .deleteFrom('team_templates')
      .where('name', '=', name)
      .where('is_system', '=', true)
      .execute();
  }

  // Revert Research Team to v1.0.0 (original version without reviewer)
  // Not reverting the content since it's a minor change; the down migration
  // just removes the new templates.
}
