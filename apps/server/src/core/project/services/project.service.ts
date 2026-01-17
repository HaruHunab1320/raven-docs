import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ProjectRepo } from '../../../database/repos/project/project.repo';
import { SpaceRepo } from '../../../database/repos/space/space.repo';
import { WorkspaceRepo } from '@raven-docs/db/repos/workspace/workspace.repo';
import {
  ProjectView,
  InsertableProject,
  Project,
  UpdatableProject,
} from '../../../database/types/entity.types';
import { PaginationOptions } from '../../../lib/pagination/pagination-options';
import { Paginated } from '../../../lib/pagination/paginated';
import { PageService } from '../../page/services/page.service';
import { executeTx } from '@raven-docs/db/utils';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@raven-docs/db/types/kysely.types';
import { AgentMemoryService } from '../../agent-memory/agent-memory.service';
import { TaskService } from './task.service';
import { AIService } from '../../../integrations/ai/ai.service';
import { resolveAgentSettings } from '../../agent/agent-settings';

@Injectable()
export class ProjectService {
  private normalizeTitle(value?: string | null) {
    return (value || '')
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private extractJson(text: string) {
    const trimmed = text.trim();
    if (trimmed.startsWith('{')) {
      return trimmed;
    }
    const match = trimmed.match(/\{[\s\S]*\}/);
    return match ? match[0] : '';
  }

  private buildPlaybookDraftContent(summary: string, bullets: string[]) {
    const safeBullets =
      bullets && bullets.length > 0
        ? bullets
        : ['Add key points and next steps.'];
    return JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: summary }],
        },
        {
          type: 'bulletList',
          content: safeBullets.map((text) => ({
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text }],
              },
            ],
          })),
        },
      ],
    });
  }
  private getMemoryText(memory: any): string {
    if (!memory) return '';
    if (typeof memory.content?.text === 'string') return memory.content.text;
    if (typeof memory.summary === 'string') return memory.summary;
    if (typeof memory.content === 'string') return memory.content;
    return '';
  }

  private buildChatTranscript(memories: any[]): string {
    if (!memories?.length) return '';
    const ordered = [...memories].sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
    return ordered
      .map((memory) => {
        const tags = memory?.tags || [];
        const role = tags.includes('assistant')
          ? 'Assistant'
          : tags.includes('user')
            ? 'User'
            : 'Note';
        const text = this.getMemoryText(memory);
        return text ? `${role}: ${text}` : '';
      })
      .filter(Boolean)
      .join('\n');
  }

  private async getChatDraftLimit(workspaceId: string) {
    const workspace = await this.workspaceRepo.findById(workspaceId);
    const settings = resolveAgentSettings(workspace?.settings);
    const limit = settings.chatDraftLimit || 300;
    return Math.min(Math.max(limit, 50), 2000);
  }

  private async getChatMemoriesForDraft(
    project: Project,
    chatPageId: string,
    sessionId?: string,
  ) {
    const chatTag = `agent-chat-page:${chatPageId}`;
    const limit = await this.getChatDraftLimit(project.workspaceId);
    if (sessionId) {
      const sessionTag = `agent-chat-session:${sessionId}`;
      const sessionMemories = await this.agentMemoryService.queryMemories(
        {
          workspaceId: project.workspaceId,
          spaceId: project.spaceId,
          tags: [sessionTag],
          sources: ['agent-chat'],
          limit,
        },
        undefined,
      );

      return sessionMemories.sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );
    }

    const recentLimit = Math.min(limit, Math.max(30, Math.round(limit * 0.6)));
    const relevantLimit = Math.max(limit - recentLimit, 0);
    const queryText = [project.name, project.description]
      .filter(Boolean)
      .join(' ');

    const recentMemories = await this.agentMemoryService.queryMemories(
      {
        workspaceId: project.workspaceId,
        spaceId: project.spaceId,
        tags: [chatTag],
        sources: ['agent-chat'],
        limit: recentLimit,
      },
      undefined,
    );

    const relevantMemories =
      relevantLimit > 0 && queryText
        ? await this.agentMemoryService.queryMemories(
            {
              workspaceId: project.workspaceId,
              spaceId: project.spaceId,
              tags: [chatTag],
              sources: ['agent-chat'],
              limit: relevantLimit,
            },
            queryText,
          )
        : [];

    const combined = new Map<string, any>();
    for (const memory of recentMemories) {
      combined.set(memory.id, memory);
    }
    for (const memory of relevantMemories) {
      combined.set(memory.id, memory);
    }

    return Array.from(combined.values()).sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
  }
  private buildPlaybookPageContent(summary: string, bullets: string[]) {
    return JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: summary }],
        },
        {
          type: 'bulletList',
          content: bullets.map((text) => ({
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text }],
              },
            ],
          })),
        },
      ],
    });
  }

  private async createPlaybookPages(
    userId: string,
    workspaceId: string,
    project: Project,
    parentPageId: string,
    trx?: any,
  ) {
    const playbookRoot = await this.pageService.create(
      userId,
      workspaceId,
      {
        title: `${project.name} Playbook`,
        spaceId: project.spaceId,
        parentPageId,
        content: JSON.stringify({
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'Use the pages below to capture scope, architecture, risks, and delivery planning.',
                },
              ],
            },
          ],
        }),
      },
      trx,
    );

    const templates = [
      {
        title: 'Project Brief',
        summary: 'Problem statement, success criteria, and constraints.',
        bullets: ['Problem', 'Success criteria', 'Stakeholders', 'Constraints'],
      },
      {
        title: 'Architecture',
        summary: 'System design, data flows, integrations, and NFRs.',
        bullets: ['System diagram', 'Data model', 'Integrations', 'Non-functional requirements'],
      },
      {
        title: 'Delivery Plan',
        summary: 'Phases, milestones, and schedule assumptions.',
        bullets: ['Phases', 'Milestones', 'Dependencies', 'Timeline'],
      },
      {
        title: 'Backlog',
        summary: 'Epics, stories, and prioritized tasks.',
        bullets: ['Epics', 'Stories', 'Definition of done', 'Definition of ready'],
      },
      {
        title: 'Risks & Assumptions',
        summary: 'Unknowns, blockers, and mitigation steps.',
        bullets: ['Risks', 'Assumptions', 'Mitigations', 'Open questions'],
      },
    ];

    for (const template of templates) {
      await this.pageService.create(
        userId,
        workspaceId,
        {
          title: template.title,
          spaceId: project.spaceId,
          parentPageId: playbookRoot.id,
          content: this.buildPlaybookPageContent(
            template.summary,
            template.bullets,
          ),
        },
        trx,
      );
    }

    return playbookRoot.id;
  }
  private buildProjectOverviewContent(project: Project) {
    return JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Summary, goals, and current status for this project.',
            },
          ],
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Goals' }],
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Add primary goals here.' }],
                },
              ],
            },
          ],
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Key Tasks' }],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Link or reference the most important tasks.',
            },
          ],
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Timeline' }],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Start date, target date, and milestones.',
            },
          ],
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Notes' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Add notes, updates, and decisions.' }],
        },
      ],
    });
  }

  constructor(
    private readonly projectRepo: ProjectRepo,
    private readonly spaceRepo: SpaceRepo,
    private readonly pageService: PageService,
    @InjectKysely() private readonly db: KyselyDB,
    private readonly agentMemoryService: AgentMemoryService,
    private readonly taskService: TaskService,
    private readonly aiService: AIService,
    private readonly workspaceRepo: WorkspaceRepo,
  ) {}

  async findById(
    projectId: string,
    options?: {
      includeCreator?: boolean;
      includeDeleted?: boolean;
    },
  ): Promise<Project | undefined> {
    return this.projectRepo.findById(projectId, options);
  }

  async findBySpaceId(
    spaceId: string,
    pagination: PaginationOptions,
    options?: {
      includeArchived?: boolean;
      includeCreator?: boolean;
      searchTerm?: string;
    },
  ): Promise<Paginated<Project>> {
    return this.projectRepo.findBySpaceId(spaceId, pagination, options);
  }

  async findByWorkspaceId(
    workspaceId: string,
    pagination: PaginationOptions,
    options?: {
      includeArchived?: boolean;
      includeCreator?: boolean;
      searchTerm?: string;
    },
  ): Promise<Paginated<Project>> {
    return this.projectRepo.findByWorkspaceId(workspaceId, pagination, options);
  }

  async create(
    userId: string,
    workspaceId: string,
    data: {
      name: string;
      description?: string;
      spaceId: string;
      icon?: string;
      color?: string;
      startDate?: Date;
      endDate?: Date;
    },
  ): Promise<Project> {
    console.log('ProjectService.create called with:', {
      userId,
      workspaceId,
      data,
    });

    // Verify the space exists and belongs to the workspace
    const space = await this.spaceRepo.findById(data.spaceId, workspaceId);
    if (!space || space.workspaceId !== workspaceId) {
      throw new Error('Space not found or does not belong to the workspace');
    }

    console.log('Space found:', {
      id: space.id,
      name: space.name,
      workspaceId: space.workspaceId,
    });

    const projectData: InsertableProject = {
      name: data.name,
      description: data.description,
      spaceId: data.spaceId,
      workspaceId,
      creatorId: userId,
      icon: data.icon,
      color: data.color,
      startDate: data.startDate,
      endDate: data.endDate,
      isArchived: false,
    };

    console.log(
      'Creating project with data:',
      JSON.stringify(projectData, null, 2),
    );

    const result = await executeTx(this.db, async (trx) => {
      const project = await this.projectRepo.create(projectData, trx);
      const overviewContent = this.buildProjectOverviewContent(project);
      const projectPage = await this.pageService.create(
        userId,
        workspaceId,
        {
          title: `${project.name} Overview`,
          icon: project.icon,
          spaceId: project.spaceId,
          content: overviewContent,
        },
        trx,
      );
      const updatedProject = await this.projectRepo.update(
        project.id,
        { homePageId: projectPage.id },
        trx,
      );

      return updatedProject ?? project;
    });

    try {
      await this.agentMemoryService.ingestMemory({
        workspaceId,
        spaceId: result.spaceId,
        creatorId: userId,
        source: 'project.created',
        summary: `Project created: ${result.name}`,
        tags: ['project', 'created'],
        content: {
          action: 'created',
          projectId: result.id,
          name: result.name,
          spaceId: result.spaceId,
        },
      });
    } catch {
      // Memory ingestion should not block project creation.
    }

    console.log('Project created result:', JSON.stringify(result, null, 2));
    return result;
  }

  async createProjectPage(
    userId: string,
    workspaceId: string,
    projectId: string,
  ): Promise<Project | undefined> {
    const project = await this.projectRepo.findById(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    if (project.homePageId) {
      return project;
    }

    return executeTx(this.db, async (trx) => {
      const overviewContent = this.buildProjectOverviewContent(project);
      const projectPage = await this.pageService.create(
        userId,
        workspaceId,
        {
          title: `${project.name} Overview`,
          icon: project.icon,
          spaceId: project.spaceId,
          content: overviewContent,
        },
        trx,
      );

      return this.projectRepo.update(
        project.id,
        { homePageId: projectPage.id },
        trx,
      );
    });
  }

  async update(
    projectId: string,
    data: {
      name?: string;
      description?: string;
      icon?: string;
      color?: string;
      coverImage?: string | null;
      startDate?: Date;
      endDate?: Date;
    },
  ): Promise<Project | undefined> {
    console.log('ProjectService.update called with:', { projectId, data });
    const updateData: UpdatableProject = {
      ...(data.name && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.icon !== undefined && { icon: data.icon }),
      ...(data.color !== undefined && { color: data.color }),
      ...(data.coverImage !== undefined && { coverImage: data.coverImage }),
      ...(data.startDate !== undefined && { startDate: data.startDate }),
      ...(data.endDate !== undefined && { endDate: data.endDate }),
    };
    console.log('ProjectService.update: prepared updateData:', updateData);

    try {
      const result = await this.projectRepo.update(projectId, updateData);
      console.log('ProjectService.update: result:', result);

      if (result) {
        try {
          await this.agentMemoryService.ingestMemory({
            workspaceId: result.workspaceId,
            spaceId: result.spaceId,
            creatorId: result.creatorId || undefined,
            source: 'project.updated',
            summary: `Project updated: ${result.name}`,
            tags: ['project', 'updated'],
            content: {
              action: 'updated',
              projectId: result.id,
              name: result.name,
              spaceId: result.spaceId,
            },
          });
        } catch {
          // Memory ingestion should not block project updates.
        }
      }

      return result;
    } catch (error) {
      console.error('ProjectService.update: error:', error);
      throw error;
    }
  }

  async delete(projectId: string, deletedById?: string): Promise<void> {
    const project = await this.projectRepo.findById(projectId);
    await this.projectRepo.softDelete(projectId);

    if (project) {
      if (project.homePageId) {
        try {
          await this.pageService.softDeleteTree(
            project.homePageId,
            deletedById,
          );
        } catch (error) {
          console.error(
            'ProjectService.delete: failed to delete project pages:',
            error,
          );
        }
      }

      try {
        await this.agentMemoryService.ingestMemory({
          workspaceId: project.workspaceId,
          spaceId: project.spaceId,
          creatorId: project.creatorId || undefined,
          source: 'project.deleted',
          summary: `Project deleted: ${project.name}`,
          tags: ['project', 'deleted'],
          content: {
            action: 'deleted',
            projectId: project.id,
            name: project.name,
            spaceId: project.spaceId,
          },
        });
      } catch {
        // Memory ingestion should not block project deletes.
      }
    }
  }

  async archive(projectId: string): Promise<Project | undefined> {
    const project = await this.projectRepo.archive(projectId);
    if (project) {
      try {
        await this.agentMemoryService.ingestMemory({
          workspaceId: project.workspaceId,
          spaceId: project.spaceId,
          creatorId: project.creatorId || undefined,
          source: 'project.archived',
          summary: `Project archived: ${project.name}`,
          tags: ['project', 'archived'],
          content: {
            action: 'archived',
            projectId: project.id,
            name: project.name,
            spaceId: project.spaceId,
          },
        });
      } catch {
        // Memory ingestion should not block project archive.
      }
    }
    return project;
  }

  async unarchive(projectId: string): Promise<Project | undefined> {
    const project = await this.projectRepo.unarchive(projectId);
    if (project) {
      try {
        await this.agentMemoryService.ingestMemory({
          workspaceId: project.workspaceId,
          spaceId: project.spaceId,
          creatorId: project.creatorId || undefined,
          source: 'project.unarchived',
          summary: `Project unarchived: ${project.name}`,
          tags: ['project', 'unarchived'],
          content: {
            action: 'unarchived',
            projectId: project.id,
            name: project.name,
            spaceId: project.spaceId,
          },
        });
      } catch {
        // Memory ingestion should not block project unarchive.
      }
    }
    return project;
  }

  async listDeleted(spaceId: string): Promise<Project[]> {
    return this.projectRepo.findDeletedBySpaceId(spaceId);
  }

  async restore(projectId: string, restoredById?: string): Promise<Project | undefined> {
    const project = await this.projectRepo.restore(projectId);
    if (!project) {
      return undefined;
    }

    if (project.homePageId) {
      try {
        await this.pageService.restoreTree(project.homePageId, restoredById);
      } catch (error) {
        console.error(
          'ProjectService.restore: failed to restore project pages:',
          error,
        );
      }
    }

    try {
      await this.agentMemoryService.ingestMemory({
        workspaceId: project.workspaceId,
        spaceId: project.spaceId,
        creatorId: restoredById,
        source: 'project.restored',
        summary: `Project restored: ${project.name}`,
        tags: ['project', 'restored'],
        content: {
          action: 'restored',
          projectId: project.id,
          name: project.name,
          spaceId: project.spaceId,
        },
      });
    } catch {
      // Memory ingestion should not block project restores.
    }

    return project;
  }

  async generatePlaybookDraft(
    projectId: string,
    brief: string,
    userId: string,
  ): Promise<{ updated: string[] }> {
    const project = await this.projectRepo.findById(projectId);
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    if (!project.homePageId) {
      throw new BadRequestException('Project does not have a home page');
    }

    const pages = await this.pageService.getPageTree(project.homePageId);
    const targets = new Map<string, string>();
    const wanted = new Map([
      ['project brief', 'projectBrief'],
      ['architecture', 'architecture'],
      ['delivery plan', 'deliveryPlan'],
      ['backlog', 'backlog'],
      ['risks and assumptions', 'risks'],
      ['risks assumptions', 'risks'],
    ]);

    for (const page of pages) {
      const key = this.normalizeTitle(page.title);
      if (wanted.has(key)) {
        targets.set(wanted.get(key) as string, page.id);
      }
    }

    if (targets.size === 0) {
      throw new BadRequestException('Playbook pages not found');
    }

    const model =
      process.env.GEMINI_PLAYBOOK_MODEL ||
      process.env.GEMINI_DEFAULT_MODEL ||
      'gemini-3-pro-preview';

    const prompt = [
      `You are generating a project playbook draft for Raven Docs.`,
      `Project: ${project.name}`,
      `Brief: ${brief}`,
      `Return ONLY valid JSON with keys:`,
      `projectBrief, architecture, deliveryPlan, backlog, risks.`,
      `Each key must contain: { "summary": string, "bullets": string[] }.`,
      `Keep summaries concise and bullets action-oriented (3-6 each).`,
    ].join('\n');

    const response = await this.aiService.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2 },
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'object',
        properties: {
          projectBrief: {
            type: 'object',
            properties: {
              summary: { type: 'string' },
              bullets: { type: 'array', items: { type: 'string' } },
            },
            required: ['summary', 'bullets'],
          },
          architecture: {
            type: 'object',
            properties: {
              summary: { type: 'string' },
              bullets: { type: 'array', items: { type: 'string' } },
            },
            required: ['summary', 'bullets'],
          },
          deliveryPlan: {
            type: 'object',
            properties: {
              summary: { type: 'string' },
              bullets: { type: 'array', items: { type: 'string' } },
            },
            required: ['summary', 'bullets'],
          },
          backlog: {
            type: 'object',
            properties: {
              summary: { type: 'string' },
              bullets: { type: 'array', items: { type: 'string' } },
            },
            required: ['summary', 'bullets'],
          },
          risks: {
            type: 'object',
            properties: {
              summary: { type: 'string' },
              bullets: { type: 'array', items: { type: 'string' } },
            },
            required: ['summary', 'bullets'],
          },
        },
        required: [
          'projectBrief',
          'architecture',
          'deliveryPlan',
          'backlog',
          'risks',
        ],
      },
    });

    const rawText =
      response?.candidates?.[0]?.content?.parts?.[0]?.text ||
      response?.candidates?.[0]?.content?.parts
        ?.map((part) => part.text)
        .join('') ||
      '';
    const jsonText = this.extractJson(rawText);
    if (!jsonText) {
      throw new BadRequestException('Playbook draft response was empty');
    }

    let draft: Record<string, { summary?: string; bullets?: string[] }>;
    try {
      draft = JSON.parse(jsonText);
    } catch {
      throw new BadRequestException(
        'Playbook draft response was not valid JSON',
      );
    }

    const updated: string[] = [];
    const apply = async (key: string, fallbackSummary: string) => {
      const pageId = targets.get(key);
      if (!pageId) return;
      const entry = draft[key] || {};
      const summary =
        entry.summary?.trim() ||
        fallbackSummary;
      const bullets =
        (entry.bullets || []).filter((item) => typeof item === 'string');
      const content = this.buildPlaybookDraftContent(summary, bullets);
      await this.pageService.updateContent(pageId, content, userId);
      updated.push(key);
    };

    await apply(
      'projectBrief',
      'Clarify the problem, success criteria, stakeholders, and constraints.',
    );
    await apply(
      'architecture',
      'Outline the system design, data flows, integrations, and non-functional requirements.',
    );
    await apply(
      'deliveryPlan',
      'Define phases, milestones, dependencies, and timing assumptions.',
    );
    await apply(
      'backlog',
      'List epics, stories, and the highest-priority tasks.',
    );
    await apply(
      'risks',
      'Capture key risks, assumptions, and mitigation plans.',
    );

    return { updated };
  }

  async generatePlaybookDraftFromChat(
    projectId: string,
    pageId: string | undefined,
    sessionId: string | undefined,
    userId: string,
  ): Promise<{ updated: string[] }> {
    const project = await this.projectRepo.findById(projectId);
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const chatPageId = pageId || project.homePageId;
    if (!chatPageId) {
      throw new BadRequestException('Project does not have a home page');
    }

    const chatMemories = await this.getChatMemoriesForDraft(
      project,
      chatPageId,
      sessionId,
    );

    if (!chatMemories.length) {
      throw new BadRequestException('No agent chat history found for this page');
    }

    const transcript = this.buildChatTranscript(chatMemories);
    if (!transcript) {
      throw new BadRequestException('Agent chat history was empty');
    }

    const pages = await this.pageService.getPageTree(project.homePageId);
    const targets = new Map<string, string>();
    const wanted = new Map([
      ['project brief', 'projectBrief'],
      ['architecture', 'architecture'],
      ['delivery plan', 'deliveryPlan'],
      ['backlog', 'backlog'],
      ['risks and assumptions', 'risks'],
      ['risks assumptions', 'risks'],
    ]);

    for (const page of pages) {
      const key = this.normalizeTitle(page.title);
      if (wanted.has(key)) {
        targets.set(wanted.get(key) as string, page.id);
      }
    }

    if (targets.size === 0) {
      throw new BadRequestException('Playbook pages not found');
    }

    const model =
      process.env.GEMINI_PLAYBOOK_MODEL ||
      process.env.GEMINI_DEFAULT_MODEL ||
      'gemini-3-pro-preview';

    const prompt = [
      `You are generating a project playbook draft for Raven Docs.`,
      `Project: ${project.name}`,
      `Conversation transcript:`,
      transcript,
      `Return ONLY valid JSON with keys:`,
      `projectBrief, architecture, deliveryPlan, backlog, risks.`,
      `Each key must contain: { "summary": string, "bullets": string[] }.`,
      `Keep summaries concise and bullets action-oriented (3-6 each).`,
    ].join('\n');

    const response = await this.aiService.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2 },
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'object',
        properties: {
          projectBrief: {
            type: 'object',
            properties: {
              summary: { type: 'string' },
              bullets: { type: 'array', items: { type: 'string' } },
            },
            required: ['summary', 'bullets'],
          },
          architecture: {
            type: 'object',
            properties: {
              summary: { type: 'string' },
              bullets: { type: 'array', items: { type: 'string' } },
            },
            required: ['summary', 'bullets'],
          },
          deliveryPlan: {
            type: 'object',
            properties: {
              summary: { type: 'string' },
              bullets: { type: 'array', items: { type: 'string' } },
            },
            required: ['summary', 'bullets'],
          },
          backlog: {
            type: 'object',
            properties: {
              summary: { type: 'string' },
              bullets: { type: 'array', items: { type: 'string' } },
            },
            required: ['summary', 'bullets'],
          },
          risks: {
            type: 'object',
            properties: {
              summary: { type: 'string' },
              bullets: { type: 'array', items: { type: 'string' } },
            },
            required: ['summary', 'bullets'],
          },
        },
        required: [
          'projectBrief',
          'architecture',
          'deliveryPlan',
          'backlog',
          'risks',
        ],
      },
    });

    const rawText =
      response?.candidates?.[0]?.content?.parts?.[0]?.text ||
      response?.candidates?.[0]?.content?.parts
        ?.map((part) => part.text)
        .join('') ||
      '';
    const jsonText = this.extractJson(rawText);
    if (!jsonText) {
      throw new BadRequestException('Playbook draft response was empty');
    }

    let draft: Record<string, { summary?: string; bullets?: string[] }>;
    try {
      draft = JSON.parse(jsonText);
    } catch {
      throw new BadRequestException(
        'Playbook draft response was not valid JSON',
      );
    }

    const updated: string[] = [];
    const apply = async (key: string, fallbackSummary: string) => {
      const targetPageId = targets.get(key);
      if (!targetPageId) return;
      const entry = draft[key] || {};
      const summary = entry.summary?.trim() || fallbackSummary;
      const bullets =
        (entry.bullets || []).filter((item) => typeof item === 'string');
      const content = this.buildPlaybookDraftContent(summary, bullets);
      await this.pageService.updateContent(targetPageId, content, userId);
      updated.push(key);
    };

    await apply(
      'projectBrief',
      'Clarify the problem, success criteria, stakeholders, and constraints.',
    );
    await apply(
      'architecture',
      'Outline the system design, data flows, integrations, and non-functional requirements.',
    );
    await apply(
      'deliveryPlan',
      'Define phases, milestones, dependencies, and timing assumptions.',
    );
    await apply(
      'backlog',
      'List epics, stories, and the highest-priority tasks.',
    );
    await apply(
      'risks',
      'Capture key risks, assumptions, and mitigation plans.',
    );

    return { updated };
  }

  async summarizePlaybookChat(
    projectId: string,
    pageId: string | undefined,
    sessionId: string | undefined,
  ): Promise<{
    summary: string;
    missingInfo: string[];
    readiness: 'ready' | 'not-ready';
    confidence: 'low' | 'medium' | 'high';
  }> {
    const project = await this.projectRepo.findById(projectId);
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const chatPageId = pageId || project.homePageId;
    if (!chatPageId) {
      throw new BadRequestException('Project does not have a home page');
    }

    const chatMemories = await this.getChatMemoriesForDraft(
      project,
      chatPageId,
      sessionId,
    );

    if (!chatMemories.length) {
      throw new BadRequestException('No agent chat history found for this page');
    }

    const transcript = this.buildChatTranscript(chatMemories);
    if (!transcript) {
      throw new BadRequestException('Agent chat history was empty');
    }

    const model =
      process.env.GEMINI_PLAYBOOK_MODEL ||
      process.env.GEMINI_DEFAULT_MODEL ||
      'gemini-3-pro-preview';

    const prompt = [
      `You are summarizing a project discovery chat for Raven Docs.`,
      `Project: ${project.name}`,
      `Conversation transcript:`,
      transcript,
      `Return ONLY valid JSON with keys:`,
      `summary, missingInfo, readiness, confidence.`,
      `summary: string (2-4 sentences).`,
      `missingInfo: string[] (0-5 items).`,
      `readiness: "ready" or "not-ready".`,
      `confidence: "low", "medium", or "high".`,
    ].join('\n');

    const response = await this.aiService.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2 },
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'object',
        properties: {
          summary: { type: 'string' },
          missingInfo: { type: 'array', items: { type: 'string' } },
          readiness: { type: 'string', enum: ['ready', 'not-ready'] },
          confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
        },
        required: ['summary', 'missingInfo', 'readiness', 'confidence'],
      },
    });

    const rawText =
      response?.candidates?.[0]?.content?.parts?.[0]?.text ||
      response?.candidates?.[0]?.content?.parts
        ?.map((part) => part.text)
        .join('') ||
      '';
    const jsonText = this.extractJson(rawText);
    if (!jsonText) {
      throw new BadRequestException('Chat summary response was empty');
    }

    let summary: {
      summary?: string;
      missingInfo?: string[];
      readiness?: string;
      confidence?: string;
    };
    try {
      summary = JSON.parse(jsonText);
    } catch {
      throw new BadRequestException('Chat summary response was not valid JSON');
    }

    const normalizedMissing = Array.isArray(summary.missingInfo)
      ? summary.missingInfo.filter((item) => typeof item === 'string')
      : [];
    const readiness =
      summary.readiness === 'ready' ? 'ready' : 'not-ready';
    const confidence =
      summary.confidence === 'high'
        ? 'high'
        : summary.confidence === 'medium'
          ? 'medium'
          : 'low';

    return {
      summary: summary.summary?.trim() || 'No summary available yet.',
      missingInfo: normalizedMissing,
      readiness,
      confidence,
    };
  }
}
