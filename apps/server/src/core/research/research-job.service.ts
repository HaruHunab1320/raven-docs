import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@raven-docs/db/types/kysely.types';
import { CreateResearchJobDto } from './dto/research-job.dto';
import { QueueJob, QueueName } from '../../integrations/queue/constants';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DEFAULT_TIME_BUDGET_MINUTES, MAX_DOC_RESULTS, MAX_REPO_FILES, MAX_WEB_RESULTS } from './research.constants';
import { SearchService } from '../search/search.service';
import { RepoBrowseService } from '../../integrations/repo/repo-browse.service';
import { WebSearchService } from './web-search.service';
import { AgentMemoryService } from '../agent-memory/agent-memory.service';
import { AIService } from '../../integrations/ai/ai.service';
import { sql } from 'kysely';
import { PageRepo } from '@raven-docs/db/repos/page/page.repo';
import { PageService } from '../page/services/page.service';
import { WorkspaceRepo } from '@raven-docs/db/repos/workspace/workspace.repo';
import { SlackService } from '../../integrations/slack/slack.service';
import { DiscordService } from '../../integrations/discord/discord.service';

type ResearchJobRecord = {
  id: string;
  workspaceId: string;
  spaceId: string;
  topic: string;
  goal?: string | null;
  status: string;
  timeBudgetMinutes: number;
  outputMode: string;
  sources: any;
  repoTargets: any;
  reportPageId?: string | null;
  logPageId?: string | null;
  createdAt: Date;
  startedAt?: Date | null;
  completedAt?: Date | null;
};

type ResearchLogEntry = {
  timestamp: string;
  message: string;
};

const parseJson = <T>(value: any, fallback: T): T => {
  if (!value) return fallback;
  if (typeof value === 'object') return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const buildDocParagraphs = (text: string) =>
  text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => ({
      type: 'paragraph',
      content: [{ type: 'text', text: paragraph }],
    }));

const normalizeDocContent = (rawContent: any) => {
  if (!rawContent) {
    return { type: 'doc', content: [] as any[] };
  }
  if (typeof rawContent === 'object') {
    const doc = rawContent as { type?: string; content?: any[] };
    if (!Array.isArray(doc.content)) {
      doc.content = [];
    }
    if (!doc.type) {
      doc.type = 'doc';
    }
    return doc;
  }
  if (typeof rawContent === 'string') {
    try {
      const parsed = JSON.parse(rawContent);
      if (parsed && typeof parsed === 'object') {
        return normalizeDocContent(parsed);
      }
    } catch {
      // fall through to text handling
    }
    return {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: rawContent }],
        },
      ],
    };
  }
  return { type: 'doc', content: [] as any[] };
};

const buildReportSection = (topic: string, reportText: string) => ({
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: `Research Report: ${topic}` }],
    },
    ...buildDocParagraphs(reportText || 'No report generated.'),
  ],
});

@Injectable()
export class ResearchJobService {
  private readonly logger = new Logger(ResearchJobService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    @InjectQueue(QueueName.GENERAL_QUEUE) private readonly generalQueue: Queue,
    private readonly searchService: SearchService,
    private readonly repoBrowse: RepoBrowseService,
    private readonly webSearch: WebSearchService,
    private readonly pageRepo: PageRepo,
    private readonly pageService: PageService,
    private readonly workspaceRepo: WorkspaceRepo,
    private readonly memoryService: AgentMemoryService,
    private readonly aiService: AIService,
    @Inject(forwardRef(() => SlackService))
    private readonly slackService: SlackService,
    @Inject(forwardRef(() => DiscordService))
    private readonly discordService: DiscordService,
  ) {}

  async createJob(input: CreateResearchJobDto, userId: string, workspaceId: string) {
    const job = await this.db
      .insertInto('researchJobs')
      .values({
        workspaceId,
        spaceId: input.spaceId,
        creatorId: userId,
        topic: input.topic,
        goal: input.goal || null,
        status: 'queued',
        timeBudgetMinutes: input.timeBudgetMinutes || DEFAULT_TIME_BUDGET_MINUTES,
        outputMode: input.outputMode || 'longform',
        sources: input.sources ? sql`${JSON.stringify(input.sources)}::jsonb` : null,
        repoTargets: input.repoTargets
          ? (sql`${JSON.stringify(input.repoTargets)}::jsonb` as any)
          : null,
        reportPageId: input.reportPageId || null,
      })
      .returning([
        'id',
        'workspaceId',
        'spaceId',
        'topic',
        'goal',
        'status',
        'timeBudgetMinutes',
        'outputMode',
        'sources',
        'repoTargets',
        'createdAt',
      ])
      .executeTakeFirst();

    if (!job) {
      throw new Error('Failed to create research job');
    }

    await this.generalQueue.add(QueueJob.RESEARCH_JOB, { jobId: job.id });

    await this.slackService.notifyResearchStatus(
      workspaceId,
      `Research queued: ${job.topic}`,
    );
    await this.discordService.notifyResearchStatus(
      workspaceId,
      `Research queued: ${job.topic}`,
    );
    return job;
  }

  async listJobs(spaceId: string, workspaceId: string) {
    return this.db
      .selectFrom('researchJobs')
      .select([
        'id',
        'topic',
        'goal',
        'status',
        'timeBudgetMinutes',
        'outputMode',
        'createdAt',
        'startedAt',
        'completedAt',
        'reportPageId',
        'logPageId',
      ])
      .where('workspaceId', '=', workspaceId)
      .where('spaceId', '=', spaceId)
      .orderBy('createdAt', 'desc')
      .execute();
  }

  async getJob(jobId: string, workspaceId: string) {
    return this.db
      .selectFrom('researchJobs')
      .selectAll()
      .where('id', '=', jobId)
      .where('workspaceId', '=', workspaceId)
      .executeTakeFirst();
  }

  async runJob(jobId: string) {
    const job = await this.db
      .selectFrom('researchJobs')
      .selectAll()
      .where('id', '=', jobId)
      .executeTakeFirst();

    if (!job) {
      this.logger.warn(`Research job ${jobId} not found`);
      return;
    }

    if (job.status === 'running') {
      this.logger.warn(`Research job ${jobId} already running`);
      return;
    }

    if (!job.creatorId) {
      this.logger.warn(`Research job ${jobId} has no creatorId`);
      await this.db
        .updateTable('researchJobs')
        .set({
          status: 'failed',
          updatedAt: new Date(),
        })
        .where('id', '=', jobId)
        .execute();
      return;
    }

    const logEntries: ResearchLogEntry[] = [];
    const log = (message: string) => {
      logEntries.push({
        timestamp: new Date().toISOString(),
        message,
      });
    };

    try {
      const sources = parseJson(job.sources, {
        docs: true,
        web: true,
        repo: true,
      });

      log('Research job started.');
      await this.db
        .updateTable('researchJobs')
        .set({
          status: 'running',
          startedAt: new Date(),
          updatedAt: new Date(),
        })
        .where('id', '=', jobId)
        .execute();

      await this.slackService.notifyResearchStatus(
        job.workspaceId,
        `Research started: ${job.topic}`,
      );
      await this.discordService.notifyResearchStatus(
        job.workspaceId,
        `Research started: ${job.topic}`,
      );

      const appendToExisting = !!job.reportPageId;
      let researchProjectPageId: string | null = null;
      let reportPageId = job.reportPageId || null;
      let logPageId = job.logPageId || null;

      if (!appendToExisting) {
        researchProjectPageId = await this.getOrCreateResearchProjectPage(
          job as ResearchJobRecord,
          job.creatorId,
        );
        reportPageId =
          reportPageId ||
          (await this.createReportPage(
            job as ResearchJobRecord,
            job.creatorId,
            researchProjectPageId,
          ));
        logPageId =
          logPageId ||
          (await this.createLogPage(
            job as ResearchJobRecord,
            job.creatorId,
            researchProjectPageId,
          ));
      } else {
        const logParentId = await this.getOrCreateResearchRootPage(
          job as ResearchJobRecord,
          job.creatorId,
        );
        logPageId =
          logPageId ||
          (await this.createLogPage(
            job as ResearchJobRecord,
            job.creatorId,
            logParentId,
          ));
      }

      await this.db
        .updateTable('researchJobs')
        .set({
          logPageId,
          reportPageId,
        })
        .where('id', '=', jobId)
        .execute();

      const docSources: Array<{ title: string; excerpt: string }> = [];
      if (sources.docs) {
        log('Collecting internal documents.');
        const results = await this.searchService.searchPage(job.topic, {
          query: job.topic,
          spaceId: job.spaceId,
          limit: MAX_DOC_RESULTS,
        });
        if (results.length) {
          const pageIds = results.map((result) => result.id);
          const pages = await this.db
            .selectFrom('pages')
            .select(['id', 'title', 'textContent'])
            .where('id', 'in', pageIds)
            .execute();
          const pageMap = new Map(pages.map((page) => [page.id, page]));
          results.forEach((result) => {
            const page = pageMap.get(result.id);
            const excerpt = page?.textContent || result.highlight || '';
            if (excerpt) {
              docSources.push({
                title: page?.title || result.title || 'Untitled',
                excerpt: excerpt.slice(0, 1200),
              });
            }
          });
        }
        log(`Found ${docSources.length} relevant docs.`);
      }

      const webSources: Array<{
        title: string;
        url: string;
        snippet: string;
      }> = [];
      if (sources.web) {
        try {
          log('Searching the web.');
          const results = await this.webSearch.search(
            job.topic,
            MAX_WEB_RESULTS,
          );
          for (const result of results) {
            const snippet = result.snippet || '';
            webSources.push({
              title: result.title,
              url: result.url,
              snippet,
            });
          }
          log(`Collected ${webSources.length} web results.`);
        } catch (error: any) {
          log(`Web search failed: ${error?.message || 'unknown error'}`);
        }
      }

      const repoTargets = parseJson(job.repoTargets, []);
      const workspace = await this.workspaceRepo.findById(job.workspaceId);
      const integrationSettings = (workspace?.settings as any)?.integrations;
      const repoTokens = {
        github:
          integrationSettings?.repoTokens?.githubToken ||
          process.env.GITHUB_TOKEN ||
          process.env.GITHUB_API_TOKEN,
        gitlab:
          integrationSettings?.repoTokens?.gitlabToken ||
          process.env.GITLAB_TOKEN,
        bitbucket:
          integrationSettings?.repoTokens?.bitbucketToken ||
          process.env.BITBUCKET_TOKEN,
      };
      const repoFindings: Array<{ repo: string; notes: string }> = [];
      if (sources.repo && Array.isArray(repoTargets) && repoTargets.length) {
        log('Exploring repository targets.');
        for (const target of repoTargets.slice(0, 3)) {
          try {
            const tree = await this.repoBrowse.listTree({
              host: target.host,
              owner: target.owner,
              repo: target.repo,
              ref: target.ref,
              path: '',
              tokens: repoTokens,
            });
            const files = tree.entries
              .filter((entry) => entry.type === 'file')
              .slice(0, MAX_REPO_FILES);
            const snippets: string[] = [];
            for (const file of files) {
              const content = await this.repoBrowse.readFile({
                host: target.host,
                owner: target.owner,
                repo: target.repo,
                ref: target.ref,
                path: file.path,
                maxBytes: 4000,
                tokens: repoTokens,
              });
              snippets.push(`${file.path}:\n${content.content}`);
            }
            repoFindings.push({
              repo: `${target.owner}/${target.repo}`,
              notes: snippets.join('\n\n').slice(0, 8000),
            });
          } catch (error: any) {
            log(`Repo fetch failed for ${target?.owner}/${target?.repo}`);
          }
        }
      }

      const reportPrompt = [
        `You are Raven Docs' research agent.`,
        `Topic: ${job.topic}`,
        job.goal ? `Goal: ${job.goal}` : null,
        `Time budget: ${job.timeBudgetMinutes} minutes.`,
        `Produce a ${job.outputMode === 'brief' ? 'brief' : 'long-form'} report.`,
        `Include: Summary, Findings, Evidence, Open Questions, Next Steps.`,
        docSources.length
          ? `Internal docs:\n${docSources
              .map((doc) => `- ${doc.title}: ${doc.excerpt}`)
              .join('\n')}`
          : 'Internal docs: none',
        webSources.length
          ? `Web sources:\n${webSources
              .map(
                (source) => `- ${source.title} (${source.url}): ${source.snippet}`,
              )
              .join('\n')}`
          : 'Web sources: none',
        repoFindings.length
          ? `Repo notes:\n${repoFindings
              .map((repo) => `- ${repo.repo}\n${repo.notes}`)
              .join('\n')}`
          : 'Repo notes: none',
      ]
        .filter(Boolean)
        .join('\n\n');

      log('Generating report.');
      let reportText = '';
      try {
        const response = await this.aiService.generateContent({
          model: process.env.GEMINI_AGENT_MODEL || 'gemini-3-pro-preview',
          contents: [{ role: 'user', parts: [{ text: reportPrompt }] }],
        });
        reportText =
          response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      } catch (error: any) {
        reportText = `Report generation failed: ${error?.message || 'unknown error'}`;
      }

      const reportDoc = buildReportSection(job.topic, reportText);
      if (appendToExisting) {
        const page = await this.pageRepo.findById(reportPageId, {
          includeContent: true,
        });
        const normalized = normalizeDocContent(page?.content);
        normalized.content = [...normalized.content, ...reportDoc.content];
        await this.pageRepo.updatePage(
          {
            content: JSON.stringify(normalized),
          },
          reportPageId,
        );
      } else {
        await this.pageRepo.updatePage(
          {
            content: JSON.stringify(reportDoc),
          },
          reportPageId,
        );
      }

      await this.pageRepo.updatePage(
        {
          content: JSON.stringify({
            type: 'doc',
            content: [
              {
                type: 'heading',
                attrs: { level: 2 },
                content: [{ type: 'text', text: 'Research Log' }],
              },
              ...logEntries.map((entry) => ({
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: `${entry.timestamp} - ${entry.message}`,
                  },
                ],
              })),
            ],
          }),
        },
        logPageId,
      );

      await this.memoryService.ingestMemory({
        workspaceId: job.workspaceId,
        spaceId: job.spaceId,
        source: 'research-job',
        summary: `Research completed: ${job.topic}`,
        content: {
          text: reportText,
          jobId: job.id,
          topic: job.topic,
          reportPageId,
          logPageId,
          projectPageId: researchProjectPageId || undefined,
        },
        tags: [
          'research',
          'report',
          researchProjectPageId ? 'research-project' : undefined,
          `research:${job.id}`,
          reportPageId ? `page:${reportPageId}` : undefined,
          researchProjectPageId ? `page:${researchProjectPageId}` : undefined,
        ].filter(Boolean) as string[],
      });

      await this.db
        .updateTable('researchJobs')
        .set({
          status: 'completed',
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where('id', '=', jobId)
        .execute();

      await this.slackService.notifyResearchStatus(
        job.workspaceId,
        `Research complete: ${job.topic}`,
      );
      await this.discordService.notifyResearchStatus(
        job.workspaceId,
        `Research complete: ${job.topic}`,
      );
    } catch (error: any) {
      this.logger.error(
        `Research job ${jobId} failed: ${error?.message || 'unknown error'}`,
        error?.stack,
      );
      await this.db
        .updateTable('researchJobs')
        .set({
          status: 'failed',
          updatedAt: new Date(),
        })
        .where('id', '=', jobId)
        .execute();
    }
  }

  private async createLogPage(
    job: ResearchJobRecord,
    userId: string,
    parentPageId: string,
  ): Promise<string> {
    const title = `Research Log ${job.topic}`.slice(0, 80);
    const page = await this.pageService.create(userId, job.workspaceId, {
      title,
      spaceId: job.spaceId,
      parentPageId,
      content: JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: 'Research Log' }],
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: `Topic: ${job.topic}`,
              },
            ],
          },
        ],
      }),
    });
    return page.id;
  }

  private async getOrCreateResearchRootPage(
    job: ResearchJobRecord,
    userId: string,
  ): Promise<string> {
    const existing = await this.db
      .selectFrom('pages')
      .select(['id'])
      .where('spaceId', '=', job.spaceId)
      .where('workspaceId', '=', job.workspaceId)
      .where('parentPageId', 'is', null)
      .where('title', '=', 'Research')
      .where('deletedAt', 'is', null)
      .executeTakeFirst();

    if (existing?.id) {
      return existing.id;
    }

    const page = await this.pageService.create(userId, job.workspaceId, {
      title: 'Research',
      spaceId: job.spaceId,
      content: JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: 'Research' }],
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Auto-generated space for research reports.',
              },
            ],
          },
        ],
      }),
    });

    return page.id;
  }

  private async getOrCreateResearchProjectsRootPage(
    job: ResearchJobRecord,
    userId: string,
  ): Promise<string> {
    const researchRootId = await this.getOrCreateResearchRootPage(job, userId);
    const existing = await this.db
      .selectFrom('pages')
      .select(['id'])
      .where('workspaceId', '=', job.workspaceId)
      .where('spaceId', '=', job.spaceId)
      .where('parentPageId', '=', researchRootId)
      .where('title', '=', 'Research Projects')
      .where('deletedAt', 'is', null)
      .executeTakeFirst();

    if (existing?.id) return existing.id;

    const page = await this.pageService.create(userId, job.workspaceId, {
      title: 'Research Projects',
      spaceId: job.spaceId,
      parentPageId: researchRootId,
      content: JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: 'Research Projects' }],
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Auto-generated folders for research jobs.',
              },
            ],
          },
        ],
      }),
    });

    return page.id;
  }

  private async getOrCreateResearchProjectPage(
    job: ResearchJobRecord,
    userId: string,
  ): Promise<string> {
    const parentPageId = await this.getOrCreateResearchProjectsRootPage(
      job,
      userId,
    );
    const title = `Research: ${job.topic}`.slice(0, 80);
    const existing = await this.db
      .selectFrom('pages')
      .select(['id'])
      .where('workspaceId', '=', job.workspaceId)
      .where('spaceId', '=', job.spaceId)
      .where('parentPageId', '=', parentPageId)
      .where('title', '=', title)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();

    if (existing?.id) return existing.id;

    const page = await this.pageService.create(userId, job.workspaceId, {
      title,
      spaceId: job.spaceId,
      parentPageId,
      content: JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: title }],
          },
        ],
      }),
    });

    return page.id;
  }

  private async createReportPage(
    job: ResearchJobRecord,
    userId: string,
    parentPageId: string,
  ): Promise<string> {
    const title = `Research Report`.slice(0, 80);
    const page = await this.pageService.create(userId, job.workspaceId, {
      title,
      spaceId: job.spaceId,
      parentPageId,
      content: JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: `Research: ${job.topic}` }],
          },
        ],
      }),
    });
    return page.id;
  }
}
