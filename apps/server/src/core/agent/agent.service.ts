import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { AgentChatDto } from './agent-chat.dto';
import { AgentMemoryService } from '../agent-memory/agent-memory.service';
import { TaskService } from '../project/services/task.service';
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
import { AgentSuggestionsDto } from './agent-suggestions.dto';
import { TaskBucket, TaskStatus } from '../project/constants/task-enums';
import { MCPService } from '../../integrations/mcp/mcp.service';
import { MCPSchemaService } from '../../integrations/mcp/services/mcp-schema.service';
import { MCPErrorCode } from '../../integrations/mcp/utils/error.utils';

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    private readonly memoryService: AgentMemoryService,
    private readonly taskService: TaskService,
    private readonly aiService: AIService,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly spaceRepo: SpaceRepo,
    private readonly pageRepo: PageRepo,
    private readonly mcpService: MCPService,
    private readonly mcpSchemaService: MCPSchemaService,
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

    const pageChatTag = dto.pageId
      ? `agent-chat-page:${dto.pageId}`
      : 'agent-chat';
    const sessionChatTag = dto.sessionId
      ? `agent-chat-session:${dto.sessionId}`
      : null;
    const chatTag = sessionChatTag || pageChatTag;
    const recentMemories = await this.memoryService.queryMemories(
      {
        workspaceId: workspace.id,
        spaceId: dto.spaceId,
        tags: [chatTag],
        limit: 5,
      },
      undefined,
    );
    const shortTermSince = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const shortTermMemories = await this.memoryService.queryMemories(
      {
        workspaceId: workspace.id,
        spaceId: dto.spaceId,
        from: shortTermSince,
        limit: 8,
      },
      undefined,
    );
    const topicQuery = page?.title || dto.message;
    const topicMemories = topicQuery
      ? await this.memoryService.queryMemories(
          {
            workspaceId: workspace.id,
            spaceId: dto.spaceId,
            limit: 6,
          },
          topicQuery,
        )
      : [];
    const profileMemories = await this.memoryService.queryMemories(
      {
        workspaceId: workspace.id,
        spaceId: dto.spaceId,
        tags: [`user:${user.id}`],
        limit: 1,
      },
      undefined,
    );
    const profileContext = this.formatProfileContext(profileMemories[0]);

    const memoryContext = this.formatMemorySummary(recentMemories);
    const shortTermContext = this.formatMemorySummary(shortTermMemories);
    const topicContext = this.formatMemorySummary(topicMemories);

    const goalFocusSummary = Array.isArray((triage as any).goalFocus)
      ? (triage as any).goalFocus
          .map((goal: any) => `${goal.name}(${goal.taskCount})`)
          .join(', ')
      : '';

    const toolList = this.formatToolList();

    const prompt = [
      `You are Raven Docs' agent. Provide clear, concise guidance.`,
      `Space: ${space.name}`,
      page?.title ? `Page: ${page.title}` : null,
      `Recent chat memories:`,
      memoryContext,
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
      `When you need a tool, include it in "actions" with method + params.`,
      `Always include spaceId and pageId when relevant to the tool.`,
      `Return JSON only with keys: reply (string), actions (array).`,
      `actions items: { "method": string, "params": object }.`,
      `If no tools are needed, set actions to [].`,
      `End your reply with two lines:`,
      `Draft readiness: ready|not-ready`,
      `Confidence: high|medium|low`,
    ]
      .filter(Boolean)
      .join('\n');

    let replyText = 'Agent response unavailable.';
    let actions: Array<{ method: string; params?: any }> = [];
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
                  params: { type: 'object' },
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
      const jsonText = rawText.trim().startsWith('{')
        ? rawText.trim()
        : rawText.match(/\{[\s\S]*\}/)?.[0] || '';
      if (jsonText) {
        const parsed = JSON.parse(jsonText);
        replyText = parsed.reply || replyText;
        actions = Array.isArray(parsed.actions) ? parsed.actions : [];
      } else if (rawText) {
        replyText = rawText;
      }
    } catch (error: any) {
      this.logger.warn(
        `Agent chat failed: ${error?.message || String(error)}`,
      );
    }

    const autoApprove = dto.autoApprove === true;
    const actionSummaries: string[] = [];
    const approvalItems: Array<{ token: string; method: string; params?: any }> =
      [];

    for (const action of actions) {
      if (!action?.method) continue;
      const params = {
        ...(action.params || {}),
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

    const tags = dto.pageId ? ['agent-chat', pageChatTag] : ['agent-chat'];
    if (sessionChatTag) {
      tags.push(sessionChatTag);
    }

    await this.memoryService.ingestMemory({
      workspaceId: workspace.id,
      spaceId: dto.spaceId,
      source: 'agent-chat',
      summary: `User: ${dto.message.slice(0, 80)}`,
      content: { text: dto.message },
      tags: [...tags, 'user'],
    });

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
