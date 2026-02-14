import { Injectable, Logger } from '@nestjs/common';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { streamText, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import { AgentChatDto } from './agent-chat.dto';
import { AgentMemoryService } from '../agent-memory/agent-memory.service';
import { MCPService } from '../../integrations/mcp/mcp.service';
import { User, Workspace } from '@raven-docs/db/types/entity.types';
import { resolveAgentSettings } from './agent-settings';
import { SpaceRepo } from '@raven-docs/db/repos/space/space.repo';
import { PageRepo } from '@raven-docs/db/repos/page/page.repo';
import { AgentMemoryContextService } from './agent-memory-context.service';

@Injectable()
export class AgentStreamService {
  private readonly logger = new Logger(AgentStreamService.name);

  constructor(
    private readonly memoryService: AgentMemoryService,
    private readonly mcpService: MCPService,
    private readonly spaceRepo: SpaceRepo,
    private readonly pageRepo: PageRepo,
    private readonly memoryContextService: AgentMemoryContextService,
  ) {}

  private getModelId() {
    // Use the latest Gemini 3 Pro for best reasoning and tool calling
    return process.env.GEMINI_AGENT_MODEL || 'gemini-3-pro-preview';
  }

  private getApiKey() {
    return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  }

  async streamChat(
    dto: AgentChatDto,
    user: User,
    workspace: Workspace,
  ): Promise<{ textStream: AsyncIterable<string> }> {
    const agentSettings = resolveAgentSettings(workspace.settings);
    if (!agentSettings.enabled || !agentSettings.allowAgentChat) {
      throw new Error('Agent chat disabled');
    }

    const space = await this.spaceRepo.findById(dto.spaceId, workspace.id);
    if (!space) {
      throw new Error('Space not found');
    }

    const page = dto.pageId
      ? await this.pageRepo.findById(dto.pageId, { includeSpace: false })
      : null;

    // Build context
    const context = await this.memoryContextService.buildContext({
      workspaceId: workspace.id,
      spaceId: dto.spaceId,
      userId: user.id,
      pageId: dto.pageId,
      projectId: dto.projectId ?? null,
      sessionId: dto.sessionId,
      message: dto.message,
      pageTitle: page?.title ?? null,
      recentLimit: 5,
      shortTermLimit: 5,
      projectLimit: 3,
      topicLimit: 3,
      profileLimit: 1,
      knowledgeLimit: 3,
    });

    const knowledgeContext = context.knowledge
      .filter((k) => k.similarity >= 0.6)
      .map((k) => `[${k.sourceName}]: ${k.content.slice(0, 500)}`)
      .join('\n\n');

    const memoryContext = context.memories.recentMemories
      .map((m) => `- ${m.summary || 'memory'}`)
      .join('\n');

    const systemPrompt = [
      `You are Raven, an AI assistant for the Raven Docs knowledge management platform.`,
      ``,
      `IMPORTANT: When users ask questions about Raven Docs, its features, how to use it, or anything about the platform, you MUST use the knowledge_search tool first to find accurate information from the documentation. Do not rely on general knowledge - always search first.`,
      ``,
      `Current context:`,
      `- Space: ${space.name}`,
      page?.title ? `- Page: ${page.title}` : null,
      ``,
      memoryContext ? `Recent conversation:\n${memoryContext}\n` : null,
      ``,
      `Available tools:`,
      `- knowledge_search: Search documentation and knowledge base. USE THIS for any questions about Raven Docs features, capabilities, or how to do things.`,
      `- search_pages: Search user-created pages in the workspace.`,
      `- create_task: Create a new task.`,
      ``,
      `Guidelines:`,
      `- ALWAYS use knowledge_search when asked about Raven Docs`,
      `- Provide specific, detailed answers based on search results`,
      `- Be helpful and concise`,
    ]
      .filter(Boolean)
      .join('\n');

    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY or GOOGLE_API_KEY is required');
    }
    const google = createGoogleGenerativeAI({ apiKey });
    const model = google(this.getModelId());

    // Define tools that wrap MCP handlers
    const tools = {
      knowledge_search: tool({
        description: 'Search the knowledge base and documentation for information about Raven Docs features, capabilities, and how to use the platform',
        inputSchema: z.object({
          query: z.string().describe('The search query'),
        }),
        execute: async ({ query }) => {
          this.logger.log(`[Tool] knowledge_search called with query: "${query}"`);
          const response = await this.mcpService.processRequest(
            {
              jsonrpc: '2.0',
              method: 'knowledge.search',
              params: {
                query,
                workspaceId: workspace.id,
                spaceId: dto.spaceId,
              },
              id: Date.now(),
            },
            user,
          );

          if (response.error) {
            this.logger.warn(`[Tool] knowledge_search error: ${response.error.message}`);
            return { error: response.error.message };
          }

          const results = (response.result?.results || []) as Array<{
            content: string;
            sourceName: string;
            similarity: number;
          }>;

          this.logger.log(`[Tool] knowledge_search found ${results.length} results`);

          return {
            count: results.length,
            results: results.slice(0, 5).map((r) => ({
              source: r.sourceName,
              content: r.content.slice(0, 800),
              similarity: r.similarity,
            })),
          };
        },
      }),

      search_pages: tool({
        description: 'Search user-created pages in the workspace',
        inputSchema: z.object({
          query: z.string().describe('The search query'),
        }),
        execute: async ({ query }) => {
          const response = await this.mcpService.processRequest(
            {
              jsonrpc: '2.0',
              method: 'search.query',
              params: {
                query,
                spaceId: dto.spaceId,
              },
              id: Date.now(),
            },
            user,
          );

          if (response.error) {
            return { error: response.error.message };
          }

          const results = Array.isArray(response.result) ? response.result : [];
          return {
            count: results.length,
            pages: results.slice(0, 5).map((p: any) => ({
              title: p.title,
              highlight: p.highlight,
            })),
          };
        },
      }),

      create_task: tool({
        description: 'Create a new task',
        inputSchema: z.object({
          title: z.string().describe('Task title'),
          description: z.string().optional().describe('Task description'),
        }),
        execute: async ({ title, description }) => {
          const response = await this.mcpService.processRequest(
            {
              jsonrpc: '2.0',
              method: 'task.create',
              params: {
                title,
                description,
                spaceId: dto.spaceId,
                workspaceId: workspace.id,
              },
              id: Date.now(),
            },
            user,
          );

          if (response.error) {
            return { error: response.error.message };
          }

          return { success: true, task: response.result };
        },
      }),
    };

    const messages = [
      { role: 'user' as const, content: dto.message },
    ];

    // Save user message to memory
    const chatTag = dto.sessionId
      ? `agent-chat-session:${dto.sessionId}`
      : dto.pageId
        ? `agent-chat-page:${dto.pageId}`
        : 'agent-chat';

    await this.memoryService.ingestMemory({
      workspaceId: workspace.id,
      spaceId: dto.spaceId,
      source: 'agent-chat',
      summary: `User: ${dto.message.slice(0, 80)}`,
      content: { text: dto.message },
      tags: [chatTag, 'user'],
    });

    this.logger.log(`[Stream] Starting chat with message: "${dto.message.slice(0, 50)}..."`);
    this.logger.log(`[Stream] Using model: ${this.getModelId()}`);
    this.logger.log(`[Stream] Tools defined: knowledge_search, search_pages, create_task`);

    // Stream the response
    const result = streamText({
      model,
      system: systemPrompt,
      messages,
      tools,
      stopWhen: stepCountIs(5), // Allow up to 5 tool call steps
      toolChoice: 'auto', // Let the model decide when to use tools
      onStepFinish: async (stepResult) => {
        if (stepResult.toolCalls?.length) {
          this.logger.log(`[Stream] Tool calls: ${stepResult.toolCalls.map(tc => tc.toolName).join(', ')}`);
        }
      },
      onFinish: async (event) => {
        this.logger.log(`[Stream] Finished. Reason: ${event.finishReason}, Tool calls: ${event.toolCalls?.length || 0}, Text length: ${event.text?.length || 0}`);
        if (event.toolResults?.length) {
          this.logger.log(`[Stream] Tool results: ${JSON.stringify(event.toolResults.slice(0, 2))}`);
        }
        // Save assistant response to memory
        if (event.text) {
          await this.memoryService.ingestMemory({
            workspaceId: workspace.id,
            spaceId: dto.spaceId,
            source: 'agent-chat',
            summary: 'Agent reply',
            content: { text: event.text },
            tags: [chatTag, 'assistant'],
          });
        }
      },
    });

    return result;
  }
}
