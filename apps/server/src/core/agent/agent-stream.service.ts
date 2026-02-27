import { Injectable, Logger } from '@nestjs/common';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { streamText, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import { AgentChatDto } from './agent-chat.dto';
import { AgentMemoryService } from '../agent-memory/agent-memory.service';
import { MCPService } from '../../integrations/mcp/mcp.service';
import { MCPSchemaService } from '../../integrations/mcp/services/mcp-schema.service';
import { User, Workspace } from '@raven-docs/db/types/entity.types';
import { resolveAgentSettings } from './agent-settings';
import { SpaceRepo } from '@raven-docs/db/repos/space/space.repo';
import { PageRepo } from '@raven-docs/db/repos/page/page.repo';
import { AgentMemoryContextService } from './agent-memory-context.service';
import { BugReportService } from '../bug-report/bug-report.service';
import { BugContextService } from '../bug-report/bug-context.service';
import { BugReportSourceDto, BugReportSeverityDto } from '../bug-report/dto/create-bug-report.dto';
import { AIService } from '../../integrations/ai/ai.service';

@Injectable()
export class AgentStreamService {
  private readonly logger = new Logger(AgentStreamService.name);

  constructor(
    private readonly memoryService: AgentMemoryService,
    private readonly mcpService: MCPService,
    private readonly mcpSchemaService: MCPSchemaService,
    private readonly spaceRepo: SpaceRepo,
    private readonly pageRepo: PageRepo,
    private readonly memoryContextService: AgentMemoryContextService,
    private readonly bugReportService: BugReportService,
    private readonly bugContextService: BugContextService,
    private readonly aiService: AIService,
  ) {}

  private getModelId() {
    return this.aiService.getSlowModel();
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
      `- list_projects: List projects in the current space.`,
      `- create_project: Create a new project in the current space.`,
      `- update_project: Update an existing project.`,
      `- archive_project: Archive or unarchive a project.`,
      `- delete_project: Delete a project.`,
      `- report_bug: Report a bug or issue. Users can type "/bug" followed by a description.`,
      `- context_query: Ask "what do we know about X?" to get a structured overview of hypotheses, experiments, and evidence.`,
      `- create_hypothesis: Formalize a testable hypothesis with predictions and success criteria.`,
      `- register_experiment: Register a new experiment linked to a hypothesis.`,
      `- deploy_team: Deploy a multi-agent research team from a template to the current space.`,
      `- mcp_call: Generic MCP bridge to call any available MCP method with params.`,
      ``,
      `Guidelines:`,
      `- ALWAYS use knowledge_search when asked about Raven Docs`,
      `- Provide specific, detailed answers based on search results`,
      `- Be helpful and concise`,
      `- If a needed capability is not covered by a specialized tool, use mcp_call.`,
      `- Preferred: pass method-specific params. The runtime auto-injects workspaceId/spaceId/pageId when missing.`,
      `Available MCP methods: ${this.mcpSchemaService.getAllMethodNames().join(', ')}`,
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

      list_projects: tool({
        description: 'List projects in the current space',
        inputSchema: z.object({
          includeArchived: z.boolean().optional().describe('Include archived projects'),
          searchTerm: z.string().optional().describe('Optional search term'),
          page: z.number().int().min(1).optional(),
          limit: z.number().int().min(1).max(100).optional(),
        }),
        execute: async ({ includeArchived, searchTerm, page, limit }) => {
          const response = await this.mcpService.processRequest(
            {
              jsonrpc: '2.0',
              method: 'project.list',
              params: {
                spaceId: dto.spaceId,
                includeArchived,
                searchTerm,
                page: page ?? 1,
                limit: limit ?? 20,
              },
              id: Date.now(),
            },
            user,
          );

          if (response.error) {
            return { error: response.error.message };
          }

          const projects = response.result?.projects || [];
          return {
            count: projects.length,
            projects: projects.slice(0, 10).map((p: any) => ({
              id: p.id,
              name: p.name,
              archived: Boolean(p.isArchived),
            })),
          };
        },
      }),

      create_project: tool({
        description: 'Create a new project in the current space',
        inputSchema: z.object({
          name: z.string().describe('Project name'),
          description: z.string().optional().describe('Project description'),
          icon: z.string().optional().describe('Project icon'),
          color: z.string().optional().describe('Project color'),
        }),
        execute: async ({ name, description, icon, color }) => {
          const response = await this.mcpService.processRequest(
            {
              jsonrpc: '2.0',
              method: 'project.create',
              params: {
                name,
                description,
                icon,
                color,
                spaceId: dto.spaceId,
                workspaceId: workspace.id,
              },
              id: Date.now(),
            },
            user,
          );

          if (response.error) {
            return { error: response.error.message, code: response.error.code };
          }

          return { success: true, project: response.result };
        },
      }),

      update_project: tool({
        description: 'Update an existing project',
        inputSchema: z.object({
          projectId: z.string().describe('Project ID'),
          name: z.string().optional(),
          description: z.string().optional(),
          icon: z.string().optional(),
          color: z.string().optional(),
        }),
        execute: async ({ projectId, name, description, icon, color }) => {
          const response = await this.mcpService.processRequest(
            {
              jsonrpc: '2.0',
              method: 'project.update',
              params: {
                projectId,
                name,
                description,
                icon,
                color,
                workspaceId: workspace.id,
              },
              id: Date.now(),
            },
            user,
          );

          if (response.error) {
            return { error: response.error.message, code: response.error.code };
          }

          return { success: true, project: response.result };
        },
      }),

      archive_project: tool({
        description: 'Archive or unarchive a project',
        inputSchema: z.object({
          projectId: z.string().describe('Project ID'),
          isArchived: z.boolean().optional().describe('true to archive, false to unarchive'),
        }),
        execute: async ({ projectId, isArchived }) => {
          const response = await this.mcpService.processRequest(
            {
              jsonrpc: '2.0',
              method: 'project.archive',
              params: {
                projectId,
                isArchived: typeof isArchived === 'boolean' ? isArchived : true,
                workspaceId: workspace.id,
              },
              id: Date.now(),
            },
            user,
          );

          if (response.error) {
            return { error: response.error.message, code: response.error.code };
          }

          return { success: true, project: response.result };
        },
      }),

      delete_project: tool({
        description: 'Delete a project',
        inputSchema: z.object({
          projectId: z.string().describe('Project ID'),
        }),
        execute: async ({ projectId }) => {
          const response = await this.mcpService.processRequest(
            {
              jsonrpc: '2.0',
              method: 'project.delete',
              params: {
                projectId,
                workspaceId: workspace.id,
              },
              id: Date.now(),
            },
            user,
          );

          if (response.error) {
            return { error: response.error.message, code: response.error.code };
          }

          return { success: true };
        },
      }),

      report_bug: tool({
        description: 'Report a bug or issue. Use when user says /bug or wants to report a problem.',
        inputSchema: z.object({
          title: z.string().describe('Brief title of the bug'),
          description: z.string().describe('Detailed description of the issue'),
          severity: z.enum(['low', 'medium', 'high', 'critical']).optional().describe('Severity level'),
        }),
        execute: async ({ title, description, severity }) => {
          this.logger.log(`[Tool] report_bug called: "${title}"`);

          try {
            const report = await this.bugReportService.create(
              user.id,
              workspace.id,
              {
                title,
                description,
                source: BugReportSourceDto.USER_COMMAND,
                severity: severity as BugReportSeverityDto || BugReportSeverityDto.MEDIUM,
                spaceId: dto.spaceId,
                context: {
                  pageId: dto.pageId,
                  projectId: dto.projectId,
                  sessionId: dto.sessionId,
                },
              },
            );

            this.logger.log(`[Tool] report_bug created: ${report.id}`);
            return {
              success: true,
              bugId: report.id.slice(0, 8),
              message: `Bug report "${title}" has been submitted. Reference: ${report.id.slice(0, 8)}`,
            };
          } catch (error: any) {
            this.logger.error(`[Tool] report_bug error: ${error?.message || error}`);
            return { error: `Failed to create bug report: ${error?.message || 'Unknown error'}` };
          }
        },
      }),

      context_query: tool({
        description: 'Query the research intelligence system: "What do we know about X?" Returns hypotheses, experiments, evidence, contradictions, and open questions related to the query.',
        inputSchema: z.object({
          query: z.string().describe('The research question or topic to query'),
        }),
        execute: async ({ query }) => {
          this.logger.log(`[Tool] context_query called with: "${query}"`);
          const response = await this.mcpService.processRequest(
            {
              jsonrpc: '2.0',
              method: 'intelligence.query',
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
            return { error: response.error.message };
          }

          return response.result;
        },
      }),

      create_hypothesis: tool({
        description: 'Create a formal hypothesis page with predictions and success criteria. Use when the user wants to formalize a testable claim.',
        inputSchema: z.object({
          title: z.string().describe('Hypothesis title'),
          formalStatement: z.string().describe('Formal, testable statement of the hypothesis'),
          predictions: z.array(z.string()).optional().describe('Testable predictions'),
          priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
          domainTags: z.array(z.string()).optional().describe('Domain tags for categorization'),
          successCriteria: z.string().optional().describe('What would validate this hypothesis'),
        }),
        execute: async ({ title, formalStatement, predictions, priority, domainTags, successCriteria }) => {
          this.logger.log(`[Tool] create_hypothesis called: "${title}"`);
          const response = await this.mcpService.processRequest(
            {
              jsonrpc: '2.0',
              method: 'hypothesis.create',
              params: {
                title,
                formalStatement,
                predictions,
                priority,
                domainTags,
                successCriteria,
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

          return response.result;
        },
      }),

      register_experiment: tool({
        description: 'Register a new experiment linked to a hypothesis. Use when the user wants to design or plan an experiment to test a hypothesis.',
        inputSchema: z.object({
          title: z.string().describe('Experiment title'),
          hypothesisId: z.string().optional().describe('ID of the hypothesis being tested'),
          method: z.string().optional().describe('Experimental method description'),
          metrics: z.record(z.string(), z.any()).optional().describe('Metrics to measure'),
        }),
        execute: async ({ title, hypothesisId, method, metrics }) => {
          this.logger.log(`[Tool] register_experiment called: "${title}"`);
          const response = await this.mcpService.processRequest(
            {
              jsonrpc: '2.0',
              method: 'experiment.register',
              params: {
                title,
                hypothesisId,
                method,
                metrics,
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

          return response.result;
        },
      }),

      deploy_team: tool({
        description: 'Deploy a multi-agent research team from a template to the current space. Templates define agent roles (researcher, collaborator, synthesizer, etc.) with specific capabilities.',
        inputSchema: z.object({
          templateName: z.string().describe('Name of the team template to deploy (e.g. "research-team", "code-team")'),
          projectId: z.string().optional().describe('Optional project ID to scope the team to'),
        }),
        execute: async ({ templateName, projectId }) => {
          this.logger.log(`[Tool] deploy_team called: template="${templateName}"`);
          const response = await this.mcpService.processRequest(
            {
              jsonrpc: '2.0',
              method: 'team.deploy',
              params: {
                templateName,
                projectId,
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

          return response.result;
        },
      }),

      mcp_call: tool({
        description:
          'Call any MCP method directly. Use when no specialized tool exists for the requested operation.',
        inputSchema: z.object({
          method: z.string().describe('Exact MCP method name, e.g. project.create or task.list'),
          params: z
            .record(z.string(), z.any())
            .optional()
            .describe('Method parameters object'),
        }),
        execute: async ({ method, params }) => {
          const mergedParams = {
            ...(params || {}),
            workspaceId: (params as any)?.workspaceId || workspace.id,
            spaceId: (params as any)?.spaceId || dto.spaceId,
            pageId: (params as any)?.pageId || dto.pageId,
          };

          const response = await this.mcpService.processRequest(
            {
              jsonrpc: '2.0',
              method,
              params: mergedParams,
              id: Date.now(),
            },
            user,
          );

          if (response.error) {
            return {
              success: false,
              error: response.error.message,
              code: response.error.code,
              data: response.error.data,
            };
          }

          return {
            success: true,
            result: response.result,
          };
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
    this.logger.log('[Stream] Tools defined: knowledge_search, search_pages, create_task, list_projects, create_project, update_project, archive_project, delete_project, report_bug, context_query, create_hypothesis, register_experiment, deploy_team, mcp_call');

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
