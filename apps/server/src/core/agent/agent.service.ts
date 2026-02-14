import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { AgentChatDto } from './agent-chat.dto';
import { AgentMemoryService } from '../agent-memory/agent-memory.service';
import { TaskService } from '../project/services/task.service';
import { ProjectService } from '../project/services/project.service';
import { AIService } from '../../integrations/ai/ai.service';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../casl/interfaces/space-ability.type';
import { User, Workspace } from '@raven-docs/db/types/entity.types';
import { resolveAgentSettings } from './agent-settings';
import { SpaceRepo } from '@raven-docs/db/repos/space/space.repo';
import { PageRepo } from '@raven-docs/db/repos/page/page.repo';
import { PageService } from '../page/services/page.service';
import { AgentSuggestionsDto } from './agent-suggestions.dto';
import { TaskBucket, TaskStatus } from '../project/constants/task-enums';
import { MCPService } from '../../integrations/mcp/mcp.service';
import { MCPSchemaService } from '../../integrations/mcp/services/mcp-schema.service';
import { MCPErrorCode } from '../../integrations/mcp/utils/error.utils';
import { AgentChatContextDto } from './agent-chat-context.dto';
import { AgentMemoryContextService } from './agent-memory-context.service';

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    private readonly memoryService: AgentMemoryService,
    private readonly taskService: TaskService,
    private readonly projectService: ProjectService,
    private readonly aiService: AIService,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly spaceRepo: SpaceRepo,
    private readonly pageRepo: PageRepo,
    private readonly pageService: PageService,
    private readonly mcpService: MCPService,
    private readonly mcpSchemaService: MCPSchemaService,
    private readonly memoryContextService: AgentMemoryContextService,
  ) {}

  private getAgentModel() {
    return process.env.GEMINI_AGENT_MODEL || 'gemini-3-pro-preview';
  }

  private extractJsonObject(text: string): Record<string, any> | null {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }

  private formatToolList() {
    const schemas = this.mcpSchemaService.getAllMethodSchemas();
    return schemas.map((schema) => {
      const required = Object.entries(schema.parameters || {})
        .filter(([, param]) => param?.required)
        .map(([name]) => name);
      const requiredText = required.length
        ? `Required: ${required.join(', ')}`
        : 'Required: none';
      return `${schema.name} - ${schema.description} (${requiredText})`;
    });
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
    if (!memories.length) return '- none';
    return memories
      .map((memory) => `- ${memory.summary || 'memory'}`)
      .join('\n');
  }

  private buildContextSource(
    key: string,
    label: string,
    memories: any[],
  ) {
    return {
      key,
      label,
      count: memories.length,
      items: memories.map((memory) => ({
        id: memory.id,
        summary: memory.summary || '',
        source: memory.source || null,
        timestamp: memory.timestamp || memory.createdAt || null,
        tags: memory.tags || [],
      })),
    };
  }

  private async resolveProjectIdFromPage(
    spaceId: string,
    pageId: string,
  ): Promise<string | null> {
    const breadcrumbs = await this.pageService.getPageBreadCrumbs(pageId);
    if (!breadcrumbs.length) return null;

    const ancestorIds = breadcrumbs.map((ancestor) => ancestor.id);
    const indexById = new Map(
      ancestorIds.map((id, index) => [id, index]),
    );

    const projectsResult = await this.projectService.findBySpaceId(
      spaceId,
      { page: 1, limit: 200 },
    );
    const projects = projectsResult?.data || [];

    let bestMatch: { projectId: string; index: number } | null = null;
    for (const project of projects) {
      if (!project.homePageId) continue;
      const index = indexById.get(project.homePageId);
      if (index === undefined) continue;
      if (!bestMatch || index > bestMatch.index) {
        bestMatch = { projectId: project.id, index };
      }
    }

    return bestMatch?.projectId || null;
  }

  private async fetchChatMemories(params: {
    workspaceId: string;
    spaceId: string;
    userId: string;
    pageId?: string;
    projectId?: string | null;
    sessionId?: string;
    message?: string;
    pageTitle?: string | null;
  }) {
    const context = await this.memoryContextService.buildContext({
      workspaceId: params.workspaceId,
      spaceId: params.spaceId,
      userId: params.userId,
      pageId: params.pageId,
      projectId: params.projectId ?? null,
      sessionId: params.sessionId,
      message: params.message,
      pageTitle: params.pageTitle ?? null,
      recentLimit: 5,
      shortTermLimit: 8,
      projectLimit: 6,
      topicLimit: 6,
      profileLimit: 1,
      knowledgeLimit: 3,
    });

    return {
      pageChatTag: context.tags.pageChatTag,
      sessionChatTag: context.tags.sessionChatTag,
      chatTag: context.tags.chatTag,
      projectChatTag: context.tags.projectChatTag,
      pageTag: context.tags.pageTag,
      userTag: context.tags.userTag ?? `user:${params.userId}`,
      recentMemories: context.memories.recentMemories,
      shortTermMemories: context.memories.shortTermMemories,
      projectMemories: context.memories.projectMemories,
      topicMemories: context.memories.topicMemories,
      profileMemories: context.memories.profileMemories,
      knowledge: context.knowledge,
    };
  }

  private formatKnowledgeContext(knowledge: any[]) {
    if (!knowledge.length) return '';
    return knowledge
      .filter((k) => k.similarity >= 0.6)
      .map((k) => `[${k.sourceName}]: ${k.content.slice(0, 500)}`)
      .join('\n\n');
  }

  async chat(dto: AgentChatDto, user: User, workspace: Workspace) {
    const agentSettings = resolveAgentSettings(workspace.settings);
    if (!agentSettings.enabled || !agentSettings.allowAgentChat) {
      throw new ForbiddenException('Agent chat disabled');
    }

    const ability = await this.spaceAbility.createForUser(user, dto.spaceId);
    if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
      throw new ForbiddenException('No access to space');
    }

    const space = await this.spaceRepo.findById(dto.spaceId, workspace.id);
    if (!space) {
      throw new ForbiddenException('Space not found');
    }

    const page = dto.pageId
      ? await this.pageRepo.findById(dto.pageId, { includeSpace: false })
      : null;

    if (page && page.spaceId !== dto.spaceId) {
      throw new ForbiddenException('Page not found in space');
    }

    const inferredProjectId =
      !dto.projectId && dto.pageId
        ? await this.resolveProjectIdFromPage(dto.spaceId, dto.pageId)
        : null;
    const resolvedProjectId = dto.projectId || inferredProjectId || null;

    const triage = agentSettings.enableAutoTriage
      ? await this.taskService.getDailyTriageSummary(dto.spaceId, {
          limit: 5,
          workspaceId: workspace.id,
        })
      : {
          inbox: [],
          waiting: [],
          someday: [],
          overdue: [],
          dueToday: [],
          counts: { inbox: 0, waiting: 0, someday: 0 },
        };

    const {
      pageChatTag,
      sessionChatTag,
      chatTag,
      projectChatTag,
      pageTag,
      userTag,
      recentMemories,
      shortTermMemories,
      projectMemories,
      topicMemories,
      profileMemories,
      knowledge,
    } = await this.fetchChatMemories({
      workspaceId: workspace.id,
      spaceId: dto.spaceId,
      userId: user.id,
      pageId: dto.pageId,
      projectId: resolvedProjectId,
      sessionId: dto.sessionId,
      message: dto.message,
      pageTitle: page?.title,
    });
    const profileContext = this.formatProfileContext(profileMemories[0]);

    const memoryContext = this.formatMemorySummary(recentMemories);
    const projectContext = this.formatMemorySummary(projectMemories);
    const shortTermContext = this.formatMemorySummary(shortTermMemories);
    const topicContext = this.formatMemorySummary(topicMemories);
    const knowledgeContext = this.formatKnowledgeContext(knowledge);

    const goalFocusSummary = Array.isArray((triage as any).goalFocus)
      ? (triage as any).goalFocus
          .map((goal: any) => `${goal.name}(${goal.taskCount})`)
          .join(', ')
      : '';

    const toolList = this.formatToolList();

    const prompt = [
      `You are Raven Docs' agent. Respond conversationally and be helpful.`,
      `Space: ${space.name}`,
      page?.title ? `Page: ${page.title}` : null,
      knowledgeContext ? `Relevant documentation:\n${knowledgeContext}` : null,
      `Recent chat memories:`,
      memoryContext,
      projectMemories.length ? `Project context:\n${projectContext}` : null,
      `Recent activity (14d):`,
      shortTermContext,
      topicContext !== '- none' ? `Topic signals:\n${topicContext}` : null,
      `Triage: inbox=${triage.counts.inbox}, waiting=${triage.counts.waiting}, someday=${triage.counts.someday}.`,
      `Overdue: ${triage.overdue.map((task) => task.title).join(', ') || 'none'}.`,
      `Due today: ${triage.dueToday.map((task) => task.title).join(', ') || 'none'}.`,
      goalFocusSummary ? `Goal focus: ${goalFocusSummary}.` : null,
      profileContext ? `User profile: ${profileContext}.` : null,
      `User message: ${dto.message}`,
      `Available tools (use these when needed):`,
      ...toolList,
      `Ask concise clarifying questions when needed instead of listing boilerplate fields.`,
      `When you need a tool, include it in "actions" with method + params.`,
      `Always include spaceId and pageId when relevant to the tool.`,
      `Return JSON with keys: reply (string), actions (array).`,
      `actions items: { "method": string, "params": object }.`,
      `If no tools are needed, set actions to [].`,
    ]
      .filter(Boolean)
      .join('\n');

    let replyText = 'Agent response unavailable.';
    let actions: Array<{ method: string; params?: any }> = [];

    const parseAgentResponse = (rawText: string) => {
      const trimmed = rawText.trim();
      if (!trimmed) return false;
      const parsed = this.extractJsonObject(trimmed);
      if (parsed) {
        replyText = parsed.reply || replyText;
        actions = Array.isArray(parsed.actions) ? parsed.actions : [];
        return true;
      }
      replyText = trimmed;
      actions = [];
      return true;
    };

    try {
      const response = await this.aiService.generateContent({
        model: this.getAgentModel(),
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            reply: { type: 'string' },
            actions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  method: { type: 'string' },
                  params: {
                    type: 'object',
                    properties: {
                      spaceId: { type: 'string' },
                      pageId: { type: 'string' },
                    },
                    additionalProperties: true,
                  },
                },
                required: ['method'],
              },
            },
          },
          required: ['reply', 'actions'],
        },
      });
      const rawText =
        response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      parseAgentResponse(rawText);
    } catch (error: any) {
      this.logger.warn(
        `Agent chat failed: ${error?.message || String(error)}`,
      );
    }

    if (replyText === 'Agent response unavailable.') {
      try {
        const fallback = await this.aiService.generateContent({
          model: this.getAgentModel(),
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
        });
        const rawText =
          fallback?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        parseAgentResponse(rawText);
      } catch (error: any) {
        this.logger.warn(
          `Agent chat fallback failed: ${error?.message || String(error)}`,
        );
      }
    }

    const autoApprove = dto.autoApprove === true;
    const actionSummaries: string[] = [];
    const approvalItems: Array<{ token: string; method: string; params?: any }> =
      [];

    for (const action of actions) {
      if (!action?.method) continue;
      const params = {
        ...(action.params || {}),
        workspaceId: workspace.id,
        spaceId: action.params?.spaceId || dto.spaceId,
        pageId: action.params?.pageId || dto.pageId,
      };

      const response = await this.mcpService.processRequest(
        {
          jsonrpc: '2.0',
          method: action.method,
          params,
          id: Date.now(),
        },
        user,
      );

      if (!response.error) {
        actionSummaries.push(`- ${action.method}: applied`);
        continue;
      }

      if (
        response.error.code === MCPErrorCode.APPROVAL_REQUIRED &&
        autoApprove &&
        response.error.data?.approvalToken
      ) {
        const retryResponse = await this.mcpService.processRequest(
          {
            jsonrpc: '2.0',
            method: action.method,
            params: {
              ...params,
              approvalToken: response.error.data.approvalToken,
            },
            id: Date.now() + 1,
          },
          user,
        );

        if (!retryResponse.error) {
          actionSummaries.push(`- ${action.method}: approved & applied`);
          continue;
        }

        actionSummaries.push(
          `- ${action.method}: failed (${retryResponse.error.message})`,
        );
        continue;
      }

      if (response.error.code === MCPErrorCode.APPROVAL_REQUIRED) {
        if (response.error.data?.approvalToken) {
          approvalItems.push({
            token: response.error.data.approvalToken,
            method: action.method,
            params,
          });
        }
        actionSummaries.push(
          `- ${action.method}: approval required (${response.error.data?.approvalToken || 'pending'})`,
        );
        continue;
      }

      actionSummaries.push(
        `- ${action.method}: failed (${response.error.message})`,
      );
    }

    if (actionSummaries.length) {
      replyText = `${replyText}\n\nTool results:\n${actionSummaries.join('\n')}`;
    }

    const tags = ['agent-chat', pageChatTag];
    if (sessionChatTag) tags.push(sessionChatTag);
    if (projectChatTag) tags.push(projectChatTag);
    if (pageTag) tags.push(pageTag);
    tags.push(userTag);

    if (!dto.internal) {
      await this.memoryService.ingestMemory({
        workspaceId: workspace.id,
        spaceId: dto.spaceId,
        source: 'agent-chat',
        summary: `User: ${dto.message.slice(0, 80)}`,
        content: { text: dto.message },
        tags: [...tags, 'user'],
      });
    }

    await this.memoryService.ingestMemory({
      workspaceId: workspace.id,
      spaceId: dto.spaceId,
      source: 'agent-chat',
      summary: `Agent reply`,
      content: { text: replyText },
      tags: [...tags, 'assistant'],
    });

    return {
      reply: replyText,
      approvalsRequired: approvalItems.length > 0,
      approvalItems,
    };
  }

  async getChatContext(
    dto: AgentChatContextDto,
    user: User,
    workspace: Workspace,
  ) {
    const agentSettings = resolveAgentSettings(workspace.settings);
    if (!agentSettings.enabled || !agentSettings.allowAgentChat) {
      throw new ForbiddenException('Agent chat disabled');
    }

    const ability = await this.spaceAbility.createForUser(user, dto.spaceId);
    if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
      throw new ForbiddenException('No access to space');
    }

    const space = await this.spaceRepo.findById(dto.spaceId, workspace.id);
    if (!space) {
      throw new ForbiddenException('Space not found');
    }

    const page = dto.pageId
      ? await this.pageRepo.findById(dto.pageId, { includeSpace: false })
      : null;
    if (page && page.spaceId !== dto.spaceId) {
      throw new ForbiddenException('Page not found in space');
    }

    const inferredProjectId =
      !dto.projectId && dto.pageId
        ? await this.resolveProjectIdFromPage(dto.spaceId, dto.pageId)
        : null;
    const resolvedProjectId = dto.projectId || inferredProjectId || null;

    const {
      recentMemories,
      shortTermMemories,
      projectMemories,
      topicMemories,
      profileMemories,
      knowledge,
    } = await this.fetchChatMemories({
      workspaceId: workspace.id,
      spaceId: dto.spaceId,
      userId: user.id,
      pageId: dto.pageId,
      projectId: resolvedProjectId,
      sessionId: dto.sessionId,
      message: dto.message,
      pageTitle: page?.title,
    });

    const sources = [
      this.buildContextSource('chat', 'Chat', recentMemories),
      this.buildContextSource('project', 'Project', projectMemories),
      this.buildContextSource('workspace', 'Recent activity', shortTermMemories),
      this.buildContextSource('topic', 'Topic', topicMemories),
      this.buildContextSource('profile', 'Profile', profileMemories),
      {
        key: 'knowledge',
        label: 'Documentation',
        count: knowledge.length,
        items: knowledge.map((k) => ({
          id: k.sourceName,
          summary: k.content.slice(0, 200),
          source: k.sourceName,
          timestamp: null,
          tags: [],
          similarity: k.similarity,
        })),
      },
    ];

    return {
      spaceId: dto.spaceId,
      pageId: dto.pageId || null,
      projectId: resolvedProjectId,
      sources,
    };
  }

  async suggestNextActions(
    dto: AgentSuggestionsDto,
    user: User,
    workspace: Workspace,
  ) {
    const agentSettings = resolveAgentSettings(workspace.settings);
    if (!agentSettings.enabled || !agentSettings.allowAgentChat) {
      throw new ForbiddenException('Agent suggestions disabled');
    }

    const ability = await this.spaceAbility.createForUser(user, dto.spaceId);
    if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
      throw new ForbiddenException('No access to space');
    }

    const space = await this.spaceRepo.findById(dto.spaceId, workspace.id);
    if (!space) {
      throw new ForbiddenException('Space not found');
    }

    const limit = dto.limit ?? 5;
    const tasksResult = await this.taskService.findBySpaceId(
      dto.spaceId,
      { page: 1, limit: 200 },
      {
        status: [
          TaskStatus.TODO,
          TaskStatus.IN_PROGRESS,
          TaskStatus.IN_REVIEW,
          TaskStatus.BLOCKED,
        ],
        bucket: [TaskBucket.NONE, TaskBucket.INBOX],
        includeProject: true,
      },
    );

    const tasks = tasksResult?.data || [];
    if (tasks.length === 0) {
      return { items: [] };
    }

    const taskSummaries = tasks.map((task: any) => ({
      id: task.id,
      title: task.title,
      projectName: task.project_name || null,
      priority: task.priority,
      status: task.status,
      bucket: task.bucket,
      dueDate: task.dueDate,
      updatedAt: task.updatedAt,
    }));

    const prompt = [
      `You are Raven Docs' planning agent.`,
      `Pick up to ${limit} next actions that the user should focus on.`,
      `Only choose from the provided tasks.`,
      `Return JSON with shape: {"suggestions":[{"taskId":"...","reason":"..."}]}.`,
      `Space: ${space.name}`,
      `Tasks: ${JSON.stringify(taskSummaries)}`,
    ].join('\n');

    let suggestions: Array<{ taskId: string; reason?: string }> = [];
    try {
      const response = await this.aiService.generateContent({
        model: this.getAgentModel(),
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });
      const reply =
        response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const parsed = this.extractJsonObject(reply);
      const items = Array.isArray(parsed?.suggestions)
        ? parsed.suggestions
        : [];
      suggestions = items
        .filter((item: any) => typeof item?.taskId === 'string')
        .slice(0, limit)
        .map((item: any) => ({
          taskId: item.taskId,
          reason: typeof item.reason === 'string' ? item.reason : undefined,
        }));
    } catch (error: any) {
      this.logger.warn(
        `Agent suggestions failed: ${error?.message || String(error)}`,
      );
    }

    if (suggestions.length === 0) {
      suggestions = taskSummaries.slice(0, limit).map((task) => ({
        taskId: task.id,
        reason: 'Top active task',
      }));
    }

    const taskById = new Map<string, any>(
      taskSummaries.map((task) => [task.id, task]),
    );

    const items = suggestions
      .map((suggestion) => {
        const task = taskById.get(suggestion.taskId);
        if (!task) return null;
        return {
          taskId: suggestion.taskId,
          reason: suggestion.reason,
          title: task.title,
          projectName: task.projectName,
          dueDate: task.dueDate,
          updatedAt: task.updatedAt,
        };
      })
      .filter(Boolean);

    await this.memoryService.ingestMemory({
      workspaceId: workspace.id,
      spaceId: dto.spaceId,
      source: 'agent-suggestions',
      summary: `Agent suggested ${items.length} next actions`,
      content: { suggestions: items },
      tags: ['agent', 'next-actions'],
    });

    return { items };
  }
}
