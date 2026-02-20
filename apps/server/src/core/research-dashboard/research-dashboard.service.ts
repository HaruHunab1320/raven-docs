import { Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@raven-docs/db/types/kysely.types';
import { sql } from 'kysely';
import { ResearchGraphService } from '../research-graph/research-graph.service';
import { PatternDetectionRepo } from '../../database/repos/pattern-detection/pattern-detection.repo';

export interface HypothesisScoreboard {
  validated: number;
  testing: number;
  refuted: number;
  proposed: number;
  total: number;
}

export interface DashboardStats {
  hypotheses: HypothesisScoreboard;
  activeExperiments: number;
  openQuestions: number;
  contradictions: number;
  totalTypedPages: number;
}

export interface TimelineEntry {
  id: string;
  title: string | null;
  pageType: string | null;
  updatedAt: Date;
  metadataStatus: string | null;
}

@Injectable()
export class ResearchDashboardService {
  private readonly logger = new Logger(ResearchDashboardService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly researchGraph: ResearchGraphService,
    private readonly patternRepo: PatternDetectionRepo,
  ) {}

  async getStats(
    workspaceId: string,
    spaceId?: string,
  ): Promise<DashboardStats> {
    // Count hypotheses by status
    const hypothesisRows = await this.db
      .selectFrom('pages')
      .select([
        sql<string>`pages.metadata->>'status'`.as('status'),
        sql<string>`count(*)::int`.as('count'),
      ])
      .where('pages.workspaceId', '=', workspaceId)
      .where('pages.pageType', '=', 'hypothesis')
      .where('pages.deletedAt', 'is', null)
      .$if(!!spaceId, (qb) => qb.where('pages.spaceId', '=', spaceId!))
      .groupBy(sql`pages.metadata->>'status'`)
      .execute();

    const hypotheses: HypothesisScoreboard = {
      validated: 0,
      testing: 0,
      refuted: 0,
      proposed: 0,
      total: 0,
    };

    for (const row of hypothesisRows) {
      const count = Number(row.count) || 0;
      hypotheses.total += count;
      if (row.status === 'validated') hypotheses.validated = count;
      else if (row.status === 'testing') hypotheses.testing = count;
      else if (row.status === 'refuted') hypotheses.refuted = count;
      else if (row.status === 'proposed' || row.status === 'inconclusive')
        hypotheses.proposed += count;
    }

    // Count active experiments
    const expResult = await this.db
      .selectFrom('pages')
      .select(sql<string>`count(*)::int`.as('count'))
      .where('pages.workspaceId', '=', workspaceId)
      .where('pages.pageType', '=', 'experiment')
      .where('pages.deletedAt', 'is', null)
      .$if(!!spaceId, (qb) => qb.where('pages.spaceId', '=', spaceId!))
      .where(
        sql`pages.metadata->>'status'`,
        'in',
        ['planned', 'running'],
      )
      .executeTakeFirst();

    // Count open questions (tasks with open-question label)
    const oqResult = await this.db
      .selectFrom('tasks')
      .innerJoin('taskLabelAssignments', 'taskLabelAssignments.taskId', 'tasks.id')
      .innerJoin('taskLabels', 'taskLabels.id', 'taskLabelAssignments.labelId')
      .select(sql<string>`count(distinct tasks.id)::int`.as('count'))
      .where('tasks.workspaceId', '=', workspaceId)
      .where('tasks.deletedAt', 'is', null)
      .where('tasks.status', '!=', 'done')
      .$if(!!spaceId, (qb) => qb.where('tasks.spaceId', '=', spaceId!))
      .where(sql`LOWER(task_labels.name)`, 'in', [
        'open-question',
        'open question',
      ])
      .executeTakeFirst();

    // Count contradictions from graph
    let contradictionCount = 0;
    try {
      const contradictions = await this.researchGraph.findContradictions(
        workspaceId,
      );
      contradictionCount = contradictions.length;
    } catch {
      // Graph may not be available
    }

    // Count total typed pages
    const totalResult = await this.db
      .selectFrom('pages')
      .select(sql<string>`count(*)::int`.as('count'))
      .where('pages.workspaceId', '=', workspaceId)
      .where('pages.pageType', 'is not', null)
      .where('pages.deletedAt', 'is', null)
      .$if(!!spaceId, (qb) => qb.where('pages.spaceId', '=', spaceId!))
      .executeTakeFirst();

    return {
      hypotheses,
      activeExperiments: Number(expResult?.count) || 0,
      openQuestions: Number(oqResult?.count) || 0,
      contradictions: contradictionCount,
      totalTypedPages: Number(totalResult?.count) || 0,
    };
  }

  async getTimeline(
    workspaceId: string,
    spaceId?: string,
    limit = 20,
  ): Promise<TimelineEntry[]> {
    const rows = await this.db
      .selectFrom('pages')
      .select([
        'pages.id',
        'pages.title',
        'pages.pageType',
        'pages.updatedAt',
        sql<string>`pages.metadata->>'status'`.as('metadataStatus'),
      ])
      .where('pages.workspaceId', '=', workspaceId)
      .where('pages.pageType', 'is not', null)
      .where('pages.deletedAt', 'is', null)
      .$if(!!spaceId, (qb) => qb.where('pages.spaceId', '=', spaceId!))
      .orderBy('pages.updatedAt', 'desc')
      .limit(limit)
      .execute();

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      pageType: r.pageType,
      updatedAt: r.updatedAt as any,
      metadataStatus: r.metadataStatus,
    }));
  }

  async getOpenQuestions(
    workspaceId: string,
    spaceId?: string,
    domainTags?: string[],
  ) {
    let query = this.db
      .selectFrom('tasks')
      .innerJoin('taskLabelAssignments', 'taskLabelAssignments.taskId', 'tasks.id')
      .innerJoin('taskLabels', 'taskLabels.id', 'taskLabelAssignments.labelId')
      .select([
        'tasks.id',
        'tasks.title',
        'tasks.status',
        'tasks.priority',
        'tasks.updatedAt',
      ])
      .where('tasks.workspaceId', '=', workspaceId)
      .where('tasks.deletedAt', 'is', null)
      .where('tasks.status', '!=', 'done')
      .$if(!!spaceId, (qb) => qb.where('tasks.spaceId', '=', spaceId!))
      .where(sql`LOWER(task_labels.name)`, 'in', [
        'open-question',
        'open question',
      ])
      .orderBy('tasks.priority', 'desc')
      .orderBy('tasks.updatedAt', 'desc')
      .limit(50);

    const rows = await query.execute();

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      priority: r.priority,
      updatedAt: r.updatedAt,
    }));
  }

  async getContradictions(workspaceId: string, spaceId?: string) {
    try {
      const edges = await this.researchGraph.findContradictions(workspaceId);

      // Enrich with page titles
      if (edges.length === 0) return [];

      const pageIds = [
        ...new Set(edges.flatMap((e: any) => [e.from, e.to])),
      ];

      const pages = await this.db
        .selectFrom('pages')
        .select(['pages.id', 'pages.title', 'pages.pageType'])
        .where('pages.id', 'in', pageIds)
        .execute();

      const pageMap = new Map(pages.map((p) => [p.id, p] as const));

      return edges.map((e: any) => ({
        from: e.from,
        to: e.to,
        type: e.type,
        fromTitle: pageMap.get(e.from)?.title || 'Unknown',
        fromType: pageMap.get(e.from)?.pageType || null,
        toTitle: pageMap.get(e.to)?.title || 'Unknown',
        toType: pageMap.get(e.to)?.pageType || null,
      }));
    } catch {
      return [];
    }
  }

  async getActiveExperiments(workspaceId: string, spaceId?: string) {
    const rows = await this.db
      .selectFrom('pages')
      .select([
        'pages.id',
        'pages.title',
        'pages.pageType',
        'pages.metadata',
        'pages.slugId',
        'pages.updatedAt',
      ])
      .where('pages.workspaceId', '=', workspaceId)
      .where('pages.pageType', '=', 'experiment')
      .where('pages.deletedAt', 'is', null)
      .$if(!!spaceId, (qb) => qb.where('pages.spaceId', '=', spaceId!))
      .orderBy('pages.updatedAt', 'desc')
      .limit(50)
      .execute();

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      pageType: r.pageType,
      metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata,
      slugId: r.slugId,
      updatedAt: r.updatedAt,
    }));
  }

  async getHypotheses(workspaceId: string, spaceId?: string) {
    const rows = await this.db
      .selectFrom('pages')
      .select([
        'pages.id',
        'pages.title',
        'pages.pageType',
        'pages.metadata',
        'pages.slugId',
        'pages.updatedAt',
      ])
      .where('pages.workspaceId', '=', workspaceId)
      .where('pages.pageType', '=', 'hypothesis')
      .where('pages.deletedAt', 'is', null)
      .$if(!!spaceId, (qb) => qb.where('pages.spaceId', '=', spaceId!))
      .orderBy('pages.updatedAt', 'desc')
      .limit(50)
      .execute();

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      pageType: r.pageType,
      metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata,
      slugId: r.slugId,
      updatedAt: r.updatedAt,
    }));
  }

  async getDomainGraph(workspaceId: string, domainTags: string[]) {
    try {
      return await this.researchGraph.getDomainGraph(workspaceId, domainTags);
    } catch {
      return { nodes: [], edges: [] };
    }
  }

  async getPatterns(
    workspaceId: string,
    opts?: { spaceId?: string; status?: string; patternType?: string },
  ) {
    const patterns = await this.patternRepo.listByWorkspace(workspaceId, {
      spaceId: opts?.spaceId,
      status: opts?.status,
      patternType: opts?.patternType,
    });

    return patterns.map((p) => ({
      id: p.id,
      patternType: p.patternType,
      severity: p.severity,
      title: p.title,
      details:
        typeof p.details === 'string' ? JSON.parse(p.details) : p.details,
      status: p.status,
      detectedAt: p.detectedAt,
      acknowledgedAt: p.acknowledgedAt,
    }));
  }

  async acknowledgePattern(id: string) {
    return this.patternRepo.updateStatus(id, 'acknowledged');
  }

  async dismissPattern(id: string) {
    return this.patternRepo.updateStatus(id, 'dismissed');
  }
}
