import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@raven-docs/db/types/kysely.types';
import { AIService } from '../../integrations/ai/ai.service';
import { AgentMemoryService } from '../agent-memory/agent-memory.service';
import { AgentMemoryContextService } from './agent-memory-context.service';
import { TaskService } from '../project/services/task.service';
import { resolveAgentSettings } from './agent-settings';
import { AgentReviewPromptsService } from './agent-review-prompts.service';

type PlanHorizon = 'long' | 'mid' | 'short' | 'daily';

@Injectable()
export class AgentPlannerService {
  private readonly logger = new Logger(AgentPlannerService.name);

  private readonly horizonDays: Record<string, number> = {
    long: 90,
    mid: 30,
    short: 7,
    daily: 1,
  };

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly aiService: AIService,
    private readonly memoryService: AgentMemoryService,
    private readonly taskService: TaskService,
    private readonly reviewPromptService: AgentReviewPromptsService,
    private readonly memoryContextService: AgentMemoryContextService,
  ) {}

  private getAgentModel() {
    return process.env.GEMINI_AGENT_MODEL || 'gemini-3-pro-preview';
  }

  private parseQuestions(text: string): string[] {
    if (!text) return [];
    return text
      .split('\n')
      .map((line) => line.replace(/^[\s*\d.-]+/, '').trim())
      .filter((line) => line.length > 0)
      .slice(0, 5);
  }

  private async buildContext(spaceId: string, workspaceId: string) {
    const goals = await this.db
      .selectFrom('goals')
      .select(['id', 'name', 'horizon'])
      .where('workspaceId', '=', workspaceId)
      .where((eb) =>
        eb('spaceId', '=', spaceId).or('spaceId', 'is', null),
      )
      .orderBy('createdAt', 'desc')
      .execute();

    return { goals };
  }

  private formatProfileContext(memory?: any) {
    if (!memory) return '';
    const content = memory.content as { profile?: any } | undefined;
    const profile = content?.profile;
    if (profile?.summary) return String(profile.summary);
    if (memory.summary) return String(memory.summary);
    return '';
  }

  private formatMemorySummary(memories: any[]) {
    if (!memories.length) return 'none';
    return memories
      .map((memory) => memory.summary)
      .filter(Boolean)
      .join('; ');
  }

  private getWeekKey(date = new Date()) {
    const firstDay = new Date(date.getFullYear(), 0, 1);
    const dayOffset = firstDay.getDay() || 7;
    const weekStart = new Date(firstDay);
    weekStart.setDate(firstDay.getDate() + (7 - dayOffset));
    const diff =
      date.getTime() -
      new Date(
        weekStart.getFullYear(),
        weekStart.getMonth(),
        weekStart.getDate(),
      ).getTime();
    const weekNumber = Math.ceil((diff / (1000 * 60 * 60 * 24) + 1) / 7);
    return `${date.getFullYear()}-W${String(weekNumber).padStart(2, '0')}`;
  }

  private summarizePlanDiff(previousText?: string, nextText?: string) {
    if (!nextText) {
      return {
        summary: 'Plan unavailable.',
        metrics: { added: 0, removed: 0, changeRatio: 0, significance: 'none' },
      };
    }

    if (!previousText) {
      return {
        summary: 'New plan generated.',
        metrics: { added: 0, removed: 0, changeRatio: 1, significance: 'new' },
      };
    }

    const normalize = (text: string) =>
      text
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
    const prevLines = normalize(previousText);
    const nextLines = normalize(nextText);

    const prevSet = new Set(prevLines);
    const nextSet = new Set(nextLines);

    const added = nextLines.filter((line) => !prevSet.has(line));
    const removed = prevLines.filter((line) => !nextSet.has(line));
    const base = Math.max(prevLines.length, nextLines.length, 1);
    const changeRatio = (added.length + removed.length) / base;
    const significance =
      changeRatio >= 0.35
        ? 'major'
        : changeRatio >= 0.15
          ? 'moderate'
          : 'minor';

    const summary = `Changes: +${added.length}/-${removed.length} (${significance}).`;
    return {
      summary,
      metrics: {
        added: added.length,
        removed: removed.length,
        changeRatio: Number(changeRatio.toFixed(2)),
        significance,
        addedSamples: added.slice(0, 3),
        removedSamples: removed.slice(0, 3),
      },
    };
  }

  private getHorizonWindowDays(horizon: PlanHorizon) {
    return this.horizonDays[horizon] || 1;
  }

  private getHorizonLabel(horizon: PlanHorizon) {
    switch (horizon) {
      case 'long':
        return 'Quarterly';
      case 'mid':
        return 'Monthly';
      case 'short':
        return 'Weekly';
      case 'daily':
      default:
        return 'Daily';
    }
  }

  private async getLatestPlanMemory(
    workspaceId: string,
    spaceId: string,
    horizon: PlanHorizon,
  ) {
    const entries = await this.memoryService.queryMemories(
      {
        workspaceId,
        spaceId,
        tags: [`plan:${horizon}`],
        sources: ['agent-plan'],
        limit: 1,
      },
      undefined,
    );
    return entries[0];
  }

  private isPlanFresh(memory: any, horizon: PlanHorizon) {
    if (!memory?.timestamp) return false;
    const last = new Date(memory.timestamp).getTime();
    if (!Number.isFinite(last)) return false;
    const windowDays = this.getHorizonWindowDays(horizon);
    const maxAge = windowDays * 24 * 60 * 60 * 1000;
    return Date.now() - last < maxAge;
  }

  private buildPlanPrompt(context: {
    spaceName: string;
    horizon: PlanHorizon;
    goalsSummary: string;
    triageSummary: string;
    memorySummary: string;
    profileContext?: string;
    upstreamSummary?: string;
    priorSummary?: string;
  }) {
    const horizonLabel = this.getHorizonLabel(context.horizon);
    const focusLine =
      context.horizon === 'long'
        ? 'Define strategic outcomes, themes, and major milestones for the next quarter.'
        : context.horizon === 'mid'
          ? 'Define monthly objectives, milestones, and key risks.'
          : context.horizon === 'short'
            ? 'Define weekly priorities, commitments, and sequencing.'
            : 'Define today’s focus, plan, and timebox.';

    return [
      `You are Raven Docs' planning agent.`,
      `Space: ${context.spaceName}`,
      `${horizonLabel} planning.`,
      focusLine,
      `Goals: ${context.goalsSummary || 'none'}.`,
      `Triage: ${context.triageSummary}.`,
      `Recent context: ${context.memorySummary || 'none'}.`,
      context.profileContext ? `User profile: ${context.profileContext}.` : null,
      context.upstreamSummary
        ? `Upstream plan summary: ${context.upstreamSummary}.`
        : null,
      context.priorSummary
        ? `Previous ${horizonLabel.toLowerCase()} plan: ${context.priorSummary}.`
        : null,
      `Return markdown with sections: Focus, Plan, Next Actions, Timebox, Risks.`,
    ]
      .filter(Boolean)
      .join('\n');
  }

  async generatePlanForSpace(space: {
    id: string;
    name: string;
    workspaceId: string;
    settings?: any;
  }, horizon: PlanHorizon = 'daily', options?: { cascadeFrom?: PlanHorizon }) {
    const settings = resolveAgentSettings(space.settings);
    if (!settings.enabled || !settings.enablePlannerLoop) {
      return null;
    }

    const triage = settings.enableAutoTriage
      ? await this.taskService.getDailyTriageSummary(space.id, {
          limit: 5,
          workspaceId: space.workspaceId,
        })
      : {
          inbox: [],
          waiting: [],
          someday: [],
          overdue: [],
          dueToday: [],
          counts: { inbox: 0, waiting: 0, someday: 0 },
        };

    const { goals } = await this.buildContext(
      space.id,
      space.workspaceId,
    );
    const memoryContext = await this.memoryContextService.buildContext({
      workspaceId: space.workspaceId,
      spaceId: space.id,
      includeRecent: false,
      includeProject: false,
      includeTopic: false,
      shortTermLimit: 12,
      profileTags: ['user-profile'],
      profileLimit: 1,
    });
    const profileContext = this.formatProfileContext(
      memoryContext.memories.profileMemories[0],
    );

    const goalSummary = goals
      .map((goal) => `${goal.name} (${goal.horizon})`)
      .slice(0, 10)
      .join(', ');
    const memorySummary = this.formatMemorySummary(
      memoryContext.memories.shortTermMemories,
    );

    const goalFocusSummary = Array.isArray((triage as any).goalFocus)
      ? (triage as any).goalFocus
          .map((goal: any) => `${goal.name}(${goal.taskCount})`)
          .join(', ')
      : '';

    const priorPlanMemory = await this.getLatestPlanMemory(
      space.workspaceId,
      space.id,
      horizon,
    );
    const priorPlanText =
      (priorPlanMemory?.content as { text?: string } | undefined)?.text || '';
    const priorSummary = priorPlanMemory?.summary
      ? String(priorPlanMemory.summary).slice(0, 300)
      : '';
    const upstreamSummary = options?.cascadeFrom
      ? String(
          (
            await this.getLatestPlanMemory(
              space.workspaceId,
              space.id,
              options.cascadeFrom,
            )
          )?.summary || '',
        ).slice(0, 300)
      : '';

    const planPrompt = this.buildPlanPrompt({
      spaceName: space.name,
      horizon,
      goalsSummary: goalSummary,
      triageSummary: `inbox=${triage.counts.inbox}, waiting=${triage.counts.waiting}, someday=${triage.counts.someday}, overdue=${triage.overdue.length}, dueToday=${triage.dueToday.length}${
        goalFocusSummary ? `, goalFocus=${goalFocusSummary}` : ''
      }`,
      memorySummary,
      profileContext: profileContext || undefined,
      upstreamSummary: upstreamSummary || undefined,
      priorSummary: priorSummary || undefined,
    });

    let planText = 'Plan unavailable.';
    try {
      const response = await this.aiService.generateContent({
        model: this.getAgentModel(),
        contents: [{ role: 'user', parts: [{ text: planPrompt }] }],
      });
      planText =
        response?.candidates?.[0]?.content?.parts?.[0]?.text ||
        'Plan unavailable.';
    } catch (error: any) {
      this.logger.warn(
        `Planner failed for space ${space.id}: ${error?.message || String(error)}`,
      );
    }

    const horizonLabel = this.getHorizonLabel(horizon);
    const changeSummary = this.summarizePlanDiff(priorPlanText, planText);
    const status =
      horizon === 'long' || horizon === 'mid' ? 'pending' : 'active';

    const planRecord = await this.memoryService.ingestMemory({
      workspaceId: space.workspaceId,
      spaceId: space.id,
      source: 'agent-plan',
      summary: `${horizonLabel} plan for ${space.name}`,
      content: {
        text: planText,
        horizon,
        cascadeFrom: options?.cascadeFrom || null,
        windowDays: this.getHorizonWindowDays(horizon),
        status,
        changeSummary: changeSummary.summary,
        changeMetrics: changeSummary.metrics,
        previousPlanId: priorPlanMemory?.id || null,
      },
      tags: [
        'agent',
        'plan',
        `plan:${horizon}`,
        `plan-status:${status}`,
      ],
    });

    if (status === 'pending') {
      const prompt = `${horizonLabel} plan update for ${space.name}. ${changeSummary.summary} Review and confirm adjustments.`;
      await this.reviewPromptService.createPrompts({
        workspaceId: space.workspaceId,
        spaceId: space.id,
        weekKey: this.getWeekKey(new Date()),
        questions: [prompt],
        source: 'plan-cascade',
        metadata: {
          planId: planRecord.id,
          horizon,
          status,
          changeSummary: changeSummary.summary,
        },
      });
    }

    if (settings.enableProactiveQuestions && horizon === 'daily') {
      const questionPrompt = [
        `You are Raven Docs' proactive assistant.`,
        `Suggest 3-5 concise questions to clarify priorities or unblock work.`,
        `Use this context:`,
        `Triage counts: inbox=${triage.counts.inbox}, waiting=${triage.counts.waiting}, someday=${triage.counts.someday}.`,
        goalFocusSummary ? `Goal focus: ${goalFocusSummary}.` : null,
        `Goals: ${goalSummary || 'none'}.`,
        `Recent context: ${memorySummary || 'none'}.`,
        `Return the questions as a bullet list.`,
      ]
        .filter(Boolean)
        .join('\n');

      let questionText = '';
      try {
        const response = await this.aiService.generateContent({
          model: this.getAgentModel(),
          contents: [{ role: 'user', parts: [{ text: questionPrompt }] }],
        });
        questionText =
          response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      } catch (error: any) {
        this.logger.warn(
          `Proactive questions failed for space ${space.id}: ${error?.message || String(error)}`,
        );
      }

      const questions = this.parseQuestions(questionText);
      if (questions.length) {
        await this.memoryService.ingestMemory({
          workspaceId: space.workspaceId,
          spaceId: space.id,
          source: 'agent-proactive-questions',
          summary: `Proactive questions for ${space.name}`,
          content: { questions },
          tags: ['agent', 'proactive-question'],
        });
      }
    }

    return planText;
  }

  async runPlanningCascade(space: {
    id: string;
    name: string;
    workspaceId: string;
    settings?: any;
  }) {
    const settings = resolveAgentSettings(space.settings);
    if (!settings.enabled || !settings.enablePlannerLoop) {
      return null;
    }

    const horizons: PlanHorizon[] = ['long', 'mid', 'short', 'daily'];
    const refreshed: Record<PlanHorizon, boolean> = {
      long: false,
      mid: false,
      short: false,
      daily: false,
    };

    for (const horizon of horizons) {
      const latest = await this.getLatestPlanMemory(
        space.workspaceId,
        space.id,
        horizon,
      );
      const isFresh = this.isPlanFresh(latest, horizon);
      const upstream =
        horizon === 'mid'
          ? 'long'
          : horizon === 'short'
            ? 'mid'
            : horizon === 'daily'
              ? 'short'
              : null;
      const shouldRefresh =
        !isFresh ||
        (upstream && refreshed[upstream as PlanHorizon] === true);

      if (!shouldRefresh) {
        continue;
      }

      await this.generatePlanForSpace(space, horizon, {
        cascadeFrom: upstream as PlanHorizon | undefined,
      });
      refreshed[horizon] = true;
    }

    return refreshed;
  }

  async approvePlan(
    planId: string,
    input: { workspaceId: string; spaceId?: string; userId?: string },
  ) {
    const record = await this.memoryService.getMemoryById(
      input.workspaceId,
      planId,
    );
    if (!record) return null;
    if (input.spaceId && record.spaceId !== input.spaceId) return null;

    const content = (record.content || {}) as Record<string, any>;
    const nextContent = {
      ...content,
      status: 'active',
      approvedAt: new Date().toISOString(),
      approvedBy: input.userId || null,
    };
    const tags = (record.tags as string[] | null) || [];
    const nextTags = [
      ...tags.filter((tag) => !tag.startsWith('plan-status:')),
      'plan-status:active',
    ];

    await this.memoryService.updateMemory({
      id: planId,
      workspaceId: input.workspaceId,
      content: nextContent,
      tags: nextTags,
    });

    await this.memoryService.ingestMemory({
      workspaceId: input.workspaceId,
      spaceId: record.spaceId || undefined,
      source: 'plan-approval',
      summary: `Plan approved`,
      content: {
        planId,
        horizon: content.horizon,
        status: 'active',
      },
      tags: ['agent', 'plan', 'plan-approval'],
    });

    return { id: planId, status: 'active' };
  }

  async rejectPlan(
    planId: string,
    input: { workspaceId: string; spaceId?: string; userId?: string; reason?: string },
  ) {
    const record = await this.memoryService.getMemoryById(
      input.workspaceId,
      planId,
    );
    if (!record) return null;
    if (input.spaceId && record.spaceId !== input.spaceId) return null;

    const content = (record.content || {}) as Record<string, any>;
    const nextContent = {
      ...content,
      status: 'rejected',
      rejectedAt: new Date().toISOString(),
      rejectedBy: input.userId || null,
      rejectionReason: input.reason || null,
    };
    const tags = (record.tags as string[] | null) || [];
    const nextTags = [
      ...tags.filter((tag) => !tag.startsWith('plan-status:')),
      'plan-status:rejected',
    ];

    await this.memoryService.updateMemory({
      id: planId,
      workspaceId: input.workspaceId,
      content: nextContent,
      tags: nextTags,
    });

    await this.memoryService.ingestMemory({
      workspaceId: input.workspaceId,
      spaceId: record.spaceId || undefined,
      source: 'plan-approval',
      summary: `Plan rejected`,
      content: {
        planId,
        horizon: content.horizon,
        status: 'rejected',
        reason: input.reason || null,
      },
      tags: ['agent', 'plan', 'plan-rejection'],
    });

    return { id: planId, status: 'rejected' };
  }

  async runPlanningCascadeForSpaceId(
    spaceId: string,
    workspace: { id: string; settings?: any },
  ) {
    const space = await this.db
      .selectFrom('spaces')
      .select(['id', 'name', 'workspaceId'])
      .where('id', '=', spaceId)
      .where('workspaceId', '=', workspace.id)
      .executeTakeFirst();

    if (!space) {
      return null;
    }

    return this.runPlanningCascade({
      id: space.id,
      name: space.name,
      workspaceId: space.workspaceId,
      settings: workspace.settings,
    });
  }

  async generatePlanForSpaceId(spaceId: string, workspace: {
    id: string;
    settings?: any;
  }, horizon: PlanHorizon = 'daily') {
    const space = await this.db
      .selectFrom('spaces')
      .select(['id', 'name', 'workspaceId'])
      .where('id', '=', spaceId)
      .where('workspaceId', '=', workspace.id)
      .executeTakeFirst();

    if (!space) {
      return null;
    }

    return this.generatePlanForSpace(
      {
      id: space.id,
      name: space.name,
      workspaceId: space.workspaceId,
      settings: workspace.settings,
      },
      horizon,
    );
  }

  @Cron('0 8,14 * * *')
  async runPlannerLoop() {
    if (
      !process.env.GEMINI_API_KEY &&
      !process.env.gemini_api_key &&
      !process.env.GOOGLE_API_KEY &&
      !process.env.google_api_key
    ) {
      this.logger.debug(
        'Skipping planner loop: GEMINI_API_KEY or GOOGLE_API_KEY not set',
      );
      return;
    }

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
      try {
        await this.runPlanningCascade(space);
      } catch (error: any) {
        this.logger.warn(
          `Planner loop failed for space ${space.id}: ${error?.message || String(error)}`,
        );
      }
    }
  }
}
