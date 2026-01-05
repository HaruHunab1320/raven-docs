import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@raven-docs/db/types/kysely.types';
import { AIService } from '../../integrations/ai/ai.service';
import { AgentMemoryService } from './agent-memory.service';
import { PageRepo } from '../../database/repos/page/page.repo';
import { generateSlugId } from '../../common/helpers';
import { generateJitteredKeyBetween } from 'fractional-indexing-jittered';
import { resolveAgentSettings } from '../agent/agent-settings';

type ProfileModel = {
  summary?: string;
  strengths?: string[];
  challenges?: string[];
  preferences?: string[];
  constraints?: string[];
  goals?: {
    shortTerm?: string[];
    midTerm?: string[];
    longTerm?: string[];
  };
  risks?: string[];
  focusAreas?: string[];
  recommendations?: string[];
  traits?: Record<string, number>;
  confidence?: {
    summary?: string;
    traits?: string;
    preferences?: string;
    goals?: string;
  };
  evidence?: {
    summary?: string[];
    traits?: string[];
    preferences?: string[];
    goals?: string[];
  };
};

const TRAIT_KEYS = [
  'focus',
  'execution',
  'creativity',
  'communication',
  'leadership',
  'learning',
  'resilience',
] as const;
type TraitKey = (typeof TRAIT_KEYS)[number];

@Injectable()
export class AgentProfileService {
  private readonly logger = new Logger(AgentProfileService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly aiService: AIService,
    private readonly memoryService: AgentMemoryService,
    private readonly pageRepo: PageRepo,
  ) {}

  private getAgentModel() {
    return process.env.GEMINI_AGENT_MODEL || 'gemini-3-pro-preview';
  }

  private async getRecentMemoryText(
    spaceId: string,
    since: Date,
    userId?: string,
  ) {
    let query = this.db
      .selectFrom('agentMemories')
      .select(['summary', 'content', 'createdAt', 'creatorId'])
      .where('spaceId', '=', spaceId)
      .where('createdAt', '>=', since)
      .orderBy('createdAt', 'desc')
      .limit(250);

    if (userId) {
      query = query.where('creatorId', '=', userId);
    }

    const rows = await query.execute();

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

  private async getRecentMemories(
    spaceId: string,
    since: Date,
    userId?: string,
    sources?: string[],
  ) {
    let query = this.db
      .selectFrom('agentMemories')
      .select(['id', 'summary', 'content', 'tags', 'source', 'createdAt', 'creatorId'])
      .where('spaceId', '=', spaceId)
      .where('createdAt', '>=', since)
      .orderBy('createdAt', 'desc')
      .limit(400);

    if (userId) {
      query = query.where('creatorId', '=', userId);
    }

    if (sources?.length) {
      query = query.where('source', 'in', sources);
    }

    return query.execute();
  }

  private normalizeTags(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.map((tag) => String(tag)).filter(Boolean);
    }
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          return parsed.map((tag) => String(tag)).filter(Boolean);
        }
      } catch {
        return value
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean);
      }
    }
    return [];
  }

  private extractMemoryText(row: {
    summary?: string | null;
    content?: any;
  }) {
    if (typeof row.content === 'string') {
      return row.content;
    }
    if (row.content && typeof row.content === 'object' && 'text' in row.content) {
      return (row.content as { text?: string }).text || row.summary || '';
    }
    return row.summary || '';
  }

  private buildEvidenceLog(
    entries: Array<{
      summary?: string | null;
      content?: any;
      source?: string | null;
      tags?: unknown;
      createdAt: Date;
    }>,
    maxItems: number,
  ) {
    return entries
      .slice(0, maxItems)
      .map((row) => {
        const date = row.createdAt.toISOString().slice(0, 10);
        const source = row.source ? `source=${row.source}` : 'source=unknown';
        const tags = this.normalizeTags(row.tags);
        const tagText = tags.length ? `tags=${tags.slice(0, 3).join('|')}` : '';
        const text = this.extractMemoryText(row);
        return `- [${date}] (${source}${tagText ? `, ${tagText}` : ''}) ${text}`;
      })
      .join('\n');
  }

  private extractJson(text: string): ProfileModel | null {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }

  private normalizeList(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.map((item) => String(item)).filter(Boolean);
  }

  private normalizeTraits(value: unknown) {
    const traits: Record<string, number> = {};
    if (!value || typeof value !== 'object') return traits;
    for (const key of TRAIT_KEYS) {
      const raw = (value as Record<string, unknown>)[key];
      const num = typeof raw === 'number' ? raw : Number(raw);
      if (Number.isFinite(num)) {
        const clamped = Math.min(10, Math.max(0, Math.round(num)));
        traits[key] = clamped;
      }
    }
    return traits;
  }

  private normalizeProfile(profile: ProfileModel | null): ProfileModel {
    if (!profile || typeof profile !== 'object') return {};
    return {
      summary: profile.summary ? String(profile.summary) : undefined,
      strengths: this.normalizeList(profile.strengths),
      challenges: this.normalizeList(profile.challenges),
      preferences: this.normalizeList(profile.preferences),
      constraints: this.normalizeList(profile.constraints),
      risks: this.normalizeList(profile.risks),
      focusAreas: this.normalizeList(profile.focusAreas),
      recommendations: this.normalizeList(profile.recommendations),
      traits: this.normalizeTraits(profile.traits),
      confidence: {
        summary: profile.confidence?.summary,
        traits: profile.confidence?.traits,
        preferences: profile.confidence?.preferences,
        goals: profile.confidence?.goals,
      },
      evidence: {
        summary: this.normalizeList(profile.evidence?.summary),
        traits: this.normalizeList(profile.evidence?.traits),
        preferences: this.normalizeList(profile.evidence?.preferences),
        goals: this.normalizeList(profile.evidence?.goals),
      },
      goals: {
        shortTerm: this.normalizeList(profile.goals?.shortTerm),
        midTerm: this.normalizeList(profile.goals?.midTerm),
        longTerm: this.normalizeList(profile.goals?.longTerm),
      },
    };
  }

  private buildProfileDoc(
    profile: ProfileModel,
    spaceName: string,
    userName?: string | null,
  ) {
    const buildList = (items?: string[]) =>
      items?.length
        ? {
            type: 'bulletList',
            content: items.map((item) => ({
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: item }],
                },
              ],
            })),
          }
        : {
            type: 'paragraph',
            content: [{ type: 'text', text: 'No signals yet.' }],
          };

    const traitLabels: Record<TraitKey, string> = {
      focus: 'Focus',
      execution: 'Execution',
      creativity: 'Creativity',
      communication: 'Communication',
      leadership: 'Leadership',
      learning: 'Learning',
      resilience: 'Resilience',
    };
    const traitItems = Object.entries(profile.traits || {}).map(
      ([key, value]) => {
        const label = traitLabels[key as TraitKey] || key;
        return `${label}: ${value}/10`;
      },
    );
    const confidenceItems = [
      profile.confidence?.summary
        ? `Summary: ${profile.confidence.summary}`
        : 'Summary: low',
      profile.confidence?.traits
        ? `Traits: ${profile.confidence.traits}`
        : 'Traits: low',
      profile.confidence?.preferences
        ? `Preferences: ${profile.confidence.preferences}`
        : 'Preferences: low',
      profile.confidence?.goals ? `Goals: ${profile.confidence.goals}` : 'Goals: low',
    ];
    const buildEvidenceSection = (items?: string[]) =>
      items?.length
        ? {
            type: 'bulletList',
            content: items.map((item) => ({
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: item }],
                },
              ],
            })),
          }
        : {
            type: 'paragraph',
            content: [{ type: 'text', text: 'No evidence captured yet.' }],
          };

    return {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text:
                profile.summary ||
                'Auto-generated profile summary based on recent activity.',
            },
          ],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: `Traits confidence: ${
                profile.confidence?.traits || 'low'
              }`,
            },
          ],
        },
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: 'Trait Signals' }],
        },
        buildList(traitItems),
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: 'Confidence' }],
        },
        buildList(confidenceItems),
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: 'Strengths' }],
        },
        buildList(profile.strengths),
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: 'Challenges' }],
        },
        buildList(profile.challenges),
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: 'Preferences' }],
        },
        buildList(profile.preferences),
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: 'Constraints' }],
        },
        buildList(profile.constraints),
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: 'Goals (Short Term)' }],
        },
        buildList(profile.goals?.shortTerm),
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: 'Goals (Mid Term)' }],
        },
        buildList(profile.goals?.midTerm),
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: 'Goals (Long Term)' }],
        },
        buildList(profile.goals?.longTerm),
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: 'Risks & Signals' }],
        },
        buildList(profile.risks),
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: 'Focus Areas' }],
        },
        buildList(profile.focusAreas),
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: 'Recommendations' }],
        },
        buildList(profile.recommendations),
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: 'Evidence' }],
        },
        {
          type: 'heading',
          attrs: { level: 4 },
          content: [{ type: 'text', text: 'Summary Evidence' }],
        },
        buildEvidenceSection(profile.evidence?.summary),
        {
          type: 'heading',
          attrs: { level: 4 },
          content: [{ type: 'text', text: 'Traits Evidence' }],
        },
        buildEvidenceSection(profile.evidence?.traits),
        {
          type: 'heading',
          attrs: { level: 4 },
          content: [{ type: 'text', text: 'Preferences Evidence' }],
        },
        buildEvidenceSection(profile.evidence?.preferences),
        {
          type: 'heading',
          attrs: { level: 4 },
          content: [{ type: 'text', text: 'Goals Evidence' }],
        },
        buildEvidenceSection(profile.evidence?.goals),
      ],
    };
  }

  private async getOrCreateProfilePage(
    spaceId: string,
    workspaceId: string,
    userName?: string | null,
  ) {
    const suffix = userName ? ` - ${userName}` : '';
    const title = `User Profile${suffix}`;
    const existing = await this.db
      .selectFrom('pages')
      .select(['id', 'slugId', 'title'])
      .where('spaceId', '=', spaceId)
      .where('workspaceId', '=', workspaceId)
      .where('title', '=', title)
      .executeTakeFirst();

    if (existing) {
      return existing;
    }

    const lastPage = await this.db
      .selectFrom('pages')
      .select(['position'])
      .where('spaceId', '=', spaceId)
      .where('parentPageId', 'is', null)
      .orderBy('position', 'desc')
      .limit(1)
      .executeTakeFirst();

    const position = generateJitteredKeyBetween(
      lastPage?.position ?? null,
      null,
    );

    const page = await this.pageRepo.insertPage({
      slugId: generateSlugId(),
      title,
      position,
      icon: null,
      parentPageId: null,
      spaceId,
      workspaceId,
      creatorId: null,
      lastUpdatedById: null,
      content: null,
    });

    return { id: page.id, slugId: page.slugId, title: page.title };
  }

  private buildPrompt(
    spaceName: string,
    generalLog: string,
    journalLog: string,
    stats: {
      signalCount: number;
      journalCount: number;
      signalSpanDays: number;
      distinctDays: number;
      allowTraits: boolean;
      allowPreferences: boolean;
    },
    priorProfile?: ProfileModel,
  ) {
    const prior = priorProfile ? JSON.stringify(priorProfile) : 'none';
    return [
      `You are Raven Docs' profile analyst.`,
      `Create a concise user profile JSON based on recent memories.`,
      `Focus on strengths, challenges, preferences, constraints, goals, risks, focus areas, recommendations, and trait signals.`,
      `Include traits with scores 0-10 for keys: ${TRAIT_KEYS.join(', ')}.`,
      `Return ONLY JSON with keys: summary, strengths, challenges, preferences, constraints, goals{shortTerm,midTerm,longTerm}, risks, focusAreas, recommendations, traits, confidence, evidence.`,
      `Confidence must include keys: summary, traits, preferences, goals with values low|medium|high.`,
      `Evidence must include keys: summary, traits, preferences, goals with 1-5 bullet strings each.`,
      `Space: ${spaceName}`,
      `Signal stats: total=${stats.signalCount}, journal=${stats.journalCount}, spanDays=${stats.signalSpanDays}, distinctDays=${stats.distinctDays}.`,
      `Only provide traits if allowTraits=true. Only provide preferences/goals if allowPreferences=true.`,
      `If not allowed, set those arrays empty, traits empty, and confidence low.`,
      `Previous profile (if any): ${prior}`,
      `General memory log:`,
      generalLog || 'none',
      `Journal memory log (for preferences/goals only):`,
      journalLog || 'none',
    ].join('\n');
  }

  private async generateProfile(
    space: {
      id: string;
      name: string;
      workspaceId: string;
      settings?: any;
    },
    user: { id: string; name?: string | null; email?: string | null },
  ) {
    const settings = resolveAgentSettings(space.settings);
    if (!settings.enabled || !settings.enableMemoryInsights) {
      return;
    }

    const now = Date.now();
    const primarySince = new Date(now - 90 * 24 * 60 * 60 * 1000);
    const extendedSince = new Date(now - 365 * 24 * 60 * 60 * 1000);
    const allowedSources = [
      'agent-chat',
      'agent-insight',
      'activity-digest',
      'agent-summary',
      'approval-event',
      'project.created',
      'project.updated',
      'comment.created',
      'comment.updated',
      'page.created',
      'page.updated',
      'research-job',
    ];

    let memories = await this.getRecentMemories(
      space.id,
      primarySince,
      user.id,
      allowedSources,
    );
    if (memories.length < 12) {
      const extended = await this.getRecentMemories(
        space.id,
        extendedSince,
        user.id,
        allowedSources,
      );
      const byId = new Map<string, (typeof memories)[number]>();
      for (const entry of memories) byId.set(entry.id, entry);
      for (const entry of extended) byId.set(entry.id, entry);
      memories = Array.from(byId.values()).sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
      );
    }

    if (!memories.length) return;

    const journalTags = new Set(['journal', 'daily-summary']);
    const journalMemories = memories.filter((entry) =>
      this.normalizeTags(entry.tags).some((tag) => journalTags.has(tag)),
    );

    const signalDates = memories.map((entry) => entry.createdAt);
    const latest = signalDates[0];
    const earliest = signalDates[signalDates.length - 1];
    const spanDays = latest && earliest
      ? Math.max(
          1,
          Math.round(
            (latest.getTime() - earliest.getTime()) / (24 * 60 * 60 * 1000),
          ),
        )
      : 0;
    const distinctDays = new Set(
      signalDates.map((date) => date.toISOString().slice(0, 10)),
    ).size;

    const allowTraits = memories.length >= 12 && spanDays >= 30 && distinctDays >= 10;
    const allowPreferences = journalMemories.length >= 5;

    const generalLog = this.buildEvidenceLog(memories, 120);
    const journalLog = this.buildEvidenceLog(journalMemories, 60);

    const existingProfiles = await this.memoryService.queryMemories(
      {
        workspaceId: space.workspaceId,
        spaceId: space.id,
        tags: [`user:${user.id}`],
        limit: 1,
      },
      undefined,
    );
    const priorProfile = existingProfiles[0]?.content?.profile as
      | ProfileModel
      | undefined;

    let profile: ProfileModel = {};
    if (
      process.env.GEMINI_API_KEY ||
      process.env.gemini_api_key ||
      process.env.GOOGLE_API_KEY ||
      process.env.google_api_key
    ) {
      try {
        const prompt = this.buildPrompt(
          space.name,
          generalLog,
          journalLog,
          {
            signalCount: memories.length,
            journalCount: journalMemories.length,
            signalSpanDays: spanDays,
            distinctDays,
            allowTraits,
            allowPreferences,
          },
          priorProfile,
        );
        const response = await this.aiService.generateContent({
          model: this.getAgentModel(),
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'object',
            properties: {
              summary: { type: 'string' },
              strengths: { type: 'array', items: { type: 'string' } },
              challenges: { type: 'array', items: { type: 'string' } },
              preferences: { type: 'array', items: { type: 'string' } },
              constraints: { type: 'array', items: { type: 'string' } },
              risks: { type: 'array', items: { type: 'string' } },
              focusAreas: { type: 'array', items: { type: 'string' } },
              recommendations: { type: 'array', items: { type: 'string' } },
              traits: { type: 'object' },
              goals: {
                type: 'object',
                properties: {
                  shortTerm: { type: 'array', items: { type: 'string' } },
                  midTerm: { type: 'array', items: { type: 'string' } },
                  longTerm: { type: 'array', items: { type: 'string' } },
                },
              },
              confidence: {
                type: 'object',
                properties: {
                  summary: { type: 'string' },
                  traits: { type: 'string' },
                  preferences: { type: 'string' },
                  goals: { type: 'string' },
                },
              },
              evidence: {
                type: 'object',
                properties: {
                  summary: { type: 'array', items: { type: 'string' } },
                  traits: { type: 'array', items: { type: 'string' } },
                  preferences: { type: 'array', items: { type: 'string' } },
                  goals: { type: 'array', items: { type: 'string' } },
                },
              },
            },
            required: ['summary', 'strengths', 'challenges', 'preferences', 'constraints', 'risks', 'focusAreas', 'recommendations', 'traits', 'goals', 'confidence', 'evidence'],
          },
        });
        const text =
          response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        profile = this.normalizeProfile(this.extractJson(text));
      } catch (error: any) {
        this.logger.warn(
          `Profile generation failed for space ${space.id}: ${error?.message || String(error)}`,
        );
      }
    }

    const normalized = this.normalizeProfile(profile);
    if (!allowTraits) {
      normalized.traits = {};
      normalized.confidence = {
        ...normalized.confidence,
        traits: 'low',
      };
      normalized.evidence = {
        ...normalized.evidence,
        traits: [],
      };
    }
    if (!allowPreferences) {
      normalized.preferences = [];
      normalized.goals = { shortTerm: [], midTerm: [], longTerm: [] };
      normalized.confidence = {
        ...normalized.confidence,
        preferences: 'low',
        goals: 'low',
      };
      normalized.evidence = {
        ...normalized.evidence,
        preferences: [],
        goals: [],
      };
    }
    if (memories.length < 3) {
      normalized.summary =
        'Not enough data yet. Add journal entries and project activity to build your profile.';
      normalized.confidence = {
        ...normalized.confidence,
        summary: 'low',
      };
      normalized.evidence = {
        ...normalized.evidence,
        summary: [],
      };
    }
    const profilePage = await this.getOrCreateProfilePage(
      space.id,
      space.workspaceId,
      user.name || user.email,
    );
    const doc = this.buildProfileDoc(
      normalized,
      space.name,
      user.name || user.email,
    );

    await this.pageRepo.updatePage(
      {
        content: JSON.stringify(doc),
      },
      profilePage.id,
    );

    await this.memoryService.ingestMemory({
      workspaceId: space.workspaceId,
      spaceId: space.id,
      source: 'agent-profile',
      summary: `User profile updated for ${user.name || user.email || user.id}`,
      content: {
        profile: normalized,
        pageId: profilePage.id,
        pageTitle: profilePage.title,
        userId: user.id,
        userName: user.name || null,
        userEmail: user.email || null,
      },
      tags: ['agent', 'user-profile', `user:${user.id}`],
    });
  }

  async distillForSpace(
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
      throw new NotFoundException('Space not found');
    }

    const users = await this.db
      .selectFrom('spaceMembers')
      .innerJoin('users', 'users.id', 'spaceMembers.userId')
      .select(['users.id as id', 'users.name as name', 'users.email as email'])
      .where('spaceMembers.spaceId', '=', space.id)
      .where('spaceMembers.deletedAt', 'is', null)
      .where('users.deletedAt', 'is', null)
      .where('users.deactivatedAt', 'is', null)
      .execute();

    for (const user of users) {
      await this.generateProfile(
        {
          id: space.id,
          name: space.name,
          workspaceId: space.workspaceId,
          settings: workspace.settings,
        },
        user,
      );
    }
  }

  async distillForUser(
    spaceId: string,
    workspace: { id: string; settings?: any },
    userId: string,
  ) {
    const space = await this.db
      .selectFrom('spaces')
      .select(['id', 'name', 'workspaceId'])
      .where('id', '=', spaceId)
      .where('workspaceId', '=', workspace.id)
      .executeTakeFirst();

    if (!space) {
      throw new NotFoundException('Space not found');
    }

    const user = await this.db
      .selectFrom('users')
      .select(['id', 'name', 'email'])
      .where('id', '=', userId)
      .where('workspaceId', '=', workspace.id)
      .where('deletedAt', 'is', null)
      .where('deactivatedAt', 'is', null)
      .executeTakeFirst();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.generateProfile(
      {
        id: space.id,
        name: space.name,
        workspaceId: space.workspaceId,
        settings: workspace.settings,
      },
      user,
    );
  }

  private async runForSpaces(handler: (space: any) => Promise<void>) {
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
        await handler(space);
      } catch (error: any) {
        this.logger.warn(
          `Profile distillation failed for space ${space.id}: ${error?.message || String(error)}`,
        );
      }
    }
  }

  @Cron('0 6 * * *')
  async runDailyProfileDistillation() {
    await this.runForSpaces(async (space) => {
      const users = await this.db
        .selectFrom('spaceMembers')
        .innerJoin('users', 'users.id', 'spaceMembers.userId')
        .select(['users.id as id', 'users.name as name', 'users.email as email'])
        .where('spaceMembers.spaceId', '=', space.id)
        .where('spaceMembers.deletedAt', 'is', null)
        .where('users.deletedAt', 'is', null)
        .where('users.deactivatedAt', 'is', null)
        .execute();

      for (const user of users) {
        await this.generateProfile(space, user);
      }
    });
  }
}
