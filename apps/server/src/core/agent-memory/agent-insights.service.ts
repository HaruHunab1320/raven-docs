import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@raven-docs/db/types/kysely.types';
import { AIService } from '../../integrations/ai/ai.service';
import { AgentMemoryService } from './agent-memory.service';
import { TaskRepo } from '../../database/repos/task/task.repo';
import { resolveAgentSettings } from '../agent/agent-settings';

// Response types for structured summary data
export interface DailySummaryResponse {
  period: 'daily';
  spaceId: string;
  spaceName: string;
  triage: {
    inbox: number;
    waiting: number;
    someday: number;
    overdue: number;
    dueToday: number;
  };
  overdueTasks: Array<{ id: string; title: string }>;
  dueTodayTasks: Array<{ id: string; title: string }>;
  summaryText: string;
  generatedAt: string;
}

export interface WeeklyMonthlySummaryResponse {
  period: 'weekly' | 'monthly';
  spaceId: string;
  spaceName: string;
  metrics: {
    tasksCompleted: number;
    tasksCreated: number;
    pagesCreated: number;
    pagesUpdated: number;
    memoriesAdded: number;
  };
  topProjects: Array<{ id: string; name: string; activity: number }>;
  topEntities: Array<{ id: string; name: string; type: string; count: number }>;
  summaryText: string;
  generatedAt: string;
}

export type SummaryResponse = DailySummaryResponse | WeeklyMonthlySummaryResponse;

@Injectable()
export class AgentInsightsService {
  private readonly logger = new Logger(AgentInsightsService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly aiService: AIService,
    private readonly memoryService: AgentMemoryService,
    private readonly taskRepo: TaskRepo,
  ) {}

  private getAgentModel() {
    return this.aiService.getSlowModel();
  }

  private hasApiKey() {
    return !!(
      process.env.GEMINI_API_KEY ||
      process.env.gemini_api_key ||
      process.env.GOOGLE_API_KEY ||
      process.env.google_api_key
    );
  }

  private async getRecentMemoryText(
    spaceId: string,
    since: Date,
  ): Promise<string> {
    const rows = await this.db
      .selectFrom('agentMemories')
      .select(['summary', 'content', 'createdAt'])
      .where('spaceId', '=', spaceId)
      .where('createdAt', '>=', since)
      .orderBy('createdAt', 'desc')
      .limit(200)
      .execute();

    return rows
      .map((row) => {
        if (typeof row.content === 'string') {
          return row.content;
        }
        if (row.content && typeof row.content === 'object' && 'text' in row.content) {
          return (row.content as { text?: string }).text || row.summary || '';
        }
        return row.summary || '';
      })
      .filter(Boolean)
      .join('\n');
  }

  // ============================================================================
  // Metrics gathering
  // ============================================================================

  private async getMetricsForPeriod(spaceId: string, workspaceId: string, days: number) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Tasks completed in period
    const tasksCompleted = await this.db
      .selectFrom('tasks')
      .select(this.db.fn.count('id').as('count'))
      .where('spaceId', '=', spaceId)
      .where('status', '=', 'done')
      .where('updatedAt', '>=', since)
      .executeTakeFirst();

    // Tasks created in period
    const tasksCreated = await this.db
      .selectFrom('tasks')
      .select(this.db.fn.count('id').as('count'))
      .where('spaceId', '=', spaceId)
      .where('createdAt', '>=', since)
      .executeTakeFirst();

    // Pages created in period
    const pagesCreated = await this.db
      .selectFrom('pages')
      .select(this.db.fn.count('id').as('count'))
      .where('spaceId', '=', spaceId)
      .where('createdAt', '>=', since)
      .executeTakeFirst();

    // Pages updated in period
    const pagesUpdated = await this.db
      .selectFrom('pages')
      .select(this.db.fn.count('id').as('count'))
      .where('spaceId', '=', spaceId)
      .where('updatedAt', '>=', since)
      .where('createdAt', '<', since) // Only count updates, not new pages
      .executeTakeFirst();

    // Memories added in period
    const memoriesAdded = await this.db
      .selectFrom('agentMemories')
      .select(this.db.fn.count('id').as('count'))
      .where('spaceId', '=', spaceId)
      .where('createdAt', '>=', since)
      .executeTakeFirst();

    return {
      tasksCompleted: Number(tasksCompleted?.count || 0),
      tasksCreated: Number(tasksCreated?.count || 0),
      pagesCreated: Number(pagesCreated?.count || 0),
      pagesUpdated: Number(pagesUpdated?.count || 0),
      memoriesAdded: Number(memoriesAdded?.count || 0),
    };
  }

  private async getTopProjects(spaceId: string, days: number, limit = 5) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Get projects with task activity in the period
    const projects = await this.db
      .selectFrom('projects')
      .leftJoin('tasks', 'tasks.projectId', 'projects.id')
      .select([
        'projects.id',
        'projects.name',
        this.db.fn.count('tasks.id').as('activity'),
      ])
      .where('projects.spaceId', '=', spaceId)
      .where('tasks.updatedAt', '>=', since)
      .groupBy(['projects.id', 'projects.name'])
      .orderBy('activity', 'desc')
      .limit(limit)
      .execute();

    return projects.map((p) => ({
      id: p.id,
      name: p.name,
      activity: Number(p.activity || 0),
    }));
  }

  // ============================================================================
  // Summary generation (internal, stores to memory)
  // ============================================================================

  private async generateSummary(
    spaceId: string,
    workspaceId: string,
    spaceName: string,
    label: string,
    days: number,
    tag: string,
  ): Promise<string> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const memoryText = await this.getRecentMemoryText(spaceId, since);

    let summaryText = `${label} summary unavailable.`;

    if (memoryText && this.hasApiKey()) {
      const prompt = [
        `You are Raven Docs' memory analyst.`,
        `Provide a concise ${label} summary based on the recent memory log.`,
        `Highlight themes, progress, and open loops.`,
        `Memory log:`,
        memoryText,
      ].join('\n');

      try {
        const response = await this.aiService.generateContent({
          model: this.getAgentModel(),
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
        });
        summaryText =
          response?.candidates?.[0]?.content?.parts?.[0]?.text || summaryText;
      } catch (error: any) {
        this.logger.warn(
          `Summary generation failed for space ${spaceId}: ${error?.message || String(error)}`,
        );
      }
    }

    await this.memoryService.ingestMemory({
      workspaceId,
      spaceId,
      source: 'agent-insight',
      summary: `${label} summary for ${spaceName}`,
      content: { text: summaryText },
      tags: ['agent', 'agent-insight', tag],
    });

    return summaryText;
  }

  private async generateDailySummaryText(
    spaceName: string,
    triage: {
      inbox: any[];
      overdue: any[];
      dueToday: any[];
      counts: { inbox: number; waiting: number; someday: number };
    },
  ): Promise<string> {
    if (!this.hasApiKey()) {
      return 'Daily summary unavailable (no API key configured).';
    }

    const prompt = [
      `You are Raven Docs' daily planner assistant.`,
      `Space: ${spaceName}`,
      `Summarize today's triage, suggest 3-5 priorities, and propose time blocks.`,
      `Counts: inbox=${triage.counts.inbox}, waiting=${triage.counts.waiting}, someday=${triage.counts.someday}.`,
      `Overdue: ${triage.overdue.map((task) => task.title).join(', ') || 'none'}.`,
      `Due today: ${triage.dueToday.map((task) => task.title).join(', ') || 'none'}.`,
      `Return markdown with sections: Summary, Priorities, Time Blocks, Risks.`,
    ].join('\n');

    try {
      const response = await this.aiService.generateContent({
        model: this.getAgentModel(),
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });
      return (
        response?.candidates?.[0]?.content?.parts?.[0]?.text ||
        'Daily summary unavailable.'
      );
    } catch (error: any) {
      this.logger.warn(
        `Failed to generate AI daily summary: ${error?.message || String(error)}`,
      );
      return 'Daily summary unavailable.';
    }
  }

  // ============================================================================
  // Public API: Generate summary with structured response
  // ============================================================================

  /**
   * Public method to generate a summary for a specific space.
   * Returns structured data appropriate to the period:
   * - Daily: triage counts, overdue/due today tasks, AI summary
   * - Weekly/Monthly: metrics, top projects, top entities, AI summary
   */
  async generateSummaryForSpace(params: {
    spaceId: string;
    workspaceId: string;
    userId: string;
    period: 'daily' | 'weekly' | 'monthly';
  }): Promise<SummaryResponse> {
    const space = await this.db
      .selectFrom('spaces')
      .select(['id', 'name', 'workspaceId'])
      .where('id', '=', params.spaceId)
      .where('workspaceId', '=', params.workspaceId)
      .executeTakeFirst();

    if (!space) {
      throw new Error('Space not found');
    }

    const generatedAt = new Date().toISOString();

    if (params.period === 'daily') {
      // Daily: triage-focused
      const triage = await this.taskRepo.getDailyTriageSummary(space.id, { limit: 10 });

      const summaryText = await this.generateDailySummaryText(space.name, triage);

      // Store to memory
      await this.memoryService.ingestMemory({
        workspaceId: space.workspaceId,
        spaceId: space.id,
        source: 'agent-insight',
        summary: `Daily summary for ${space.name}`,
        content: { text: summaryText },
        tags: ['agent', 'agent-insight', 'daily-summary'],
      });

      return {
        period: 'daily',
        spaceId: space.id,
        spaceName: space.name,
        triage: {
          inbox: triage.counts.inbox,
          waiting: triage.counts.waiting,
          someday: triage.counts.someday,
          overdue: triage.overdue.length,
          dueToday: triage.dueToday.length,
        },
        overdueTasks: triage.overdue.slice(0, 5).map((t) => ({ id: t.id, title: t.title })),
        dueTodayTasks: triage.dueToday.slice(0, 5).map((t) => ({ id: t.id, title: t.title })),
        summaryText,
        generatedAt,
      };
    } else {
      // Weekly/Monthly: metrics-focused
      const days = params.period === 'weekly' ? 7 : 30;
      const tag = params.period === 'weekly' ? 'weekly-summary' : 'monthly-summary';
      const label = params.period === 'weekly' ? 'Weekly' : 'Monthly';

      const [metrics, topProjects, topEntities, summaryText] = await Promise.all([
        this.getMetricsForPeriod(space.id, space.workspaceId, days),
        this.getTopProjects(space.id, days),
        this.memoryService.listTopEntities({
          workspaceId: space.workspaceId,
          spaceId: space.id,
          from: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
          limit: 5,
        }),
        this.generateSummary(space.id, space.workspaceId, space.name, label, days, tag),
      ]);

      return {
        period: params.period,
        spaceId: space.id,
        spaceName: space.name,
        metrics,
        topProjects,
        topEntities: topEntities.map((e) => ({
          id: e.id,
          name: e.name,
          type: e.type,
          count: e.count,
        })),
        summaryText,
        generatedAt,
      };
    }
  }

  // ============================================================================
  // Signals, clusters, trends (for cron jobs)
  // ============================================================================

  private async generateSignals(
    spaceId: string,
    workspaceId: string,
    spaceName: string,
  ) {
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const memoryText = (await this.getRecentMemoryText(spaceId, since)).toLowerCase();
    if (!memoryText) return;

    const keywords = [
      'gym',
      'workout',
      'diet',
      'sleep',
      'journal',
      'reading',
      'learning',
      'coding',
      'meeting',
    ];

    const hits = keywords
      .map((keyword) => ({
        keyword,
        count: memoryText.split(keyword).length - 1,
      }))
      .filter((item) => item.count >= 3)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    if (hits.length) {
      await this.memoryService.ingestMemory({
        workspaceId,
        spaceId,
        source: 'agent-insight',
        summary: `Habit signals for ${spaceName}`,
        content: { signals: hits },
        tags: ['agent', 'agent-insight', 'habit-signal'],
      });
    }

    const goals = await this.db
      .selectFrom('goals')
      .select(['id', 'name', 'keywords'])
      .where('workspaceId', '=', workspaceId)
      .where((eb) => eb('spaceId', '=', spaceId).or('spaceId', 'is', null))
      .execute();

    for (const goal of goals) {
      const rawKeywords = Array.isArray(goal.keywords) ? goal.keywords : [];
      const goalKeywords = rawKeywords
        .filter((kw): kw is string => typeof kw === 'string')
        .map((kw) => kw.toLowerCase())
        .filter(Boolean);
      if (!goalKeywords.length) {
        continue;
      }
      const hasMention = goalKeywords.some((keyword) =>
        memoryText.includes(keyword),
      );
      if (hasMention) {
        continue;
      }

      await this.memoryService.ingestMemory({
        workspaceId,
        spaceId,
        source: 'agent-insight',
        summary: `Goal drift detected: ${goal.name}`,
        content: { goalId: goal.id, goalName: goal.name },
        tags: ['agent', 'agent-insight', 'goal-drift'],
      });
    }
  }

  private async generateTopicClusters(
    spaceId: string,
    workspaceId: string,
    spaceName: string,
  ) {
    const since = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000);
    const entities = await this.memoryService.listTopEntities({
      workspaceId,
      spaceId,
      from: since,
      limit: 8,
    });

    if (!entities.length) return;

    await this.memoryService.ingestMemory({
      workspaceId,
      spaceId,
      source: 'agent-insight',
      summary: `Topic clusters for ${spaceName}`,
      content: {
        clusters: entities.map((entity) => ({
          id: entity.id,
          name: entity.name,
          type: entity.type,
          count: entity.count,
        })),
      },
      tags: ['agent', 'agent-insight', 'topic-cluster'],
    });
  }

  private async generateGoalTrends(spaceId: string, workspaceId: string) {
    const recentSince = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const baselineSince = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const recentText = (await this.getRecentMemoryText(spaceId, recentSince)).toLowerCase();
    const baselineText = (await this.getRecentMemoryText(spaceId, baselineSince)).toLowerCase();

    if (!baselineText) return;

    const goals = await this.db
      .selectFrom('goals')
      .select(['id', 'name', 'keywords'])
      .where('workspaceId', '=', workspaceId)
      .where((eb) => eb('spaceId', '=', spaceId).or('spaceId', 'is', null))
      .execute();

    const trends = goals
      .map((goal) => {
        const rawKeywords = Array.isArray(goal.keywords) ? goal.keywords : [];
        const keywords = rawKeywords
          .filter((kw): kw is string => typeof kw === 'string')
          .map((kw) => kw.toLowerCase())
          .filter(Boolean);
        if (!keywords.length) return null;

        const recentHits = keywords.reduce(
          (acc, keyword) => acc + (recentText.split(keyword).length - 1),
          0,
        );
        const baselineHits = keywords.reduce(
          (acc, keyword) => acc + (baselineText.split(keyword).length - 1),
          0,
        );

        if (!baselineHits) return null;

        const ratio = recentHits / baselineHits;
        return {
          goalId: goal.id,
          goalName: goal.name,
          recentHits,
          baselineHits,
          ratio,
        };
      })
      .filter(Boolean)
      .filter((trend) => trend && trend.ratio < 0.4);

    if (!trends.length) return;

    await this.memoryService.ingestMemory({
      workspaceId,
      spaceId,
      source: 'agent-insight',
      summary: `Goal trends detected`,
      content: { trends },
      tags: ['agent', 'agent-insight', 'goal-trend'],
    });
  }

  private async generateActivityDigest(space: {
    id: string;
    name: string;
    workspaceId: string;
  }) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    // Check if we already have a digest for today
    const existing = await this.db
      .selectFrom('agentMemories')
      .select(['id'])
      .where('spaceId', '=', space.id)
      .where('source', '=', 'activity-digest')
      .where('createdAt', '>=', start)
      .limit(1)
      .execute();

    if (existing.length > 0) return;

    const entries = await this.db
      .selectFrom('agentMemories')
      .select(['summary', 'source', 'createdAt'])
      .where('spaceId', '=', space.id)
      .where('createdAt', '>=', start)
      .where((eb) =>
        eb.or([
          eb('source', 'like', 'page.%'),
          eb('source', 'like', 'task.%'),
          eb('source', 'like', 'project.%'),
          eb('source', 'like', 'comment.%'),
          eb('source', 'like', 'goal.%'),
          eb('source', 'in', ['agent-chat', 'agent-summary']),
        ]),
      )
      .orderBy('createdAt', 'desc')
      .limit(50)
      .execute();

    if (!entries.length) return;

    const grouped = new Map<string, string[]>();
    for (const entry of entries) {
      const source = entry.source || 'activity';
      const [bucket] = source.split('.');
      const key = bucket || source;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)?.push(entry.summary || source);
    }

    let digestText = `# Activity Digest\n\n`;
    for (const [bucket, lines] of grouped) {
      const title = bucket.charAt(0).toUpperCase() + bucket.slice(1);
      digestText += `## ${title}\n`;
      lines.slice(0, 10).forEach((line) => {
        digestText += `- ${line}\n`;
      });
      digestText += '\n';
    }

    await this.memoryService.ingestMemory({
      workspaceId: space.workspaceId,
      spaceId: space.id,
      source: 'activity-digest',
      summary: `Activity digest for ${space.name}`,
      content: { text: digestText },
      tags: ['activity-digest'],
    });
  }

  // ============================================================================
  // Cron jobs
  // ============================================================================

  private async runForSpaces(
    handler: (space: any) => Promise<void>,
    options?: { requireDailySummary?: boolean },
  ) {
    const spaces = await this.db
      .selectFrom('spaces')
      .innerJoin('workspaces', 'workspaces.id', 'spaces.workspaceId')
      .select([
        'spaces.id as id',
        'spaces.name as name',
        'spaces.workspaceId as workspaceId',
        'workspaces.settings as settings',
      ])
      .execute();

    for (const space of spaces) {
      const settings = resolveAgentSettings(space.settings);
      if (!settings.enabled) continue;
      if (!settings.enableMemoryInsights && !options?.requireDailySummary) continue;
      if (options?.requireDailySummary && !settings.enableDailySummary) continue;

      try {
        await handler(space);
      } catch (error: any) {
        this.logger.warn(
          `Insights run failed for space ${space.id}: ${error?.message || String(error)}`,
        );
      }
    }
  }

  @Cron('0 7 * * *')
  async runDailySummaries() {
    if (!this.hasApiKey()) {
      this.logger.debug('Skipping daily summaries: no API key configured');
      return;
    }

    await this.runForSpaces(
      async (space) => {
        await this.generateActivityDigest(space);
        // Generate daily summary via the cron (stores to memory)
        const triage = await this.taskRepo.getDailyTriageSummary(space.id, { limit: 5 });
        const summaryText = await this.generateDailySummaryText(space.name, triage);
        await this.memoryService.ingestMemory({
          workspaceId: space.workspaceId,
          spaceId: space.id,
          source: 'agent-insight',
          summary: `Daily summary for ${space.name}`,
          content: { text: summaryText },
          tags: ['agent', 'agent-insight', 'daily-summary'],
        });
      },
      { requireDailySummary: true },
    );
  }

  @Cron('0 7 * * 1')
  async runWeeklySummary() {
    await this.runForSpaces(async (space) => {
      await this.generateSummary(
        space.id,
        space.workspaceId,
        space.name,
        'Weekly',
        7,
        'weekly-summary',
      );
      await this.generateSignals(space.id, space.workspaceId, space.name);
      await this.generateTopicClusters(space.id, space.workspaceId, space.name);
      await this.generateGoalTrends(space.id, space.workspaceId);
    });
  }

  @Cron('0 7 1 * *')
  async runMonthlySummary() {
    await this.runForSpaces(async (space) => {
      await this.generateSummary(
        space.id,
        space.workspaceId,
        space.name,
        'Monthly',
        30,
        'monthly-summary',
      );
      await this.generateTopicClusters(space.id, space.workspaceId, space.name);
      await this.generateGoalTrends(space.id, space.workspaceId);
    });
  }

  @Cron('0 19 * * *')
  async runDailySignals() {
    await this.runForSpaces(async (space) => {
      await this.generateSignals(space.id, space.workspaceId, space.name);
      await this.generateTopicClusters(space.id, space.workspaceId, space.name);
      await this.generateGoalTrends(space.id, space.workspaceId);
    });
  }
}
