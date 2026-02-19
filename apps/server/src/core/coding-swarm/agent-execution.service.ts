import {
  Injectable,
  Logger,
  Optional,
  OnModuleDestroy,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PTYManager } from 'pty-manager';
import { createAllAdapters, checkAdapters } from 'coding-agent-adapters';
import { ParallaxAgentsService } from '../parallax-agents/parallax-agents.service';

export interface AgentSpawnConfig {
  type: string;
  name: string;
  workdir: string;
  env?: Record<string, string>;
  adapterConfig?: Record<string, unknown>;
  timeout?: number;
}

@Injectable()
export class AgentExecutionService implements OnModuleDestroy {
  private readonly logger = new Logger(AgentExecutionService.name);
  private ptyManager: PTYManager | null = null;
  readonly mode: 'local' | 'remote';
  private readonly sessionWorkspaceMap = new Map<string, string>();

  constructor(
    private readonly eventEmitter: EventEmitter2,
    @Optional() private readonly parallaxAgentsService: ParallaxAgentsService,
  ) {
    this.mode = process.env.AGENT_RUNTIME_ENDPOINT ? 'remote' : 'local';

    if (this.mode === 'local') {
      this.ptyManager = new PTYManager({
        maxLogLines: 2000,
        stallDetectionEnabled: true,
        stallTimeoutMs: 30000,
      });

      // Register all coding agent adapters
      for (const adapter of createAllAdapters()) {
        this.ptyManager.registerAdapter(adapter);
      }

      // Bridge PTYManager events → Raven event system
      this.ptyManager.on('session_ready', (session) => {
        const workspaceId = this.sessionWorkspaceMap.get(session.id);
        this.logger.log(`Agent session ready: ${session.id}`);
        this.eventEmitter.emit('parallax.agent_ready', {
          workspaceId,
          agentId: session.id,
          agent: session,
        });
      });

      this.ptyManager.on('session_stopped', (session, reason) => {
        const workspaceId = this.sessionWorkspaceMap.get(session.id);
        this.logger.log(
          `Agent session stopped: ${session.id} (${reason})`,
        );
        this.eventEmitter.emit('parallax.agent_stopped', {
          workspaceId,
          agentId: session.id,
          reason,
          exitCode: session.exitCode,
        });
        this.sessionWorkspaceMap.delete(session.id);
      });

      this.ptyManager.on('session_error', (session, error) => {
        const workspaceId = this.sessionWorkspaceMap.get(session.id);
        this.logger.error(`Agent session error: ${session.id} — ${error}`);
        this.eventEmitter.emit('parallax.agent_error', {
          workspaceId,
          agentId: session.id,
          error,
        });
      });

      this.ptyManager.on('login_required', (session, instructions, url) => {
        const workspaceId = this.sessionWorkspaceMap.get(session.id);
        this.logger.warn(`Agent login required: ${session.id}`);
        this.eventEmitter.emit('parallax.login_required', {
          workspaceId,
          agentId: session.id,
          url,
          instructions,
        });
      });

      this.logger.log('AgentExecutionService initialized in LOCAL mode');
    } else {
      this.logger.log(
        `AgentExecutionService initialized in REMOTE mode → ${process.env.AGENT_RUNTIME_ENDPOINT}`,
      );
    }
  }

  /**
   * Spawn a coding agent session
   */
  async spawn(
    workspaceId: string,
    config: AgentSpawnConfig,
    triggeredBy?: string,
  ): Promise<{ id: string }> {
    if (this.mode === 'local') {
      if (!this.ptyManager) {
        throw new Error('PTYManager not initialized');
      }

      // Override env vars that prevent agent nesting
      // PTYManager merges env with process.env, so we set these to empty to override
      // (e.g. Claude Code refuses to launch inside another Claude Code session)
      const nestingOverrides: Record<string, string> = {
        CLAUDECODE: '',
        CLAUDE_CODE_SESSION: '',
        CLAUDE_CODE_ENTRYPOINT: '',
      };
      const spawnEnv = config.env
        ? { ...nestingOverrides, ...config.env }
        : nestingOverrides;

      const session = await this.ptyManager.spawn({
        type: config.type,
        name: config.name,
        workdir: config.workdir,
        env: spawnEnv,
        adapterConfig: config.adapterConfig,
        timeout: config.timeout,
      });

      this.sessionWorkspaceMap.set(session.id, workspaceId);
      this.logger.log(
        `Spawned local agent ${session.id} (${config.type}) in ${config.workdir}`,
      );

      return { id: session.id };
    }

    // Remote mode — delegate to ParallaxAgentsService
    const spawnResult = await this.parallaxAgentsService.spawnAgents(
      workspaceId,
      {
        agentType: config.type,
        count: 1,
        name: config.name,
        config: { workdir: config.workdir },
      },
      triggeredBy || 'system',
    );

    const agentId = spawnResult.spawnedAgents?.[0]?.id;
    return { id: agentId };
  }

  /**
   * Send a message/task to a running agent
   */
  async send(
    sessionId: string,
    message: string,
    workspaceId?: string,
  ): Promise<void> {
    if (this.mode === 'local') {
      if (!this.ptyManager) {
        throw new Error('PTYManager not initialized');
      }
      this.ptyManager.send(sessionId, message);
      return;
    }

    // Remote mode — send via HTTP
    const endpoint = process.env.AGENT_RUNTIME_ENDPOINT;
    const response = await fetch(`${endpoint}/api/agents/${sessionId}/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(workspaceId ? { 'X-Workspace-Id': workspaceId } : {}),
      },
      body: JSON.stringify({ message }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Runtime returned ${response.status}: ${errorText}`);
    }
  }

  /**
   * Stop a running agent session
   */
  async stop(sessionId: string, workspaceId?: string): Promise<void> {
    if (this.mode === 'local') {
      if (!this.ptyManager) {
        throw new Error('PTYManager not initialized');
      }
      await this.ptyManager.stop(sessionId);
      return;
    }

    // Remote mode
    const endpoint = process.env.AGENT_RUNTIME_ENDPOINT;
    const response = await fetch(`${endpoint}/api/agents/${sessionId}/stop`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(workspaceId ? { 'X-Workspace-Id': workspaceId } : {}),
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Runtime returned ${response.status}: ${errorText}`);
    }
  }

  /**
   * Get output logs from a session
   */
  async getLogs(
    sessionId: string,
    limit?: number,
  ): Promise<string[]> {
    if (this.mode === 'local') {
      if (!this.ptyManager) {
        throw new Error('PTYManager not initialized');
      }

      const lines: string[] = [];
      for await (const line of this.ptyManager.logs(sessionId)) {
        lines.push(line);
        if (limit && lines.length >= limit) break;
      }
      return lines;
    }

    // Remote mode — no local logs, return empty
    return [];
  }

  /**
   * Get a session handle
   */
  getSession(sessionId: string): any | null {
    if (this.mode === 'local') {
      return this.ptyManager?.get(sessionId) ?? null;
    }
    return null;
  }

  /**
   * Attach to a session's terminal for raw I/O streaming
   */
  attachTerminal(sessionId: string): any | null {
    if (this.mode === 'local') {
      return this.ptyManager?.attachTerminal(sessionId) ?? null;
    }
    return null;
  }

  /**
   * Check if a coding agent CLI is installed and available
   */
  async checkInstallation(
    agentType: string,
  ): Promise<{ available: boolean; info?: any }> {
    if (this.mode === 'local') {
      const results = await checkAdapters([agentType as any]);
      const result = results[0];
      return {
        available: result?.installed ?? false,
        info: result,
      };
    }

    // Remote mode — health check
    try {
      const endpoint = process.env.AGENT_RUNTIME_ENDPOINT;
      const response = await fetch(`${endpoint}/api/health`);
      return { available: response.ok };
    } catch {
      return { available: false };
    }
  }

  /**
   * Shutdown — clean up all sessions
   */
  async onModuleDestroy() {
    if (this.mode === 'local' && this.ptyManager) {
      this.logger.log('Shutting down PTYManager...');
      await this.ptyManager.shutdown();
      this.sessionWorkspaceMap.clear();
    }
  }
}
