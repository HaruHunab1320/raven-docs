import {
  Injectable,
  Logger,
  Optional,
  OnModuleDestroy,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PTYManager, TerminalAttachment, ToolRunningInfo, StallClassification as PTYStallClassification, type AutoResponseRule } from 'pty-manager';
import { PTYConsoleBridge } from 'pty-console';
import { createAllAdapters, checkAdapters } from 'coding-agent-adapters';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ParallaxAgentsService } from '../parallax-agents/parallax-agents.service';
import { StallClassifierService } from './stall-classifier.service';

export interface AgentSpawnConfig {
  type: string;
  name: string;
  workdir: string;
  env?: Record<string, string>;
  adapterConfig?: Record<string, unknown>;
  timeout?: number;
  /** Override adapter's readySettleMs — ms of output silence after
   *  detectReady before the session is considered ready for input. */
  readySettleMs?: number;
  /** When false, the spawned agent only gets explicit env vars — no parent process secrets leak. */
  inheritProcessEnv?: boolean;
}

@Injectable()
export class AgentExecutionService implements OnModuleDestroy {
  private readonly logger = new Logger(AgentExecutionService.name);
  private readonly agentTypeAliases: Record<string, string> = {
    'claude-code': 'claude',
    claudecode: 'claude',
    claude_code: 'claude',
    'gemini-cli': 'gemini',
    gemini_cli: 'gemini',
    'gpt-codex': 'codex',
    'openai-codex': 'codex',
  };
  private readonly agentTypeCommands: Record<string, string> = {
    claude: 'claude',
    gemini: 'gemini',
    codex: 'codex',
    aider: 'aider',
  };
  private ptyManager: PTYManager | null = null;
  private consoleBridge: PTYConsoleBridge | null = null;
  readonly mode: 'local' | 'remote';
  private readonly sessionWorkspaceMap = new Map<string, string>();
  private readonly interruptCooldownBySession = new Map<string, number>();

  constructor(
    private readonly eventEmitter: EventEmitter2,
    @Optional() private readonly parallaxAgentsService: ParallaxAgentsService,
    @Optional() private readonly stallClassifier: StallClassifierService,
  ) {
    this.mode = process.env.AGENT_RUNTIME_ENDPOINT ? 'remote' : 'local';

    if (this.mode === 'local') {
      this.ptyManager = new PTYManager({
        maxLogLines: 2000,
        stallDetectionEnabled: true,
        stallTimeoutMs: 15_000,
        ...(this.stallClassifier
          ? {
              onStallClassify: (sessionId: string, output: string, stallMs: number) =>
                this.classifyStall(sessionId, output, stallMs),
            }
          : {}),
      });

      // Register all coding agent adapters
      for (const adapter of createAllAdapters()) {
        this.ptyManager.registerAdapter(adapter);
      }

      // Bridge PTY manager output/status into a console-oriented stream.
      this.consoleBridge = new PTYConsoleBridge(this.ptyManager, {
        maxBufferedCharsPerSession: 100_000,
      });

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

        // Check output buffer for login patterns that the stall timer never caught
        // (e.g. Claude exits immediately with "Not logged in · Please run /login")
        let loginDetected = false;
        const ptySession = this.ptyManager.getSession(session.id);
        if (ptySession) {
          try {
            const outputBuffer = ptySession.getOutputBuffer();

            // Try adapter detection first (covers all adapter-specific patterns)
            const adapter = this.ptyManager.adapters.get(session.type);
            if (adapter) {
              const loginResult = adapter.detectLogin(outputBuffer);
              if (loginResult?.required) {
                loginDetected = true;
              }
            }

            // Fallback: direct pattern match for common login-required strings
            // that older adapter versions may not recognize
            if (!loginDetected) {
              const stripped = outputBuffer.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
              if (
                stripped.includes('Not logged in') ||
                stripped.includes('Please run /login') ||
                stripped.includes('please log in') ||
                stripped.includes('run /login')
              ) {
                loginDetected = true;
              }
            }

            if (loginDetected) {
              this.logger.warn(`Agent login required (detected on exit): ${session.id}`);
              this.eventEmitter.emit('parallax.login_required', {
                workspaceId,
                agentId: session.id,
                instructions: 'Claude Code requires authentication. Run "claude login" in your terminal.',
              });
            }
          } catch {
            // Best-effort — don't block the stopped handler
          }
        }

        this.eventEmitter.emit('parallax.agent_stopped', {
          workspaceId,
          agentId: session.id,
          reason,
          exitCode: session.exitCode,
          loginDetected,
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

      this.ptyManager.on('blocking_prompt', (session, promptInfo) => {
        const workspaceId = this.sessionWorkspaceMap.get(session.id);
        if (promptInfo?.autoResponded) return;
        this.logger.warn(`Blocking prompt detected: ${session.id}`);
        this.eventEmitter.emit('parallax.blocking_prompt', {
          workspaceId,
          agentId: session.id,
          runtimeSessionId: session.id,
          promptInfo,
        });
      });

      this.ptyManager.on('task_complete', (session, result) => {
        const workspaceId = this.sessionWorkspaceMap.get(session.id);
        this.logger.log(`Task complete detected: ${session.id}`);
        this.eventEmitter.emit('parallax.task_complete', {
          workspaceId,
          agentId: session.id,
          runtimeSessionId: session.id,
          result,
        });
      });

      this.ptyManager.on('tool_running', (session, info) => {
        void this.handleToolRunningEvent(session.id, info);
      });

      this.logger.log('AgentExecutionService initialized in LOCAL mode');
    } else {
      this.logger.log(
        `AgentExecutionService initialized in REMOTE mode → ${process.env.AGENT_RUNTIME_ENDPOINT}`,
      );
    }
  }

  private isAutoInterruptEnabled(): boolean {
    const raw =
      process.env.TEAM_AUTO_INTERRUPT_TOOL_RUNNING ??
      process.env.SWARM_AUTO_INTERRUPT_TOOL_RUNNING ??
      'true';
    return raw.toLowerCase() !== 'false';
  }

  private async handleToolRunningEvent(
    sessionId: string,
    info: ToolRunningInfo,
  ): Promise<void> {
    const workspaceId = this.sessionWorkspaceMap.get(sessionId);
    const autoInterruptEnabled = this.isAutoInterruptEnabled();
    const toolName = info.toolName || 'unknown';

    // Skip status-line indicators that aren't actual tool execution.
    // e.g. "Claude in Chrome enabled" is a startup status line, not an active
    // tool — real tool use includes a [*_tool] suffix in the description.
    if (this.isNonActionableToolIndicator(info)) {
      this.logger.debug(
        `Ignoring status-line tool indicator for session ${sessionId} (${info.description})`,
      );
      return;
    }

    this.logger.warn(
      `Detected tool-running session ${sessionId} (tool=${toolName})`,
    );

    this.eventEmitter.emit('parallax.tool_running', {
      workspaceId,
      agentId: sessionId,
      info,
      autoInterruptEnabled,
    });

    if (!autoInterruptEnabled) {
      this.eventEmitter.emit('parallax.tool_attention_required', {
        workspaceId,
        agentId: sessionId,
        reason: 'auto_interrupt_disabled',
        info,
      });
      return;
    }

    const now = Date.now();
    const lastInterrupt = this.interruptCooldownBySession.get(sessionId) || 0;
    if (now - lastInterrupt < 1500) {
      return;
    }
    this.interruptCooldownBySession.set(sessionId, now);

    const interrupted = this.tryInterruptSession(sessionId);
    this.eventEmitter.emit('parallax.tool_interrupted', {
      workspaceId,
      agentId: sessionId,
      info,
      interrupted,
      method: interrupted ? 'sendKeys(ctrl+c)' : 'none',
    });

    if (!interrupted) {
      this.eventEmitter.emit('parallax.tool_attention_required', {
        workspaceId,
        agentId: sessionId,
        reason: 'interrupt_failed',
        info,
      });
    }
  }

  private isNonActionableToolIndicator(info: ToolRunningInfo): boolean {
    const tool = (info.toolName || '').toLowerCase();
    const description = info.description || '';
    const desc = description.toLowerCase();
    const hasExplicitToolInvocation = /\[[a-z0-9_]+_tool\]/i.test(description);

    // Claude startup status line:
    // "Claude in Chrome enabled · /chrome"
    // Never treat this as an active tool unless an explicit [*_tool] marker exists.
    if (tool === 'chrome' && !hasExplicitToolInvocation) {
      return true;
    }

    // Defensive ignore for startup/info bar snippets that can bleed into matcher input.
    if (
      !hasExplicitToolInvocation &&
      (desc.includes('claude in chrome enabled') ||
        desc.includes('? for shortcuts') ||
        desc.includes('/chrome') ||
        desc.includes('update available! run: brew upgrade claude-code'))
    ) {
      return true;
    }

    return false;
  }

  private tryInterruptSession(sessionId: string): boolean {
    if (!this.ptyManager) return false;
    const session = this.ptyManager.getSession(sessionId);
    if (!session) return false;

    try {
      session.sendKeys('ctrl+c');
      setTimeout(() => {
        try {
          const s = this.ptyManager?.getSession(sessionId);
          s?.sendKeys('ctrl+c');
        } catch {
          // best effort follow-up interrupt
        }
      }, 250);
      return true;
    } catch {
      return false;
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
      const normalizedType = this.normalizeAgentType(config.type);

      const installation = await this.checkInstallation(normalizedType);
      if (!installation.available) {
        const installHint = installation.info?.installCommand
          ? ` Install command: ${installation.info.installCommand}`
          : '';
        throw new Error(
          `Coding CLI for adapter "${normalizedType}" is not installed or not available in PATH.${installHint}`,
        );
      }

      // Override env vars that prevent agent nesting
      // PTYManager merges env with process.env, so we set these to empty to override
      // (e.g. Claude Code refuses to launch inside another Claude Code session)
      const nestingOverrides: Record<string, string> = {
        CLAUDECODE: '',
        CLAUDE_CODE_SESSION: '',
        CLAUDE_CODE_ENTRYPOINT: '',
      };
      const spawnPath = this.buildSpawnPath(config.env);
      const spawnEnv = {
        ...nestingOverrides,
        ...(config.env || {}),
        PATH: spawnPath,
      };

      const command = this.getCommandForAgentType(normalizedType);
      if (command && !this.commandExists(command, spawnPath)) {
        throw new Error(
          `Coding CLI for adapter "${normalizedType}" was not found in backend PATH. ` +
            `Command "${command}" is missing. Set TEAM_AGENT_EXTRA_PATHS or SWARM_AGENT_EXTRA_PATHS to include its bin directory.`,
        );
      }

      let session: any;
      try {
        session = await this.ptyManager.spawn({
          type: normalizedType,
          name: config.name,
          workdir: config.workdir,
          env: spawnEnv,
          adapterConfig: config.adapterConfig,
          timeout: config.timeout,
          readySettleMs: config.readySettleMs,
          inheritProcessEnv: config.inheritProcessEnv,
        });
      } catch (error: any) {
        const rawMessage = String(error?.message || '');
        if (rawMessage.toLowerCase().includes('posix_spawnp failed')) {
          throw new Error(
            `Failed to spawn ${normalizedType} CLI. Command not found or not executable in backend PATH (checked command "${command ?? normalizedType}").`,
          );
        }
        throw error;
      }

      this.sessionWorkspaceMap.set(session.id, workspaceId);
      this.logger.log(
        `Spawned local agent ${session.id} (${normalizedType}) in ${config.workdir}`,
      );

      return { id: session.id };
    }

    // Remote mode — delegate to ParallaxAgentsService
    const spawnResult = await this.parallaxAgentsService.spawnAgents(
      workspaceId,
      {
        agentType: this.normalizeAgentType(config.type),
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
      const session = this.ptyManager.getSession(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }
      // Flatten newlines to spaces — Claude Code enters multi-line mode on
      // \n which makes Enter add a newline instead of submitting.
      const flattened = message.replace(/\n+/g, ' ').trim();
      // Write text first, then wait for the TUI to process the paste before
      // pressing Enter.  ptyManager.send() only waits 50ms which is too short
      // for Claude Code's Ink-based TUI to digest a large paste.
      session.writeRaw(flattened);
      const enterDelayMs = Number(process.env.AGENT_SEND_ENTER_DELAY_MS) || 500;
      await new Promise((r) => setTimeout(r, enterDelayMs));
      session.sendKeys('enter');
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
   * Wait for a session to become ready (adapter detectReady fires).
   * Resolves when `session_ready` fires for the given sessionId, or rejects on
   * timeout / session_stopped / session_error.
   */
  waitForReady(
    sessionId: string,
    timeoutMs = 60_000,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!this.ptyManager) {
        return reject(new Error('PTYManager not initialized'));
      }

      let settled = false;
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        cleanup();
        fn();
      };

      const onReady = (session: any) => {
        if (session.id === sessionId) settle(resolve);
      };
      const onStopped = (session: any, reason?: string) => {
        if (session.id === sessionId)
          settle(() => reject(new Error(`Session stopped before ready: ${reason || 'unknown'}`)));
      };
      const onError = (session: any, error?: string) => {
        if (session.id === sessionId)
          settle(() => reject(new Error(`Session error before ready: ${error || 'unknown'}`)));
      };

      const timer = setTimeout(() => {
        settle(() => reject(new Error(`Timed out waiting for session ${sessionId} to become ready (${timeoutMs}ms)`)));
      }, timeoutMs);

      const cleanup = () => {
        clearTimeout(timer);
        this.ptyManager?.off('session_ready', onReady);
        this.ptyManager?.off('session_stopped', onStopped);
        this.ptyManager?.off('session_error', onError);
      };

      this.ptyManager.on('session_ready', onReady);
      this.ptyManager.on('session_stopped', onStopped);
      this.ptyManager.on('session_error', onError);
    });
  }

  /**
   * Send special keys to a session (local mode only)
   */
  sendKeys(sessionId: string, keys: string | string[]): void {
    if (!this.ptyManager) {
      throw new Error('PTYManager not initialized');
    }
    const session = (this.ptyManager as any).sessions?.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    session.sendKeys(keys);
  }

  /**
   * Add a per-session auto-response rule (local mode only).
   * Rules are checked before adapter-level rules when a blocking prompt is detected.
   */
  addAutoResponseRule(sessionId: string, rule: AutoResponseRule): void {
    if (!this.ptyManager) {
      throw new Error('PTYManager not initialized');
    }
    this.ptyManager.addAutoResponseRule(sessionId, rule);
  }

  /**
   * Get the raw output buffer for a session (local mode only).
   * Returns an empty string if the session is not found or not in local mode.
   */
  getOutputBuffer(sessionId: string): string {
    if (!this.ptyManager) return '';
    const session = (this.ptyManager as any).sessions?.get(sessionId);
    if (!session) return '';
    try {
      return session.getOutputBuffer() || '';
    } catch {
      return '';
    }
  }

  /**
   * Get the number of output lines in a session's buffer (local mode only).
   * Returns 0 if the session is not found or not in local mode.
   */
  getOutputBufferLineCount(sessionId: string): number {
    if (!this.ptyManager) return 0;
    const session = (this.ptyManager as any).sessions?.get(sessionId);
    if (!session) return 0;
    try {
      const buffer: string = session.getOutputBuffer();
      return buffer ? buffer.split('\n').length : 0;
    } catch {
      return 0;
    }
  }

  /**
   * Force a stall classification for a session — used by team completion
   * checks when the PTY stall timer hasn't fired (e.g. terminal escape
   * sequences keep the output "active").
   */
  async forceClassifySession(
    sessionId: string,
    context?: { agentType?: string; role?: string },
  ): Promise<void> {
    if (!this.ptyManager || !this.stallClassifier) return;
    const session = (this.ptyManager as any).sessions?.get(sessionId);
    if (!session) return;
    try {
      const buffer: string = session.getOutputBuffer?.() || '';
      const output = buffer.slice(-2000);
      if (!output) return;
      await this.classifyStall(sessionId, output, 0);
    } catch {
      // best-effort
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
      if (!this.consoleBridge) return null;
      const session = this.consoleBridge.getSession(sessionId);
      if (!session) return null;

      const attachment: TerminalAttachment = {
        onData: (callback: (data: string) => void) => {
          const handler = (event: { sessionId: string; data: string }) => {
            if (event.sessionId === sessionId) {
              callback(event.data);
            }
          };
          this.consoleBridge?.on('session_output', handler);
          return () => this.consoleBridge?.off('session_output', handler);
        },
        write: (data: string) => {
          this.consoleBridge?.writeRaw(sessionId, data);
        },
        resize: (cols: number, rows: number) => {
          this.consoleBridge?.resize(sessionId, cols, rows);
        },
      };
      return attachment;
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
      const normalizedType = this.normalizeAgentType(agentType);
      const command = this.getCommandForAgentType(normalizedType);
      const pathValue = this.buildSpawnPath();
      const commandFound = command ? this.commandExists(command, pathValue) : false;
      const results = await checkAdapters([normalizedType as any]);
      const result = results[0];
      return {
        available: commandFound || (result?.installed ?? false),
        info: {
          ...result,
          command,
          commandFound,
        },
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

  private async classifyStall(
    sessionId: string,
    output: string,
    stallMs: number,
  ): Promise<PTYStallClassification | null> {
    if (!this.stallClassifier) return null;

    try {
      const classification = await this.stallClassifier.classify(output, stallMs);
      const workspaceId = this.sessionWorkspaceMap.get(sessionId);

      this.logger.log(
        `Stall classification for ${sessionId}: ${classification.state} (confidence=${classification.confidence})`,
      );

      if (classification.confidence < this.stallClassifier.confidenceThreshold) {
        return null;
      }

      this.eventEmitter.emit('parallax.stall_classified', {
        workspaceId,
        agentId: sessionId,
        runtimeSessionId: sessionId,
        classification,
      });

      // Emit additional Raven events for downstream listeners
      if (classification.state === 'waiting_for_input') {
        this.eventEmitter.emit('parallax.blocking_prompt', {
          workspaceId,
          agentId: sessionId,
          runtimeSessionId: sessionId,
          promptInfo: {
            type: 'stall_detected',
            prompt: classification.prompt,
            suggestedResponse: classification.suggestedResponse,
          },
        });
      } else if (classification.state === 'task_complete') {
        this.eventEmitter.emit('parallax.task_complete', {
          workspaceId,
          agentId: sessionId,
          runtimeSessionId: sessionId,
          result: { reason: 'stall_classified_complete', reasoning: classification.reasoning },
        });
      }

      // Map our internal classification to PTY manager's expected format
      const ptyState = classification.state === 'tool_running' ? 'still_working' : classification.state;
      return {
        state: ptyState as PTYStallClassification['state'],
        prompt: classification.prompt,
        suggestedResponse: classification.suggestedResponse,
      };
    } catch (error: any) {
      this.logger.warn(`Stall classification error for ${sessionId}: ${error?.message}`);
      return null;
    }
  }

  /**
   * Shutdown — clean up all sessions
   */
  async onModuleDestroy() {
    if (this.mode === 'local' && this.ptyManager) {
      this.logger.log('Shutting down PTYManager...');
      if (this.consoleBridge) {
        this.consoleBridge.close();
        this.consoleBridge = null;
      }
      await this.ptyManager.shutdown();
      this.sessionWorkspaceMap.clear();
    }
  }

  private normalizeAgentType(value: string): string {
    const raw = String(value || '')
      .trim()
      .toLowerCase();
    if (!raw) return 'claude';
    return this.agentTypeAliases[raw] || raw;
  }

  private getCommandForAgentType(agentType: string): string | null {
    return this.agentTypeCommands[agentType] || null;
  }

  private buildSpawnPath(env?: Record<string, string>): string {
    const delimiter = path.delimiter;
    const home = os.homedir();
    const configuredExtra = [
      process.env.TEAM_AGENT_EXTRA_PATHS || '',
      process.env.SWARM_AGENT_EXTRA_PATHS || '',
    ]
      .join(delimiter)
      .split(/[,:]/)
      .map((part) => part.trim())
      .filter(Boolean);

    const commonBins = [
      '/opt/homebrew/bin',
      '/usr/local/bin',
      '/usr/bin',
      '/bin',
      path.join(home, '.local', 'bin'),
      path.join(home, '.npm-global', 'bin'),
      path.join(home, '.nvm', 'current', 'bin'),
      path.join(home, '.bun', 'bin'),
      path.join(home, '.cargo', 'bin'),
    ];

    const entries = [
      ...(String(env?.PATH || '').split(delimiter).filter(Boolean) as string[]),
      ...(String(process.env.PATH || '')
        .split(delimiter)
        .filter(Boolean) as string[]),
      ...configuredExtra,
      ...commonBins,
    ];

    const deduped: string[] = [];
    const seen = new Set<string>();
    for (const entry of entries) {
      const normalized = entry.trim();
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      deduped.push(normalized);
    }
    return deduped.join(delimiter);
  }

  private commandExists(command: string, pathValue: string): boolean {
    if (!command) return false;
    if (path.isAbsolute(command)) {
      try {
        fs.accessSync(command, fs.constants.X_OK);
        return true;
      } catch {
        return false;
      }
    }

    for (const dir of pathValue.split(path.delimiter)) {
      const full = path.join(dir, command);
      try {
        fs.accessSync(full, fs.constants.X_OK);
        return true;
      } catch {
        // continue
      }
    }
    return false;
  }
}
