import { Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@raven-docs/db/types/kysely.types';
import { sql } from 'kysely';
import { ResearchGraphService } from '../research-graph/research-graph.service';
import { PatternDetectionRepo } from '../../database/repos/pattern-detection/pattern-detection.repo';
import { IntelligenceSettings } from '../workspace/intelligence-defaults';

interface PatternRule {
  type: string;
  condition: string;
  params: Record<string, any>;
  action: string;
}

@Injectable()
export class PatternDetectionService {
  private readonly logger = new Logger(PatternDetectionService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly researchGraph: ResearchGraphService,
    private readonly patternRepo: PatternDetectionRepo,
  ) {}

  async runAllPatterns(
    workspaceId: string,
    settings: IntelligenceSettings,
  ): Promise<number> {
    let totalDetected = 0;

    for (const rule of settings.patternRules) {
      try {
        const count = await this.runEvaluator(workspaceId, rule);
        totalDetected += count;
      } catch (error: any) {
        this.logger.warn(
          `Pattern evaluator '${rule.type}' failed for workspace ${workspaceId}: ${error?.message}`,
        );
      }
    }

    return totalDetected;
  }

  private async runEvaluator(
    workspaceId: string,
    rule: PatternRule,
  ): Promise<number> {
    switch (rule.type) {
      case 'convergence':
        return this.detectConvergence(workspaceId, rule.params);
      case 'contradiction':
        return this.detectContradictions(workspaceId);
      case 'staleness':
        return this.detectStaleness(workspaceId, rule.params);
      case 'cross_domain':
        return this.detectCrossDomain(workspaceId, rule.params);
      case 'untested_implication':
        return this.detectUntestedImplications(workspaceId);
      case 'intake_gate':
        return this.detectIntakeGateViolations(workspaceId);
      case 'evidence_gap':
        return this.detectEvidenceGaps(workspaceId, rule.params);
      case 'reproduction_failure':
        return this.detectReproductionFailures(workspaceId);
      default:
        this.logger.warn(`Unknown pattern type: ${rule.type}`);
        return 0;
    }
  }

  /**
   * Detect convergence: hypotheses with >= threshold incoming VALIDATES edges
   */
  private async detectConvergence(
    workspaceId: string,
    params: Record<string, any>,
  ): Promise<number> {
    const threshold = params.threshold || 3;
    let detected = 0;

    // Get all hypotheses in workspace
    const hypotheses = await this.db
      .selectFrom('pages')
      .select(['pages.id', 'pages.title'])
      .where('pages.workspaceId', '=', workspaceId)
      .where('pages.pageType', '=', 'hypothesis')
      .where('pages.deletedAt', 'is', null)
      .execute();

    for (const hypothesis of hypotheses) {
      try {
        const evidence = await this.researchGraph.getEvidenceChain(
          hypothesis.id,
        );
        if (evidence.supporting.length >= threshold) {
          // Check for existing pattern
          const existing = await this.patternRepo.findExistingPattern(
            workspaceId,
            'convergence',
            'hypothesisId',
            hypothesis.id,
          );
          if (!existing) {
            await this.patternRepo.create({
              workspaceId,
              patternType: 'convergence',
              severity: 'medium',
              title: `Convergence: "${hypothesis.title}" has ${evidence.supporting.length} validating experiments`,
              details: {
                hypothesisId: hypothesis.id,
                hypothesisTitle: hypothesis.title,
                validatingCount: evidence.supporting.length,
                experimentIds: evidence.supporting.map((e) => e.from),
              },
            });
            detected++;
          }
        }
      } catch {
        // Skip if graph query fails for this hypothesis
      }
    }

    return detected;
  }

  /**
   * Detect contradictions: CONTRADICTS edges in the graph
   */
  private async detectContradictions(workspaceId: string): Promise<number> {
    let detected = 0;

    try {
      const contradictions =
        await this.researchGraph.findContradictions(workspaceId);

      for (const edge of contradictions) {
        const existing = await this.patternRepo.findExistingPattern(
          workspaceId,
          'contradiction',
          'edgeKey',
          `${edge.from}-${edge.to}`,
        );
        if (!existing) {
          // Get page titles
          const pages = await this.db
            .selectFrom('pages')
            .select(['pages.id', 'pages.title'])
            .where('pages.id', 'in', [edge.from, edge.to])
            .execute();

          const pageMap = new Map(pages.map((p) => [p.id, p] as const));
          const fromTitle = pageMap.get(edge.from)?.title || 'Unknown';
          const toTitle = pageMap.get(edge.to)?.title || 'Unknown';

          await this.patternRepo.create({
            workspaceId,
            patternType: 'contradiction',
            severity: 'high',
            title: `Contradiction: "${fromTitle}" contradicts "${toTitle}"`,
            details: {
              edgeKey: `${edge.from}-${edge.to}`,
              fromPageId: edge.from,
              toPageId: edge.to,
              fromTitle,
              toTitle,
            },
          });
          detected++;
        }
      }
    } catch {
      // Graph may not be available
    }

    return detected;
  }

  /**
   * Detect staleness: open questions with no activity past maxAgeDays
   */
  private async detectStaleness(
    workspaceId: string,
    params: Record<string, any>,
  ): Promise<number> {
    const maxAgeDays = params.maxAgeDays || 14;
    let detected = 0;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - maxAgeDays);

    const staleTasks = await this.db
      .selectFrom('tasks')
      .innerJoin(
        'taskLabelAssignments',
        'taskLabelAssignments.taskId',
        'tasks.id',
      )
      .innerJoin(
        'taskLabels',
        'taskLabels.id',
        'taskLabelAssignments.labelId',
      )
      .select(['tasks.id', 'tasks.title', 'tasks.updatedAt'])
      .where('tasks.workspaceId', '=', workspaceId)
      .where('tasks.deletedAt', 'is', null)
      .where('tasks.status', '!=', 'done')
      .where('tasks.updatedAt', '<', cutoff)
      .where(sql`LOWER(task_labels.name)`, 'in', [
        'open-question',
        'open question',
      ])
      .execute();

    for (const task of staleTasks) {
      const existing = await this.patternRepo.findExistingPattern(
        workspaceId,
        'staleness',
        'taskId',
        task.id,
      );
      if (!existing) {
        const daysSinceUpdate = Math.floor(
          (Date.now() - new Date(task.updatedAt as any).getTime()) /
            (1000 * 60 * 60 * 24),
        );
        await this.patternRepo.create({
          workspaceId,
          patternType: 'staleness',
          severity: 'low',
          title: `Stale question: "${task.title}" (${daysSinceUpdate} days inactive)`,
          details: {
            taskId: task.id,
            taskTitle: task.title,
            daysSinceUpdate,
            lastUpdated: task.updatedAt,
          },
        });
        detected++;
      }
    }

    return detected;
  }

  /**
   * Detect cross-domain connections: pages with different domainTags
   * that share graph connections indicating potential cross-domain insights
   */
  private async detectCrossDomain(
    workspaceId: string,
    params: Record<string, any>,
  ): Promise<number> {
    let detected = 0;

    // Find hypotheses with domain tags
    const taggedPages = await this.db
      .selectFrom('pages')
      .select([
        'pages.id',
        'pages.title',
        'pages.pageType',
        'pages.metadata',
      ])
      .where('pages.workspaceId', '=', workspaceId)
      .where('pages.pageType', 'in', ['hypothesis', 'experiment'])
      .where('pages.deletedAt', 'is', null)
      .where(sql`pages.metadata->>'domainTags'`, 'is not', null)
      .execute();

    // Group by domain tags and find cross-domain relationships via graph
    const domainGroups = new Map<string, typeof taggedPages>();
    for (const page of taggedPages) {
      const metadata =
        typeof page.metadata === 'string'
          ? JSON.parse(page.metadata)
          : page.metadata;
      const tags = metadata?.domainTags || [];
      for (const tag of tags) {
        const group = domainGroups.get(tag) || [];
        group.push(page);
        domainGroups.set(tag, group);
      }
    }

    // Check for graph connections between pages in different domain groups
    const domains = Array.from(domainGroups.keys());
    const checkedPairs = new Set<string>();

    for (let i = 0; i < domains.length; i++) {
      for (let j = i + 1; j < domains.length; j++) {
        const domainA = domains[i];
        const domainB = domains[j];
        const pairKey = [domainA, domainB].sort().join('|');
        if (checkedPairs.has(pairKey)) continue;
        checkedPairs.add(pairKey);

        const pagesA = domainGroups.get(domainA) || [];
        const pagesB = domainGroups.get(domainB) || [];
        const pageBIds = new Set(pagesB.map((p) => p.id));

        for (const pageA of pagesA) {
          if (pageBIds.has(pageA.id)) continue; // Skip if page is in both domains

          try {
            const related = await this.researchGraph.getRelatedPages(
              pageA.id,
              { maxDepth: 1, workspaceId },
            );
            const crossDomainLinks = related.filter((r) =>
              pageBIds.has(r.id),
            );

            if (crossDomainLinks.length > 0) {
              const existing = await this.patternRepo.findExistingPattern(
                workspaceId,
                'cross_domain',
                'domainPair',
                pairKey,
              );
              if (!existing) {
                await this.patternRepo.create({
                  workspaceId,
                  patternType: 'cross_domain',
                  severity: 'medium',
                  title: `Cross-domain connection: "${domainA}" ↔ "${domainB}"`,
                  details: {
                    domainPair: pairKey,
                    domainA,
                    domainB,
                    connections: crossDomainLinks.map((l) => ({
                      fromId: pageA.id,
                      fromTitle: pageA.title,
                      toId: l.id,
                      toTitle: l.title,
                    })),
                  },
                });
                detected++;
              }
              break; // One detection per domain pair is enough
            }
          } catch {
            // Skip graph failures
          }
        }
      }
    }

    return detected;
  }

  /**
   * Detect untested implications: validated hypotheses that EXTEND to
   * hypotheses with no VALIDATES or TESTS_HYPOTHESIS edges
   */
  private async detectUntestedImplications(
    workspaceId: string,
  ): Promise<number> {
    let detected = 0;

    // Find validated hypotheses
    const validatedHypotheses = await this.db
      .selectFrom('pages')
      .select(['pages.id', 'pages.title'])
      .where('pages.workspaceId', '=', workspaceId)
      .where('pages.pageType', '=', 'hypothesis')
      .where('pages.deletedAt', 'is', null)
      .where(sql`pages.metadata->>'status'`, '=', 'validated')
      .execute();

    for (const hypothesis of validatedHypotheses) {
      try {
        // Find pages this hypothesis EXTENDS to
        const outgoing = await this.researchGraph.getRelationships(
          hypothesis.id,
          { direction: 'outgoing', types: ['EXTENDS'] },
        );

        for (const edge of outgoing) {
          // Check if the target hypothesis has any validation/testing
          const targetEvidence = await this.researchGraph.getEvidenceChain(
            edge.to,
          );
          if (
            targetEvidence.supporting.length === 0 &&
            targetEvidence.testing.length === 0
          ) {
            // Get target page title
            const targetPage = await this.db
              .selectFrom('pages')
              .select(['pages.id', 'pages.title'])
              .where('pages.id', '=', edge.to)
              .executeTakeFirst();

            const existing = await this.patternRepo.findExistingPattern(
              workspaceId,
              'untested_implication',
              'targetHypothesisId',
              edge.to,
            );
            if (!existing) {
              await this.patternRepo.create({
                workspaceId,
                patternType: 'untested_implication',
                severity: 'medium',
                title: `Untested implication: "${targetPage?.title || 'Unknown'}" extends from validated "${hypothesis.title}" but has no tests`,
                details: {
                  targetHypothesisId: edge.to,
                  targetTitle: targetPage?.title || 'Unknown',
                  sourceHypothesisId: hypothesis.id,
                  sourceTitle: hypothesis.title,
                },
              });
              detected++;
            }
          }
        }
      } catch {
        // Skip graph failures
      }
    }

    return detected;
  }

  /**
   * Detect intake gate violations: hypotheses with claimLabel='proved'
   * but intakeGateCompleted !== true
   */
  private async detectIntakeGateViolations(
    workspaceId: string,
  ): Promise<number> {
    let detected = 0;

    const provedHypotheses = await this.db
      .selectFrom('pages')
      .select(['pages.id', 'pages.title', 'pages.metadata'])
      .where('pages.workspaceId', '=', workspaceId)
      .where('pages.pageType', '=', 'hypothesis')
      .where('pages.deletedAt', 'is', null)
      .where(sql`pages.metadata->>'claimLabel'`, '=', 'proved')
      .execute();

    for (const hypothesis of provedHypotheses) {
      const metadata =
        typeof hypothesis.metadata === 'string'
          ? JSON.parse(hypothesis.metadata)
          : hypothesis.metadata;

      if (metadata?.intakeGateCompleted !== true) {
        const existing = await this.patternRepo.findExistingPattern(
          workspaceId,
          'intake_gate',
          'hypothesisId',
          hypothesis.id,
        );
        if (!existing) {
          await this.patternRepo.create({
            workspaceId,
            patternType: 'intake_gate',
            severity: 'high',
            title: `Intake gate violation: "${hypothesis.title}" marked as PROVED without completed checklist`,
            details: {
              hypothesisId: hypothesis.id,
              hypothesisTitle: hypothesis.title,
              claimLabel: 'proved',
              intakeGateCompleted: false,
            },
          });
          detected++;
        }
      }
    }

    return detected;
  }

  /**
   * Detect evidence gaps: papers that CITES or FORMALIZES hypotheses
   * which lack experimental backing (no VALIDATES or TESTS_HYPOTHESIS edges)
   */
  private async detectEvidenceGaps(
    workspaceId: string,
    params: Record<string, any>,
  ): Promise<number> {
    const minExperiments = params.minExperiments || 1;
    let detected = 0;

    const papers = await this.db
      .selectFrom('pages')
      .select(['pages.id', 'pages.title'])
      .where('pages.workspaceId', '=', workspaceId)
      .where('pages.pageType', '=', 'paper')
      .where('pages.deletedAt', 'is', null)
      .execute();

    for (const paper of papers) {
      try {
        const outgoing = await this.researchGraph.getRelationships(paper.id, {
          direction: 'outgoing',
          types: ['CITES', 'FORMALIZES'],
        });

        for (const edge of outgoing) {
          const evidence = await this.researchGraph.getEvidenceChain(edge.to);
          const experimentCount =
            evidence.supporting.length + evidence.testing.length;

          if (experimentCount < minExperiments) {
            const targetPage = await this.db
              .selectFrom('pages')
              .select(['pages.id', 'pages.title'])
              .where('pages.id', '=', edge.to)
              .executeTakeFirst();

            const existing = await this.patternRepo.findExistingPattern(
              workspaceId,
              'evidence_gap',
              'edgeKey',
              `${paper.id}-${edge.to}`,
            );
            if (!existing) {
              await this.patternRepo.create({
                workspaceId,
                patternType: 'evidence_gap',
                severity: 'medium',
                title: `Evidence gap: "${paper.title}" references "${targetPage?.title || 'Unknown'}" which has ${experimentCount} experiments (needs ${minExperiments})`,
                details: {
                  edgeKey: `${paper.id}-${edge.to}`,
                  paperPageId: paper.id,
                  paperTitle: paper.title,
                  targetPageId: edge.to,
                  targetTitle: targetPage?.title || 'Unknown',
                  experimentCount,
                  requiredExperiments: minExperiments,
                },
              });
              detected++;
            }
          }
        }
      } catch {
        // Skip graph failures
      }
    }

    return detected;
  }

  /**
   * Detect reproduction failures: experiments with FAILS_TO_REPRODUCE edges
   */
  private async detectReproductionFailures(
    workspaceId: string,
  ): Promise<number> {
    let detected = 0;

    const experiments = await this.db
      .selectFrom('pages')
      .select(['pages.id', 'pages.title'])
      .where('pages.workspaceId', '=', workspaceId)
      .where('pages.pageType', '=', 'experiment')
      .where('pages.deletedAt', 'is', null)
      .execute();

    for (const experiment of experiments) {
      try {
        const incoming = await this.researchGraph.getRelationships(
          experiment.id,
          { direction: 'incoming', types: ['FAILS_TO_REPRODUCE'] },
        );

        if (incoming.length > 0) {
          const existing = await this.patternRepo.findExistingPattern(
            workspaceId,
            'reproduction_failure',
            'experimentId',
            experiment.id,
          );
          if (!existing) {
            await this.patternRepo.create({
              workspaceId,
              patternType: 'reproduction_failure',
              severity: 'high',
              title: `Reproduction failure: "${experiment.title}" has ${incoming.length} failed reproduction attempt(s)`,
              details: {
                experimentId: experiment.id,
                experimentTitle: experiment.title,
                failedReproductionCount: incoming.length,
                failedByIds: incoming.map((e) => e.from),
              },
            });
            detected++;
          }
        }
      } catch {
        // Skip graph failures
      }
    }

    return detected;
  }
}
