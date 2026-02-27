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
  traitTrends?: Array<{
    trait: string;
    current: number;
    previous: number;
    delta: number;
    trend: 'improving' | 'stable' | 'declining';
  }>;
  patterns?: {
    completionRate?: number;
    consistencyScore?: number;
    diversityScore?: number;
    collaborationScore?: number;
  };
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

// =============================================================================
// Trait Definitions & Behavioral Indicators
// =============================================================================

interface TraitDefinition {
  key: TraitKey;
  name: string;
  description: string;
  behavioralIndicators: {
    high: string[];
    medium: string[];
    low: string[];
  };
  rubric: {
    range: [number, number];
    description: string;
  }[];
}

const TRAIT_DEFINITIONS: TraitDefinition[] = [
  {
    key: 'focus',
    name: 'Focus',
    description: 'Ability to maintain concentrated attention on tasks and resist distractions',
    behavioralIndicators: {
      high: [
        'Completes deep work sessions (>30 min) without context switching',
        'Works on single projects for extended periods',
        'Minimal task switching within work sessions',
        'Consistent daily engagement patterns',
        'Completes tasks before starting new ones',
      ],
      medium: [
        'Regular work sessions with some interruptions',
        'Manages 2-3 concurrent projects effectively',
        'Returns to interrupted tasks within reasonable time',
      ],
      low: [
        'Frequent context switching between unrelated tasks',
        'Many started but incomplete items',
        'Scattered engagement across many projects',
        'Short bursts of activity with long gaps',
      ],
    },
    rubric: [
      { range: [9, 10], description: 'Exceptional focus - deep work mastery, minimal distractions' },
      { range: [7, 8], description: 'Strong focus - sustained attention, rare interruptions' },
      { range: [5, 6], description: 'Moderate focus - reasonable concentration with some drift' },
      { range: [3, 4], description: 'Developing focus - frequent context switching' },
      { range: [0, 2], description: 'Limited focus - highly fragmented attention' },
    ],
  },
  {
    key: 'execution',
    name: 'Execution',
    description: 'Ability to complete tasks, deliver results, and follow through on commitments',
    behavioralIndicators: {
      high: [
        'High task completion rate (>80%)',
        'Consistently meets deadlines',
        'Breaks down complex work into actionable steps',
        'Proactively updates task status',
        'Delivers quality output regularly',
      ],
      medium: [
        'Moderate completion rate (50-80%)',
        'Generally meets important deadlines',
        'Sometimes needs reminders on follow-through',
      ],
      low: [
        'Many overdue or stale tasks',
        'Starts initiatives but rarely completes',
        'Difficulty translating plans into action',
        'Tasks remain in "in progress" indefinitely',
      ],
    },
    rubric: [
      { range: [9, 10], description: 'Exceptional execution - ships consistently, high completion rate' },
      { range: [7, 8], description: 'Strong execution - reliable delivery, good follow-through' },
      { range: [5, 6], description: 'Moderate execution - completes most important items' },
      { range: [3, 4], description: 'Developing execution - inconsistent completion' },
      { range: [0, 2], description: 'Limited execution - difficulty completing tasks' },
    ],
  },
  {
    key: 'creativity',
    name: 'Creativity',
    description: 'Ability to generate novel ideas, make unexpected connections, and innovate',
    behavioralIndicators: {
      high: [
        'Generates original content and ideas',
        'Makes cross-domain connections',
        'Proposes alternative approaches to problems',
        'Creates new pages/projects with novel concepts',
        'Uses diagrams, drawings, or visual thinking',
      ],
      medium: [
        'Adapts existing ideas to new contexts',
        'Occasionally proposes new approaches',
        'Engages with creative tools and features',
      ],
      low: [
        'Primarily follows established patterns',
        'Rarely proposes alternatives',
        'Content is mostly derivative or templated',
      ],
    },
    rubric: [
      { range: [9, 10], description: 'Highly creative - consistent innovation, original thinking' },
      { range: [7, 8], description: 'Creative - regular novel ideas, good synthesis' },
      { range: [5, 6], description: 'Moderately creative - occasional innovation' },
      { range: [3, 4], description: 'Developing creativity - follows patterns with variations' },
      { range: [0, 2], description: 'Limited creativity - primarily conventional approaches' },
    ],
  },
  {
    key: 'communication',
    name: 'Communication',
    description: 'Ability to express ideas clearly, collaborate, and engage with others',
    behavioralIndicators: {
      high: [
        'Writes clear, well-structured content',
        'Active in comments and discussions',
        'Provides helpful feedback to others',
        'Documents decisions and context',
        'Explains complex ideas accessibly',
      ],
      medium: [
        'Regular participation in discussions',
        'Adequate documentation of work',
        'Responds to comments and requests',
      ],
      low: [
        'Minimal engagement with others',
        'Sparse or unclear documentation',
        'Rarely comments or provides feedback',
        'Works in isolation without updates',
      ],
    },
    rubric: [
      { range: [9, 10], description: 'Excellent communicator - clear, engaged, collaborative' },
      { range: [7, 8], description: 'Strong communicator - good clarity and engagement' },
      { range: [5, 6], description: 'Adequate communication - functional but limited' },
      { range: [3, 4], description: 'Developing communication - inconsistent engagement' },
      { range: [0, 2], description: 'Limited communication - minimal interaction' },
    ],
  },
  {
    key: 'leadership',
    name: 'Leadership',
    description: 'Ability to guide initiatives, make decisions, and influence outcomes',
    behavioralIndicators: {
      high: [
        'Initiates new projects and spaces',
        'Sets direction and priorities',
        'Makes and documents decisions',
        'Coordinates work across team members',
        'Takes ownership of outcomes',
      ],
      medium: [
        'Leads specific initiatives',
        'Participates in decision-making',
        'Occasionally drives team coordination',
      ],
      low: [
        'Primarily follows others\' direction',
        'Rarely initiates or drives decisions',
        'Waits for assignments rather than proposing',
      ],
    },
    rubric: [
      { range: [9, 10], description: 'Strong leader - drives vision, coordinates effectively' },
      { range: [7, 8], description: 'Capable leader - takes initiative, guides work' },
      { range: [5, 6], description: 'Emerging leader - leads when needed' },
      { range: [3, 4], description: 'Developing leadership - occasional initiative' },
      { range: [0, 2], description: 'Limited leadership - primarily follows direction' },
    ],
  },
  {
    key: 'learning',
    name: 'Learning',
    description: 'Ability to acquire new knowledge, adapt, and grow skills over time',
    behavioralIndicators: {
      high: [
        'Explores new topics and domains',
        'Uses research features actively',
        'Asks questions and seeks understanding',
        'Applies new knowledge to work',
        'Shows skill progression over time',
      ],
      medium: [
        'Engages with learning when needed',
        'Adapts to new tools and processes',
        'Occasionally explores new areas',
      ],
      low: [
        'Sticks to familiar topics and methods',
        'Rarely uses research or exploration features',
        'Resistant to new approaches',
      ],
    },
    rubric: [
      { range: [9, 10], description: 'Voracious learner - constant growth, curious explorer' },
      { range: [7, 8], description: 'Active learner - regularly acquiring new knowledge' },
      { range: [5, 6], description: 'Moderate learner - learns when necessary' },
      { range: [3, 4], description: 'Passive learner - occasional growth' },
      { range: [0, 2], description: 'Limited learning - rarely explores new areas' },
    ],
  },
  {
    key: 'resilience',
    name: 'Resilience',
    description: 'Ability to persist through challenges, recover from setbacks, and maintain momentum',
    behavioralIndicators: {
      high: [
        'Continues work despite obstacles',
        'Re-engages after periods of inactivity',
        'Iterates on failed attempts',
        'Maintains consistent long-term engagement',
        'Adapts approach when initial plans fail',
      ],
      medium: [
        'Generally persists through moderate challenges',
        'Recovers from setbacks with some delay',
        'Maintains engagement over medium term',
      ],
      low: [
        'Abandons projects when challenges arise',
        'Long gaps with no recovery',
        'Difficulty maintaining momentum',
        'Gives up after initial failures',
      ],
    },
    rubric: [
      { range: [9, 10], description: 'Highly resilient - persists through adversity, adapts' },
      { range: [7, 8], description: 'Resilient - good recovery, sustained effort' },
      { range: [5, 6], description: 'Moderate resilience - handles typical setbacks' },
      { range: [3, 4], description: 'Developing resilience - struggles with obstacles' },
      { range: [0, 2], description: 'Limited resilience - easily derailed' },
    ],
  },
];

// =============================================================================
// Signal-to-Trait Mapping with Weights
// =============================================================================

interface SignalMapping {
  source: string;
  tags?: string[];
  contentPatterns?: RegExp[];
  traitWeights: Partial<Record<TraitKey, number>>;
  description: string;
}

const SIGNAL_MAPPINGS: SignalMapping[] = [
  // Task/Project completion signals
  {
    source: 'project.updated',
    contentPatterns: [/completed|done|finished|shipped/i],
    traitWeights: { execution: 2, focus: 1, resilience: 1 },
    description: 'Completed project work',
  },
  {
    source: 'project.created',
    traitWeights: { leadership: 1.5, creativity: 1, execution: 0.5 },
    description: 'Created new project',
  },
  // Page activity signals
  {
    source: 'page.created',
    traitWeights: { creativity: 1, execution: 0.5, communication: 0.5 },
    description: 'Created new page',
  },
  {
    source: 'page.updated',
    traitWeights: { execution: 0.5, focus: 0.5 },
    description: 'Updated page content',
  },
  // Comment/collaboration signals
  {
    source: 'comment.created',
    traitWeights: { communication: 1.5, leadership: 0.5 },
    description: 'Added comment',
  },
  {
    source: 'comment.updated',
    traitWeights: { communication: 0.5 },
    description: 'Updated comment',
  },
  // Agent interaction signals
  {
    source: 'agent-chat',
    traitWeights: { learning: 1, creativity: 0.5 },
    description: 'Engaged with AI agent',
  },
  {
    source: 'agent-insight',
    traitWeights: { learning: 1.5, focus: 0.5 },
    description: 'Received agent insight',
  },
  // Research signals
  {
    source: 'research-job',
    traitWeights: { learning: 2, creativity: 1, focus: 1 },
    description: 'Conducted research',
  },
  // Approval/decision signals
  {
    source: 'approval-event',
    traitWeights: { leadership: 1.5, execution: 1 },
    description: 'Approved or made decision',
  },
  // Activity patterns
  {
    source: 'activity-digest',
    traitWeights: { focus: 1, resilience: 0.5 },
    description: 'Sustained activity session',
  },
  {
    source: 'agent-summary',
    traitWeights: { focus: 0.5, execution: 0.5 },
    description: 'Activity summary generated',
  },
  // Journal signals (for preferences/goals)
  {
    source: 'page.created',
    tags: ['journal', 'daily-summary'],
    traitWeights: { focus: 1, resilience: 1, learning: 0.5 },
    description: 'Created journal entry',
  },
];

// =============================================================================
// Signal Analysis & Scoring
// =============================================================================

interface AnalyzedSignals {
  traitScores: Record<TraitKey, number>;
  traitEvidence: Record<TraitKey, string[]>;
  signalCounts: Record<string, number>;
  patterns: {
    completionRate: number;
    avgSessionDuration: number;
    consistencyScore: number;
    diversityScore: number;
    collaborationScore: number;
  };
}

function analyzeSignals(
  memories: Array<{
    id: string;
    summary?: string | null;
    content?: any;
    tags?: unknown;
    source?: string | null;
    createdAt: Date;
  }>,
): AnalyzedSignals {
  const traitAccumulators: Record<TraitKey, number> = {
    focus: 0,
    execution: 0,
    creativity: 0,
    communication: 0,
    leadership: 0,
    learning: 0,
    resilience: 0,
  };
  const traitEvidence: Record<TraitKey, string[]> = {
    focus: [],
    execution: [],
    creativity: [],
    communication: [],
    leadership: [],
    learning: [],
    resilience: [],
  };
  const signalCounts: Record<string, number> = {};

  // Normalize tags helper
  const normalizeTags = (value: unknown): string[] => {
    if (Array.isArray(value)) return value.map(String).filter(Boolean);
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
      } catch {
        return value.split(',').map((t) => t.trim()).filter(Boolean);
      }
    }
    return [];
  };

  // Extract text from content
  const extractText = (content: any, summary?: string | null): string => {
    if (typeof content === 'string') return content;
    if (content?.text) return content.text;
    return summary || '';
  };

  // Process each memory against signal mappings
  for (const memory of memories) {
    const source = memory.source || 'unknown';
    const tags = normalizeTags(memory.tags);
    const text = extractText(memory.content, memory.summary);

    signalCounts[source] = (signalCounts[source] || 0) + 1;

    for (const mapping of SIGNAL_MAPPINGS) {
      // Check if source matches
      if (mapping.source !== source) continue;

      // Check if tags match (if specified)
      if (mapping.tags?.length && !mapping.tags.some((t) => tags.includes(t))) {
        continue;
      }

      // Check content patterns (if specified)
      if (mapping.contentPatterns?.length) {
        const matches = mapping.contentPatterns.some((p) => p.test(text));
        if (!matches) continue;
      }

      // Apply trait weights
      for (const [trait, weight] of Object.entries(mapping.traitWeights)) {
        const traitKey = trait as TraitKey;
        traitAccumulators[traitKey] += weight;

        // Add evidence (limit per trait)
        if (traitEvidence[traitKey].length < 5) {
          const date = memory.createdAt.toISOString().slice(0, 10);
          const evidenceText = text.slice(0, 80) || mapping.description;
          traitEvidence[traitKey].push(`[${date}] ${evidenceText}`);
        }
      }
    }
  }

  // Calculate behavioral patterns
  const dates = memories.map((m) => m.createdAt);
  const uniqueDays = new Set(dates.map((d) => d.toISOString().slice(0, 10)));
  const dateRange = dates.length > 1
    ? (dates[0].getTime() - dates[dates.length - 1].getTime()) / (24 * 60 * 60 * 1000)
    : 1;

  // Completion rate: ratio of completed/shipped signals to created signals
  const createdSignals = (signalCounts['project.created'] || 0) + (signalCounts['page.created'] || 0);
  const completedSignals = signalCounts['project.updated'] || 0;
  const completionRate = createdSignals > 0 ? Math.min(1, completedSignals / createdSignals) : 0.5;

  // Consistency: how regularly they engage (unique days / date range)
  const consistencyScore = dateRange > 0 ? Math.min(1, uniqueDays.size / Math.max(dateRange, 1)) : 0;

  // Diversity: variety of sources used
  const uniqueSources = Object.keys(signalCounts).length;
  const diversityScore = Math.min(1, uniqueSources / 8);

  // Collaboration: ratio of communication signals
  const commSignals = (signalCounts['comment.created'] || 0) + (signalCounts['comment.updated'] || 0);
  const collaborationScore = memories.length > 0 ? Math.min(1, commSignals / (memories.length * 0.2)) : 0;

  // Apply pattern bonuses to trait scores
  traitAccumulators.execution += completionRate * 3;
  traitAccumulators.focus += consistencyScore * 2;
  traitAccumulators.resilience += consistencyScore * 2;
  traitAccumulators.creativity += diversityScore * 2;
  traitAccumulators.communication += collaborationScore * 3;

  // Normalize scores to 0-10 scale
  // Use logarithmic scaling to avoid ceiling effects
  const normalizeScore = (raw: number, maxExpected: number): number => {
    if (raw <= 0) return 0;
    // Log-based normalization with diminishing returns
    const normalized = (Math.log(1 + raw) / Math.log(1 + maxExpected)) * 10;
    return Math.min(10, Math.max(0, Math.round(normalized * 10) / 10));
  };

  const traitScores: Record<TraitKey, number> = {
    focus: normalizeScore(traitAccumulators.focus, 50),
    execution: normalizeScore(traitAccumulators.execution, 40),
    creativity: normalizeScore(traitAccumulators.creativity, 35),
    communication: normalizeScore(traitAccumulators.communication, 30),
    leadership: normalizeScore(traitAccumulators.leadership, 25),
    learning: normalizeScore(traitAccumulators.learning, 40),
    resilience: normalizeScore(traitAccumulators.resilience, 35),
  };

  return {
    traitScores,
    traitEvidence,
    signalCounts,
    patterns: {
      completionRate,
      avgSessionDuration: 0, // Would need session data
      consistencyScore,
      diversityScore,
      collaborationScore,
    },
  };
}

// =============================================================================
// Trend Analysis
// =============================================================================

interface TraitTrend {
  trait: TraitKey;
  current: number;
  previous: number;
  delta: number;
  trend: 'improving' | 'stable' | 'declining';
}

function calculateTrends(
  current: Record<TraitKey, number>,
  previous?: Record<string, number>,
): TraitTrend[] {
  return TRAIT_KEYS.map((trait) => {
    const currentScore = current[trait] || 0;
    const previousScore = previous?.[trait] || currentScore;
    const delta = currentScore - previousScore;
    let trend: 'improving' | 'stable' | 'declining' = 'stable';
    if (delta >= 0.5) trend = 'improving';
    if (delta <= -0.5) trend = 'declining';
    return { trait, current: currentScore, previous: previousScore, delta, trend };
  });
}

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
    return this.aiService.getSlowModel();
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

    // Build trait items with trend indicators
    const traitItems = Object.entries(profile.traits || {}).map(
      ([key, value]) => {
        const label = traitLabels[key as TraitKey] || key;
        const trend = profile.traitTrends?.find((t) => t.trait === key);
        let trendIndicator = '';
        if (trend) {
          if (trend.trend === 'improving') {
            trendIndicator = ` ↑ (+${trend.delta.toFixed(1)})`;
          } else if (trend.trend === 'declining') {
            trendIndicator = ` ↓ (${trend.delta.toFixed(1)})`;
          } else {
            trendIndicator = ' →';
          }
        }
        return `${label}: ${value}/10${trendIndicator}`;
      },
    );

    // Build patterns summary
    const patternItems = profile.patterns
      ? [
          `Completion rate: ${((profile.patterns.completionRate || 0) * 100).toFixed(0)}%`,
          `Consistency: ${((profile.patterns.consistencyScore || 0) * 100).toFixed(0)}%`,
          `Activity diversity: ${((profile.patterns.diversityScore || 0) * 100).toFixed(0)}%`,
          `Collaboration: ${((profile.patterns.collaborationScore || 0) * 100).toFixed(0)}%`,
        ]
      : [];
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
          content: [{ type: 'text', text: 'Behavioral Patterns' }],
        },
        buildList(patternItems.length ? patternItems : ['No pattern data yet.']),
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
    signalAnalysis: AnalyzedSignals,
    trends: TraitTrend[],
    priorProfile?: ProfileModel,
  ) {
    const prior = priorProfile ? JSON.stringify(priorProfile) : 'none';

    // Build trait definitions section
    const traitDefinitionsText = TRAIT_DEFINITIONS.map((def) => {
      const rubricText = def.rubric
        .map((r) => `  ${r.range[0]}-${r.range[1]}: ${r.description}`)
        .join('\n');
      return `${def.name} (${def.key}): ${def.description}\nRubric:\n${rubricText}`;
    }).join('\n\n');

    // Build signal-based scores section
    const signalScoresText = TRAIT_KEYS.map((key) => {
      const score = signalAnalysis.traitScores[key];
      const trend = trends.find((t) => t.trait === key);
      const trendText = trend ? ` (${trend.trend}, Δ${trend.delta >= 0 ? '+' : ''}${trend.delta.toFixed(1)})` : '';
      const evidence = signalAnalysis.traitEvidence[key].slice(0, 3).join('; ');
      return `${key}: ${score.toFixed(1)}/10${trendText}\n  Evidence: ${evidence || 'none'}`;
    }).join('\n');

    // Build patterns section
    const patternsText = [
      `Completion rate: ${(signalAnalysis.patterns.completionRate * 100).toFixed(0)}%`,
      `Consistency: ${(signalAnalysis.patterns.consistencyScore * 100).toFixed(0)}%`,
      `Diversity: ${(signalAnalysis.patterns.diversityScore * 100).toFixed(0)}%`,
      `Collaboration: ${(signalAnalysis.patterns.collaborationScore * 100).toFixed(0)}%`,
    ].join(', ');

    return [
      `You are Raven Docs' behavioral analyst. Create a refined user profile based on activity signals.`,
      ``,
      `## Your Task`,
      `Analyze the user's behavioral signals and generate a profile JSON. You must:`,
      `1. ADJUST the signal-based trait scores based on qualitative evidence (max ±2 points)`,
      `2. Identify strengths, challenges, and recommendations based on patterns`,
      `3. Extract preferences and goals from journal entries (if available)`,
      `4. Provide confidence levels based on evidence quality`,
      ``,
      `## Trait Definitions & Rubrics`,
      traitDefinitionsText,
      ``,
      `## Signal-Based Scores (Pre-calculated)`,
      `These scores are computed from behavioral signals. You may adjust by ±2 based on qualitative analysis:`,
      signalScoresText,
      ``,
      `## Behavioral Patterns`,
      patternsText,
      ``,
      `## Context`,
      `Space: ${spaceName}`,
      `Signal stats: total=${stats.signalCount}, journal=${stats.journalCount}, spanDays=${stats.signalSpanDays}, distinctDays=${stats.distinctDays}`,
      `Traits allowed: ${stats.allowTraits} (need ≥12 signals over ≥30 days with ≥10 active days)`,
      `Preferences allowed: ${stats.allowPreferences} (need ≥5 journal entries)`,
      ``,
      `## Previous Profile`,
      prior,
      ``,
      `## Activity Log (for qualitative analysis)`,
      generalLog || 'none',
      ``,
      `## Journal Entries (for preferences/goals)`,
      journalLog || 'none',
      ``,
      `## Output Format`,
      `Return ONLY valid JSON with this structure:`,
      `{`,
      `  "summary": "2-3 sentence profile summary",`,
      `  "traits": { "focus": 0-10, "execution": 0-10, ... },`,
      `  "strengths": ["strength 1", ...],`,
      `  "challenges": ["challenge 1", ...],`,
      `  "preferences": ["preference 1", ...],`,
      `  "constraints": ["constraint 1", ...],`,
      `  "goals": { "shortTerm": [...], "midTerm": [...], "longTerm": [...] },`,
      `  "risks": ["risk 1", ...],`,
      `  "focusAreas": ["area 1", ...],`,
      `  "recommendations": ["recommendation 1", ...],`,
      `  "confidence": { "summary": "low|medium|high", "traits": "...", "preferences": "...", "goals": "..." },`,
      `  "evidence": { "summary": [...], "traits": [...], "preferences": [...], "goals": [...] }`,
      `}`,
      ``,
      `If traits not allowed, use empty {} for traits. If preferences not allowed, use empty arrays.`,
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

    // Analyze signals using the new behavioral analysis system
    const signalAnalysis = analyzeSignals(memories);

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

    // Calculate trends from prior profile
    const trends = calculateTrends(
      signalAnalysis.traitScores,
      priorProfile?.traits,
    );

    let profile: ProfileModel = {};

    // Start with signal-based scores as foundation
    const signalBasedTraits: Record<string, number> = {};
    for (const key of TRAIT_KEYS) {
      signalBasedTraits[key] = Math.round(signalAnalysis.traitScores[key]);
    }

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
          signalAnalysis,
          trends,
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

        // Validate AI-adjusted traits are within ±2 of signal-based scores
        if (profile.traits && allowTraits) {
          for (const key of TRAIT_KEYS) {
            const signalScore = signalAnalysis.traitScores[key];
            const aiScore = profile.traits[key];
            if (typeof aiScore === 'number') {
              // Clamp AI adjustments to ±2 from signal-based score
              const minAllowed = Math.max(0, signalScore - 2);
              const maxAllowed = Math.min(10, signalScore + 2);
              profile.traits[key] = Math.round(
                Math.min(maxAllowed, Math.max(minAllowed, aiScore)),
              );
            }
          }
        }
      } catch (error: any) {
        this.logger.warn(
          `Profile generation failed for space ${space.id}: ${error?.message || String(error)}`,
        );
        // Fallback to signal-based profile when AI fails
        profile = {
          summary: 'Profile generated from behavioral signals.',
          traits: signalBasedTraits,
          strengths: [],
          challenges: [],
          preferences: [],
          constraints: [],
          goals: { shortTerm: [], midTerm: [], longTerm: [] },
          risks: [],
          focusAreas: [],
          recommendations: [],
          confidence: {
            summary: 'low',
            traits: allowTraits ? 'medium' : 'low',
            preferences: 'low',
            goals: 'low',
          },
          evidence: {
            summary: [],
            traits: signalAnalysis.traitEvidence.focus.slice(0, 3),
            preferences: [],
            goals: [],
          },
        };
      }
    } else {
      // No AI available - use pure signal-based profile
      profile = {
        summary: 'Profile generated from behavioral signals (AI unavailable).',
        traits: signalBasedTraits,
        strengths: [],
        challenges: [],
        preferences: [],
        constraints: [],
        goals: { shortTerm: [], midTerm: [], longTerm: [] },
        risks: [],
        focusAreas: [],
        recommendations: [],
        confidence: {
          summary: 'low',
          traits: allowTraits ? 'medium' : 'low',
          preferences: 'low',
          goals: 'low',
        },
        evidence: {
          summary: [],
          traits: Object.values(signalAnalysis.traitEvidence).flat().slice(0, 5),
          preferences: [],
          goals: [],
        },
      };
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

    // Add trends and patterns to normalized profile
    normalized.traitTrends = trends;
    normalized.patterns = signalAnalysis.patterns;

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
        signalStats: {
          totalSignals: memories.length,
          journalCount: journalMemories.length,
          spanDays,
          distinctDays,
          signalCounts: signalAnalysis.signalCounts,
        },
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
