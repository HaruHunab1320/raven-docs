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

    return {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [
            {
              type: 'text',
              text: `User Profile${userName ? ` - ${userName}` : ''} (${spaceName})`,
            },
          ],
        },
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
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: 'Trait Signals' }],
        },
        buildList(traitItems),
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

  private buildPrompt(spaceName: string, memoryText: string, priorProfile?: ProfileModel) {
    const prior = priorProfile ? JSON.stringify(priorProfile) : 'none';
    return [
      `You are Raven Docs' profile analyst.`,
      `Create a concise user profile JSON based on recent memories.`,
      `Focus on strengths, challenges, preferences, constraints, goals, risks, focus areas, recommendations, and trait signals.`,
      `Include traits with scores 0-10 for keys: ${TRAIT_KEYS.join(', ')}.`,
      `Return ONLY JSON with keys: summary, strengths, challenges, preferences, constraints, goals{shortTerm,midTerm,longTerm}, risks, focusAreas, recommendations, traits.`,
      `Space: ${spaceName}`,
      `Previous profile (if any): ${prior}`,
      `Memory log:`,
      memoryText,
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

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const memoryText = await this.getRecentMemoryText(
      space.id,
      since,
      user.id,
    );
    if (!memoryText) return;

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
        const prompt = this.buildPrompt(space.name, memoryText, priorProfile);
        const response = await this.aiService.generateContent({
          model: this.getAgentModel(),
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
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
