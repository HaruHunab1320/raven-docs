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
import { readFileSync, existsSync, appendFileSync } from 'fs';
import { resolve } from 'path';

/** Default approval preset for swarm agents — they need autonomy to work without human input */
const DEFAULT_APPROVAL_PRESET: ApprovalPreset = 'autonomous';

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

    // Step 5: Update .gitignore
    try {
      this.updateGitignore(workspacePath, agentType);
    } catch (error: any) {
      this.logger.warn(
        `Failed to update .gitignore for execution ${executionId}: ${error.message}`,
      );
    }

    // Step 6: Return env vars + adapterConfig for spawn
    return {
      env: {
        MCP_SERVER_URL: serverUrl,
        MCP_API_KEY: apiKey,
        RAVEN_WORKSPACE_ID: workspaceId,
        RAVEN_EXECUTION_ID: executionId,
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

    return template
      .replace(/\{\{serverUrl\}\}/g, params.serverUrl)
      .replace(/\{\{apiKey\}\}/g, params.apiKey)
      .replace(/\{\{executionId\}\}/g, params.executionId)
      .replace(/\{\{workspaceId\}\}/g, params.workspaceId)
      .replace(/\{\{taskDescription\}\}/g, params.taskDescription)
      .replace(/\{\{toolCategories\}\}/g, toolCategories);
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

  private updateGitignore(
    workspacePath: string,
    agentType: string,
  ): void {
    const gitignorePath = resolve(workspacePath, '.gitignore');
    const adapter = this.getAdapter(agentType);
    const memoryFile = adapter?.memoryFilePath;

    const entriesToIgnore = [
      memoryFile,
      '.git-workspace/',
    ].filter(Boolean) as string[];

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

  private getInlineTemplate(): string {
    return `# Raven Docs — Agent Context

## Your Task
{{taskDescription}}

## Execution Info
- Execution ID: {{executionId}}
- Workspace ID: {{workspaceId}}

## Raven API Access

You have access to Raven's tool API for interacting with the platform.

**Base URL:** {{serverUrl}}/api/mcp-standard
**Auth:** \`Authorization: Bearer $MCP_API_KEY\` (available as env var)

### Discover Tools (no auth required)
\`\`\`
POST {{serverUrl}}/api/mcp-standard/search_tools
{"query": "your search term"}

POST {{serverUrl}}/api/mcp-standard/list_categories
\`\`\`

### Call a Tool (auth required)
\`\`\`
POST {{serverUrl}}/api/mcp-standard/call_tool
Authorization: Bearer $MCP_API_KEY
Content-Type: application/json

{"name": "tool_name", "arguments": {...}}
\`\`\`

### Available Tool Categories
{{toolCategories}}

Use \`search_tools\` to find the specific tool you need.

## Guidelines
- Do NOT commit API keys or injected config files
- Stay on the current git branch`;
  }
}
