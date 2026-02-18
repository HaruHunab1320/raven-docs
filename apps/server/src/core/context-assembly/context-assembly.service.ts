import { Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql, SqlBool } from 'kysely';
import { KyselyDB } from '../../database/types/kysely.types';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { ResearchGraphService } from '../research-graph/research-graph.service';
import { VectorSearchService } from '../../integrations/vector/vector-search.service';
import { ContextBundle, TimelineEntry, TypedPage } from './types';

@Injectable()
export class ContextAssemblyService {
  private readonly logger = new Logger(ContextAssemblyService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly knowledgeService: KnowledgeService,
    private readonly vectorSearch: VectorSearchService,
    private readonly researchGraph: ResearchGraphService,
  ) {}

  async assembleContext(
    query: string,
    workspaceId: string,
    spaceId?: string,
  ): Promise<ContextBundle> {
    // 1. Semantic search for direct page hits
    const directHits = await this.searchTypedPages(query, workspaceId, spaceId);

    // 2. Get knowledge base results
    let knowledgeHits: TypedPage[] = [];
    try {
      const knowledgeResults = await this.knowledgeService.searchKnowledge({
        query,
        workspaceId,
        spaceId,
        limit: 5,
      });

      // Map knowledge results back to page IDs where possible
      if (knowledgeResults?.length) {
        const sourcePageIds = await this.getPageIdsFromKnowledgeSources(
          knowledgeResults.map((r) => r.sourceName),
          workspaceId,
        );
        if (sourcePageIds.length) {
          knowledgeHits = await this.getTypedPagesByIds(sourcePageIds);
        }
      }
    } catch (error: any) {
      this.logger.warn(`Knowledge search failed: ${error?.message}`);
    }

    // Merge and deduplicate direct hits + knowledge hits
    const allDirectIds = new Set(directHits.map((p) => p.id));
    const mergedHits = [...directHits];
    for (const kh of knowledgeHits) {
      if (!allDirectIds.has(kh.id)) {
        mergedHits.push(kh);
        allDirectIds.add(kh.id);
      }
    }

    // 3. Graph traversal from hit pages for related work
    let relatedWork: TypedPage[] = [];
    if (mergedHits.length > 0) {
      const relatedIds = new Set<string>();
      for (const hit of mergedHits.slice(0, 5)) {
        try {
          const related = await this.researchGraph.getRelatedPages(hit.id, {
            maxDepth: 2,
            workspaceId,
          });
          for (const node of related) {
            if (!allDirectIds.has(node.id) && !relatedIds.has(node.id)) {
              relatedIds.add(node.id);
            }
          }
        } catch {
          // Graph traversal may fail if node doesn't exist yet
        }
      }

      if (relatedIds.size > 0) {
        relatedWork = await this.getTypedPagesByIds([...relatedIds]);
      }
    }

    // 4. Build timeline from all pages
    const allPages = [...mergedHits, ...relatedWork];
    const timeline = this.buildTimeline(allPages);

    // 5. Categorize by hypothesis status
    const currentState = this.categorizeHypotheses(allPages);

    // 6. Find open questions (tasks with open-question label)
    const openQuestions = await this.findOpenQuestions(query, workspaceId, spaceId);

    // 7. Find contradictions from the graph
    let contradictions: Array<{ from: string; to: string; type: string }> = [];
    try {
      const allContradictions = await this.researchGraph.findContradictions(workspaceId);
      // Filter to contradictions involving our pages
      const relevantPageIds = new Set(allPages.map((p) => p.id));
      contradictions = allContradictions
        .filter((c) => relevantPageIds.has(c.from) || relevantPageIds.has(c.to))
        .map((c) => ({ from: c.from, to: c.to, type: c.type }));
    } catch {
      // Graph may not have contradiction data yet
    }

    // 8. Filter experiments and papers
    const experiments = allPages.filter((p) => p.pageType === 'experiment');
    const papers = allPages.filter((p) => p.pageType === 'paper');

    return {
      query,
      directHits: mergedHits,
      relatedWork,
      timeline,
      currentState,
      openQuestions,
      contradictions,
      experiments,
      papers,
    };
  }

  private async searchTypedPages(
    query: string,
    workspaceId: string,
    spaceId?: string,
  ): Promise<TypedPage[]> {
    // Full-text search on pages using existing tsv column
    try {
      const results = await this.db
        .selectFrom('pages')
        .select([
          'id',
          'slugId',
          'title',
          'pageType',
          'metadata',
          'spaceId',
          'workspaceId',
          'createdAt',
          'updatedAt',
        ])
        .where('workspaceId', '=', workspaceId)
        .where('deletedAt', 'is', null)
        .$if(!!spaceId, (qb) => qb.where('spaceId', '=', spaceId!))
        .where(
          sql<SqlBool>`tsv @@ plainto_tsquery('english', ${query})`,
        )
        .orderBy(sql<number>`ts_rank(tsv, plainto_tsquery('english', ${query}))`, 'desc')
        .limit(10)
        .execute();

      return results.map((r) => ({
        id: r.id,
        slugId: r.slugId,
        title: r.title,
        pageType: r.pageType,
        metadata: r.metadata as Record<string, any> | null,
        spaceId: r.spaceId,
        workspaceId: r.workspaceId,
        createdAt: r.createdAt as unknown as Date,
        updatedAt: r.updatedAt as unknown as Date,
      }));
    } catch (error: any) {
      this.logger.warn(`Text search failed: ${error?.message}`);
      return [];
    }
  }

  private async getTypedPagesByIds(pageIds: string[]): Promise<TypedPage[]> {
    if (pageIds.length === 0) return [];

    const results = await this.db
      .selectFrom('pages')
      .select([
        'id',
        'slugId',
        'title',
        'pageType',
        'metadata',
        'spaceId',
        'workspaceId',
        'createdAt',
        'updatedAt',
      ])
      .where('id', 'in', pageIds)
      .where('deletedAt', 'is', null)
      .execute();

    return results.map((r) => ({
      id: r.id,
      slugId: r.slugId,
      title: r.title,
      pageType: r.pageType,
      metadata: r.metadata as Record<string, any> | null,
      spaceId: r.spaceId,
      workspaceId: r.workspaceId,
      createdAt: r.createdAt as unknown as Date,
      updatedAt: r.updatedAt as unknown as Date,
    }));
  }

  private async getPageIdsFromKnowledgeSources(
    sourceNames: string[],
    workspaceId: string,
  ): Promise<string[]> {
    if (sourceNames.length === 0) return [];

    const results = await this.db
      .selectFrom('knowledgeSources')
      .select('pageId')
      .where('workspaceId', '=', workspaceId)
      .where('pageId', 'is not', null)
      .where('name', 'in', sourceNames)
      .execute();

    return results.filter((r) => r.pageId).map((r) => r.pageId!);
  }

  private async findOpenQuestions(
    query: string,
    workspaceId: string,
    spaceId?: string,
  ): Promise<ContextBundle['openQuestions']> {
    try {
      // Search tasks that have "open-question" label or matching title
      const results = await this.db
        .selectFrom('tasks')
        .select(['tasks.id', 'tasks.title', 'tasks.status', 'tasks.priority'])
        .leftJoin('taskLabelAssignments', 'taskLabelAssignments.taskId', 'tasks.id')
        .leftJoin('taskLabels', 'taskLabels.id', 'taskLabelAssignments.labelId')
        .where('tasks.workspaceId', '=', workspaceId)
        .where('tasks.deletedAt', 'is', null)
        .where((eb) =>
          eb.or([
            sql<SqlBool>`LOWER(task_labels.name) = 'open-question'`,
            sql<SqlBool>`LOWER(task_labels.name) = 'open question'`,
            sql<SqlBool>`tasks.tsv @@ plainto_tsquery('english', ${query})`,
          ]),
        )
        .$if(!!spaceId, (qb) => qb.where('tasks.spaceId', '=', spaceId!))
        .where('tasks.status', '!=', 'done')
        .limit(10)
        .execute();

      return results.map((r) => ({
        id: r.id,
        title: r.title,
        status: r.status,
        priority: r.priority,
        labels: [],
      }));
    } catch (error: any) {
      this.logger.warn(`Open questions search failed: ${error?.message}`);
      return [];
    }
  }

  private buildTimeline(pages: TypedPage[]): TimelineEntry[] {
    return pages
      .map((p) => ({
        id: p.id,
        title: p.title,
        pageType: p.pageType,
        date: p.updatedAt,
        metadataStatus: (p.metadata as any)?.status,
      }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  private categorizeHypotheses(pages: TypedPage[]): ContextBundle['currentState'] {
    const hypotheses = pages.filter((p) => p.pageType === 'hypothesis');

    return {
      validated: hypotheses.filter(
        (h) => (h.metadata as any)?.status === 'validated',
      ),
      refuted: hypotheses.filter(
        (h) => (h.metadata as any)?.status === 'refuted',
      ),
      testing: hypotheses.filter(
        (h) => (h.metadata as any)?.status === 'testing',
      ),
      open: hypotheses.filter(
        (h) =>
          (h.metadata as any)?.status === 'proposed' ||
          (h.metadata as any)?.status === 'inconclusive',
      ),
    };
  }
}
