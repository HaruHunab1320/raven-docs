import { Injectable, Logger } from '@nestjs/common';
import { MCPApiKeyService } from '../../integrations/mcp/services/mcp-api-key.service';
import { TOOL_CATEGORIES } from '../../integrations/mcp-standard/tool-catalog';
import {
  createAllAdapters,
  BaseCodingAdapter,
  generateApprovalConfig,
  type AdapterType,
  type ApprovalPreset,
  type ApprovalConfig,
} from 'coding-agent-adapters';
import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

/** Default approval preset for swarm agents when no workspace/team override is provided */
const DEFAULT_APPROVAL_PRESET: ApprovalPreset = 'standard';

/** Map execution agentType strings to adapter adapterType values */
const AGENT_TYPE_TO_ADAPTER: Record<string, AdapterType> = {
  'claude-code': 'claude',
  claude: 'claude',
  gemini: 'gemini',
  codex: 'codex',
  aider: 'aider',
};

@Injectable()
export class WorkspacePreparationService {
  private readonly logger = new Logger(WorkspacePreparationService.name);
  private adapterMap: Map<string, BaseCodingAdapter> | null = null;

  constructor(
    private readonly mcpApiKeyService: MCPApiKeyService,
  ) {}

  /** Lazily build a map of adapterType → adapter instance */
  private getAdapterMap(): Map<string, BaseCodingAdapter> {
    if (!this.adapterMap) {
      this.adapterMap = new Map();
      for (const adapter of createAllAdapters()) {
        this.adapterMap.set(adapter.adapterType, adapter);
      }
    }
    return this.adapterMap;
  }

  /** Resolve an execution agentType to an adapter instance */
  private getAdapter(agentType: string): BaseCodingAdapter | undefined {
    const adapterType = AGENT_TYPE_TO_ADAPTER[agentType] || agentType;
    return this.getAdapterMap().get(adapterType);
  }

  /**
   * Prepare a workspace for agent execution:
   * 1. Generate a scoped MCP API key
   * 2. Build context content from template
   * 3. Write memory file via adapter
   * 4. Write approval config files (tool permission presets)
   * 5. Update .gitignore to exclude injected files
   * 6. Return env vars + adapterConfig for the agent process
   */
  async prepareWorkspace(params: {
    workspacePath: string;
    workspaceId: string;
    executionId: string;
    agentType: string;
    triggeredBy: string;
    taskDescription: string;
    taskContext?: Record<string, any>;
    approvalPreset?: ApprovalPreset;
    enableSandbox?: boolean;
  }): Promise<{
    env: Record<string, string>;
    adapterConfig: Record<string, unknown>;
  }> {
    const {
      workspacePath,
      workspaceId,
      executionId,
      agentType,
      triggeredBy,
      taskDescription,
    } = params;
    const approvalPreset = params.approvalPreset || DEFAULT_APPROVAL_PRESET;

    // Step 1: Generate scoped MCP API key
    const keyName = `swarm-${executionId.slice(0, 8)}`;
    let apiKey: string;
    try {
      apiKey = await this.mcpApiKeyService.generateApiKey(
        triggeredBy,
        workspaceId,
        keyName,
      );
      this.logger.log(
        `Generated MCP API key "${keyName}" for execution ${executionId}`,
      );
    } catch (error: any) {
      this.logger.error(
        `Failed to generate MCP API key for execution ${executionId}: ${error.message}`,
      );
      throw error;
    }

    // Step 2: Build context content from template
    const serverUrl = process.env.APP_URL || 'http://localhost:3000';
    const content = this.buildContextContent({
      serverUrl,
      apiKey: keyName, // Don't embed the actual key — agent reads it from env
      executionId,
      workspaceId,
      taskDescription,
      taskContext: params.taskContext,
    });

    // Step 3: Write memory file
    try {
      await this.writeMemoryFile(workspacePath, agentType, content);
      this.logger.log(
        `Wrote memory file for ${agentType} agent in ${workspacePath}`,
      );
    } catch (error: any) {
      this.logger.warn(
        `Failed to write memory file for execution ${executionId}: ${error.message}`,
      );
      // Non-fatal — agent can still function without the memory file
    }

    // Step 4: Write approval config files (tool permission presets)
    let approvalEnv: Record<string, string> = {};
    try {
      const result = await this.writeApprovalConfig(
        workspacePath,
        agentType,
        approvalPreset,
      );
      approvalEnv = result.envVars;
      this.logger.log(
        `Wrote approval config (${approvalPreset}) for ${agentType}: ${result.summary}`,
      );
    } catch (error: any) {
      this.logger.warn(
        `Failed to write approval config for execution ${executionId}: ${error.message}`,
      );
    }

    // Step 5: Configure MCP servers — replace any user-global servers
    // (e.g. claude-in-chrome) with the Raven MCP bridge so agents get
    // native registered tools instead of having to use curl.
    try {
      this.configureAgentMcpServers(workspacePath, agentType, serverUrl, apiKey, params.enableSandbox, params.taskContext);
    } catch (error: any) {
      this.logger.warn(
        `Failed to configure MCP servers for execution ${executionId}: ${error.message}`,
      );
    }

    // Step 6: Update .gitignore (only for real repos — scratch dirs are ephemeral)
    if (!params.enableSandbox) {
      try {
        this.updateGitignore(workspacePath, agentType);
      } catch (error: any) {
        this.logger.warn(
          `Failed to update .gitignore for execution ${executionId}: ${error.message}`,
        );
      }
    }

    // Step 7: Return env vars + adapterConfig for spawn
    //
    // ENABLE_TOOL_SEARCH=false tells Claude Code to preload all MCP tool
    // definitions into context instead of hiding them behind on-demand search.
    // Without this, agents waste their first turns calling search_tools to
    // discover tools that are already documented in their CLAUDE.md.
    return {
      env: {
        MCP_SERVER_URL: serverUrl,
        MCP_API_KEY: apiKey,
        RAVEN_WORKSPACE_ID: workspaceId,
        RAVEN_EXECUTION_ID: executionId,
        ENABLE_TOOL_SEARCH: 'false',
        ...approvalEnv,
      },
      adapterConfig: {
        interactive: true,
        approvalPreset,
      },
    };
  }

  /**
   * Revoke the MCP API key created for an execution
   */
  async cleanupApiKey(
    executionId: string,
    triggeredBy: string,
  ): Promise<void> {
    const keyName = `swarm-${executionId.slice(0, 8)}`;
    try {
      const keys = await this.mcpApiKeyService.listApiKeys(triggeredBy);
      const match = keys.find((k) => k.name === keyName);
      if (match) {
        await this.mcpApiKeyService.revokeApiKey(match.id, triggeredBy);
        this.logger.log(
          `Revoked MCP API key "${keyName}" for execution ${executionId}`,
        );
      }
    } catch (error: any) {
      this.logger.warn(
        `Failed to revoke MCP API key for execution ${executionId}: ${error.message}`,
      );
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private buildContextContent(params: {
    serverUrl: string;
    apiKey: string;
    executionId: string;
    workspaceId: string;
    taskDescription: string;
    taskContext?: Record<string, any>;
  }): string {
    const templatePath = resolve(
      __dirname,
      'templates',
      'agent-context.md',
    );

    let template: string;
    try {
      template = readFileSync(templatePath, 'utf-8');
    } catch {
      // Fallback inline template if file read fails (e.g. in compiled dist)
      template = this.getInlineTemplate();
    }

    const toolCategories = this.buildToolCategoriesList();

    // Handle conditional sections: {{#var}}...{{{var}}}...{{/var}}
    // If the variable is truthy, include the section with the variable replaced.
    // If falsy, remove the entire section.
    const teamStructure = (params.taskContext as any)?.teamStructure as string | undefined;

    let processed = template;

    // Process conditional block for teamStructure
    if (teamStructure) {
      processed = processed
        .replace(/\{\{#teamStructure\}\}/g, '')
        .replace(/\{\{\/teamStructure\}\}/g, '')
        .replace(/\{\{\{teamStructure\}\}\}/g, teamStructure);
    } else {
      processed = processed.replace(
        /\{\{#teamStructure\}\}[\s\S]*?\{\{\/teamStructure\}\}/g,
        '',
      );
    }

    const base = processed
      .replace(/\{\{serverUrl\}\}/g, params.serverUrl)
      .replace(/\{\{apiKey\}\}/g, params.apiKey)
      .replace(/\{\{executionId\}\}/g, params.executionId)
      .replace(/\{\{workspaceId\}\}/g, params.workspaceId)
      .replace(/\{\{taskDescription\}\}/g, params.taskDescription)
      .replace(/\{\{toolCategories\}\}/g, toolCategories);

    if (!params.taskContext || Object.keys(params.taskContext).length === 0) {
      return base;
    }

    return `${base}

## Task Context
\`\`\`json
${JSON.stringify(params.taskContext, null, 2)}
\`\`\`
`;
  }

  private buildToolCategoriesList(): string {
    return Object.entries(TOOL_CATEGORIES)
      .map(([id, info]) => `- **${info.name}** (\`${id}\`): ${info.description}`)
      .join('\n');
  }

  private async writeMemoryFile(
    workspacePath: string,
    agentType: string,
    content: string,
  ): Promise<void> {
    const adapter = this.getAdapter(agentType);
    if (!adapter) {
      this.logger.warn(
        `No adapter found for agent type "${agentType}", skipping memory file`,
      );
      return;
    }

    await adapter.writeMemoryFile(workspacePath, content);
  }

  private async writeApprovalConfig(
    workspacePath: string,
    agentType: string,
    preset: ApprovalPreset,
  ): Promise<{ envVars: Record<string, string>; summary: string }> {
    const adapterType = AGENT_TYPE_TO_ADAPTER[agentType] || agentType;
    const adapter = this.getAdapter(agentType);

    // Generate the approval config for this adapter + preset
    const approvalConfig = generateApprovalConfig(
      adapterType as AdapterType,
      preset,
    );

    // Write workspace config files via the adapter
    if (adapter) {
      const spawnConfig = { adapterConfig: { approvalPreset: preset } } as any;
      await adapter.writeApprovalConfig(workspacePath, spawnConfig);
    }

    return {
      envVars: approvalConfig.envVars,
      summary: approvalConfig.summary,
    };
  }

  /**
   * Configure the Raven MCP bridge as the sole MCP server for spawned agents.
   * This replaces any user-global servers (e.g. claude-in-chrome) that would
   * cause blocking config prompts, and gives the agent native tool access to
   * the Raven API via the stdio bridge at packages/mcp-bridge.
   */
  private configureAgentMcpServers(
    workspacePath: string,
    agentType: string,
    serverUrl: string,
    apiKey: string,
    enableSandbox?: boolean,
    taskContext?: Record<string, any>,
  ): void {
    if (agentType !== 'claude' && agentType !== 'claude-code') return;

    const claudeDir = resolve(workspacePath, '.claude');
    if (!existsSync(claudeDir)) {
      mkdirSync(claudeDir, { recursive: true });
    }

    // ── MCP server config ──────────────────────────────────────────────
    // Claude Code reads MCP servers from `.mcp.json` at the project root
    // (project scope) — NOT from `.claude/settings.local.json`.
    // See: https://code.claude.com/docs/en/mcp#mcp-installation-scopes

    const monorepoRoot = resolve(__dirname, '../../../../..');
    const bridgePath = resolve(monorepoRoot, 'packages/mcp-bridge/src/index.ts');
    // Use the monorepo's tsx binary directly — avoids needing npx (which
    // requires HOME for its cache and breaks in sandboxed envs).
    const tsxBin = resolve(monorepoRoot, 'node_modules/.bin/tsx');

    const bridgeEnv: Record<string, string> = {
      MCP_SERVER_URL: serverUrl,
      MCP_API_KEY: apiKey,
    };

    // If the agent has specific capabilities, filter MCP tools to relevant
    // categories.  This keeps the tool count small so Claude Code preloads
    // all definitions instead of activating Tool Search.
    const categories = this.capabilitiesToToolCategories(
      taskContext?.capabilities,
    );
    if (categories.length > 0) {
      bridgeEnv.MCP_TOOL_CATEGORIES = categories.join(',');
    }

    const mcpConfig = {
      mcpServers: {
        'raven-docs': {
          command: tsxBin,
          args: [bridgePath],
          env: bridgeEnv,
        },
      },
    };

    const mcpJsonPath = resolve(workspacePath, '.mcp.json');
    writeFileSync(mcpJsonPath, JSON.stringify(mcpConfig, null, 2), 'utf-8');

    // ── Permissions & sandbox ──────────────────────────────────────────
    // These go in `.claude/settings.local.json` (general project settings).

    const settingsPath = resolve(claudeDir, 'settings.local.json');
    let settings: Record<string, any> = {};
    if (existsSync(settingsPath)) {
      try {
        settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      } catch {
        settings = {};
      }
    }

    // Auto-approve all Raven MCP tools so agents don't hit permission prompts.
    // Claude Code uses "mcp__<server>__<tool>" permission patterns.
    if (!settings.permissions) {
      settings.permissions = {};
    }
    const allow: string[] = settings.permissions.allow || [];
    if (!allow.some((r: string) => r.startsWith('mcp__raven-docs'))) {
      allow.push('mcp__raven-docs');
    }
    settings.permissions.allow = allow;

    // When sandbox is enabled, lock the agent down to its working directory.
    // - sandbox: restricts bash commands (filesystem writes + network)
    // - permissions: restricts Read/Edit/Glob/Grep/Write tools to the workdir
    //
    // Together these prevent the agent from accessing anything outside its
    // scratch dir regardless of which tool it uses.
    if (enableSandbox) {
      settings.sandbox = {
        enabled: true,
        autoAllowBashIfSandboxed: true,
      };

      // Permission rules use gitignore-style patterns.
      // Deny everything first, then allow the workdir subtree.
      const workdirGlob = `${workspacePath}/**`;
      settings.permissions.deny = [
        'Read(/**)',
        'Edit(/**)',
        'Write(/**)',
      ];
      settings.permissions.allow = [
        ...allow,
        `Read(${workdirGlob})`,
        `Edit(${workdirGlob})`,
        `Write(${workdirGlob})`,
        // Allow bash since it's already sandboxed
        'Bash(*)',
      ];
    }

    writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
  }

  private updateGitignore(
    workspacePath: string,
    _agentType: string,
  ): void {
    const gitignorePath = resolve(workspacePath, '.gitignore');

    // Only ignore injected config files — NOT the memory file (e.g. CLAUDE.md),
    // since the repo owner may want to commit their own CLAUDE.md.
    const entriesToIgnore = [
      '.claude/settings.local.json',
      '.git-workspace/',
    ];

    let content = '';
    if (existsSync(gitignorePath)) {
      content = readFileSync(gitignorePath, 'utf-8');
    }

    const newEntries = entriesToIgnore.filter(
      (entry) => !content.includes(entry),
    );

    if (newEntries.length > 0) {
      const addition =
        (content.endsWith('\n') || content === '' ? '' : '\n') +
        '\n# Raven agent injected files\n' +
        newEntries.join('\n') +
        '\n';
      appendFileSync(gitignorePath, addition);
    }
  }

  /**
   * Map agent capabilities (e.g. "task.create", "hypothesis.update") to the
   * MCP tool categories that contain the matching tools.  Returns an empty
   * array when capabilities are unset or contain "*" (expose everything).
   */
  private capabilitiesToToolCategories(capabilities?: string[]): string[] {
    if (!capabilities || capabilities.length === 0 || capabilities.includes('*')) {
      return []; // no filter — expose all tools
    }

    const cats = new Set<string>();

    // Always include core categories every agent needs
    cats.add('system');          // search_tools, list_categories
    cats.add('memory');          // agent memory
    cats.add('context');         // session context storage
    cats.add('search');          // full-text search
    cats.add('team_messaging');  // team_send_message, team_read_messages, team_list_team

    for (const cap of capabilities) {
      const prefix = cap.split('.')[0];
      switch (prefix) {
        case 'coordinate':
          cats.add('task');
          cats.add('research');
          cats.add('page');
          break;
        case 'task':
          cats.add('task');
          break;
        case 'page':
          cats.add('page');
          break;
        case 'hypothesis':
        case 'experiment':
        case 'openquestion':
        case 'relationship':
        case 'research':
          cats.add('research');
          break;
        case 'space':
          cats.add('space');
          break;
        case 'project':
          cats.add('project');
          break;
        case 'comment':
          cats.add('comment');
          break;
        case 'attachment':
          cats.add('attachment');
          break;
        case 'coding':
        case 'code':
          cats.add('coding_swarm');
          break;
        case 'team':
          cats.add('team_messaging');
          break;
        case 'github':
          cats.add('github_issues');
          break;
      }
    }

    return Array.from(cats);
  }

  private getInlineTemplate(): string {
    return `# Raven Docs — Agent Context

## Your Task
{{taskDescription}}

## Execution Info
- Execution ID: {{executionId}}
- Workspace ID: {{workspaceId}}

## Raven MCP Tools

You have **native MCP tools** for interacting with Raven Docs. Call them directly like any other tool — no curl or HTTP needed.

Your tools are already loaded and ready to use. Your workflow guide (in the task description above) shows the specific tools and usage patterns for your role — **start there, do not search for tools first**.

### Tool Discovery
- **\`search_tools\`** — Search for tools by keyword. Only use this if you need a tool not already shown in your workflow guide.
- **\`list_categories\`** — List all tool categories with descriptions and tool counts.

### Available Tool Categories
{{toolCategories}}

## Guidelines
- Call tools directly as MCP tools — do NOT use curl or HTTP requests
- Your workflow guide (in the task description) shows the specific tools and flows for your role — use them directly
- Do NOT commit API keys or injected config files
- Stay on the current git branch`;
  }
}
