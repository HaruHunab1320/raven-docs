import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ParallaxClient } from '@parallaxai/client';
import { serializeOrgPatternToYaml, toParallaxOrgPattern } from './org-pattern-serializer';
import type { OrgPattern } from '../team/org-chart.types';
import type {
  AgentStatus,
  AgentLogEntry,
  AgentHandle,
} from '@parallaxai/runtime-interface';

export type { AgentStatus, AgentLogEntry, AgentHandle };

export interface ParallaxExecutionRequest {
  patternName: string;
  input: Record<string, unknown>;
  options?: {
    timeout?: number;
    stream?: boolean;
    credentials?: {
      type: 'pat' | 'oauth';
      token: string;
    };
  };
  webhook?: {
    url: string;
  };
  /** Extra env vars to inject into every spawned agent pod */
  agentEnv?: Record<string, string>;
  /** Context files to write into agent workdir on init */
  contextFiles?: Array<{ path: string; content: string }>;
}

export interface ParallaxExecutionResult {
  id: string;
  status: string;
  message?: string;
  streamUrl?: string;
  webhookConfigured?: boolean;
}

export interface ParallaxExecutionStatus {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  patternName: string;
  startTime?: string;
  endTime?: string;
  result?: unknown;
  confidence?: number;
  agents?: Array<{
    id: string;
    role: string;
    status: AgentStatus;
    endpoint?: string;
  }>;
  metrics?: {
    totalExecutions?: number;
    agentsUsed?: number;
    averageConfidence?: number;
    executionTime?: number;
  };
  error?: string;
}

export interface ParallaxPatternUploadResult {
  success: boolean;
  name: string;
  version?: string;
  error?: string;
}

export interface ParallaxThread {
  id: string;
  executionId: string;
  agentType: string;
  name: string;
  role?: string;
  status: string;
  objective?: string;
  metadata?: Record<string, unknown>;
}

export interface SpawnThreadOptions {
  executionId: string;
  agentType: string;
  name: string;
  role?: string;
  objective: string;
  environment?: Record<string, string>;
  metadata?: Record<string, unknown>;
}

/**
 * Client service for communicating with the Parallax control plane.
 *
 * When PARALLAX_API_KEY + PARALLAX_CONTROL_PLANE_URL are set (deployed mode):
 *   - Uses @parallaxai/client SDK for all API calls
 *   - Supports thread-based long-running agent sessions
 *
 * When not configured, isAvailable() returns false and callers fall back
 * to local PTY-based agent execution.
 */
@Injectable()
export class ParallaxClientService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ParallaxClientService.name);
  private controlPlaneUrl: string | null = null;
  private runtimeEndpoint: string | null = null;
  private healthy = false;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private _sdkClient: ParallaxClient | null = null;

  onModuleInit() {
    this.controlPlaneUrl = process.env.PARALLAX_CONTROL_PLANE_URL || null;
    this.runtimeEndpoint = process.env.AGENT_RUNTIME_ENDPOINT || null;

    if (this.controlPlaneUrl) {
      const apiKey = process.env.PARALLAX_API_KEY;

      this._sdkClient = new ParallaxClient({
        baseUrl: this.controlPlaneUrl,
        ...(apiKey ? { apiKey } : {}),
        timeout: 30_000,
        retries: 2,
      });

      this.logger.log(
        `Parallax control plane configured: ${this.controlPlaneUrl} ` +
        `(SDK auth: ${apiKey ? 'API key' : 'none'})`,
      );
      this.startHealthCheck();
    } else {
      this.logger.log('Parallax not configured — local PTY mode');
    }
  }

  onModuleDestroy() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Status / availability
  // ═══════════════════════════════════════════════════════════════════════

  isAvailable(): boolean {
    return !!this.controlPlaneUrl && this.healthy;
  }

  isRuntimeConfigured(): boolean {
    return !!this.runtimeEndpoint;
  }

  /** Whether SDK is ready for thread-based operations. */
  get isSdkAvailable(): boolean {
    return !!this._sdkClient && this.healthy;
  }

  /** Raw SDK client for direct use by other services. */
  get sdkClient(): ParallaxClient | null {
    return this._sdkClient;
  }

  getControlPlaneUrl(): string | null {
    return this.controlPlaneUrl;
  }

  getRuntimeEndpoint(): string | null {
    return this.runtimeEndpoint;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Pattern Management
  // ═══════════════════════════════════════════════════════════════════════

  async uploadOrgPattern(
    orgPattern: OrgPattern,
    overwrite = true,
  ): Promise<ParallaxPatternUploadResult> {
    if (!this._sdkClient) {
      throw new Error('Parallax control plane not configured');
    }

    const content = serializeOrgPatternToYaml(orgPattern);
    const filename = `${orgPattern.name.replace(/\s+/g, '-').toLowerCase()}.yaml`;

    this.logger.log(`Uploading org pattern "${orgPattern.name}" to Parallax`);

    try {
      const result = await this._sdkClient.patterns.upload({ filename, content, overwrite });
      this.logger.log(`Pattern "${orgPattern.name}" uploaded successfully`);
      return {
        success: true,
        name: orgPattern.name,
        version: orgPattern.version,
        ...(result as object),
      };
    } catch (error: any) {
      this.logger.error(`Failed to upload pattern: ${error.message}`);
      return {
        success: false,
        name: orgPattern.name,
        error: error.message,
      };
    }
  }

  async uploadOrgPatternDirect(
    orgPattern: OrgPattern,
  ): Promise<ParallaxPatternUploadResult> {
    if (!this._sdkClient) {
      throw new Error('Parallax control plane not configured');
    }

    const parallaxPattern = toParallaxOrgPattern(orgPattern);
    this.logger.log(`Uploading org pattern "${orgPattern.name}" directly to Parallax`);

    try {
      const result = await this._sdkClient.patterns.create(parallaxPattern as any);
      return {
        success: true,
        name: orgPattern.name,
        version: orgPattern.version,
        ...(result as object),
      };
    } catch (error: any) {
      return {
        success: false,
        name: orgPattern.name,
        error: error.message,
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Execution Management
  // ═══════════════════════════════════════════════════════════════════════

  async executePattern(
    request: ParallaxExecutionRequest,
  ): Promise<ParallaxExecutionResult> {
    if (!this._sdkClient) {
      throw new Error('Parallax control plane not configured');
    }

    this.logger.log(`Executing pattern "${request.patternName}"`);

    const result = await this._sdkClient.executions.create({
      patternName: request.patternName,
      input: {
        ...request.input,
        ...(request.agentEnv ? { agentEnv: request.agentEnv } : {}),
        ...(request.contextFiles ? { contextFiles: request.contextFiles } : {}),
      },
      options: request.options,
      webhook: request.webhook,
    });

    this.logger.log(`Execution started: ${(result as any).id}`);
    return result as ParallaxExecutionResult;
  }

  async getExecutionStatus(executionId: string): Promise<ParallaxExecutionStatus> {
    if (!this._sdkClient) {
      throw new Error('Parallax control plane not configured');
    }
    return this._sdkClient.executions.get(executionId) as Promise<ParallaxExecutionStatus>;
  }

  async cancelExecution(executionId: string): Promise<void> {
    if (!this._sdkClient) {
      throw new Error('Parallax control plane not configured');
    }
    await this._sdkClient.executions.cancel(executionId);
    this.logger.log(`Execution ${executionId} cancelled`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Thread Management (new — long-running agent sessions)
  // ═══════════════════════════════════════════════════════════════════════

  async spawnThread(opts: SpawnThreadOptions): Promise<ParallaxThread> {
    if (!this._sdkClient) {
      throw new Error('Parallax SDK not configured');
    }

    this.logger.log(`Spawning thread for role=${opts.role} in execution=${opts.executionId}`);

    const thread = await this._sdkClient.managedThreads.spawn({
      executionId: opts.executionId,
      agentType: opts.agentType,
      name: opts.name,
      role: opts.role,
      objective: opts.objective,
      environment: opts.environment,
      metadata: opts.metadata,
    });

    return thread as ParallaxThread;
  }

  async stopThread(threadId: string, opts?: { force?: boolean }): Promise<void> {
    if (!this._sdkClient) return;
    await this._sdkClient.managedThreads.stop(threadId, opts);
  }

  async sendToThread(threadId: string, message: string): Promise<void> {
    if (!this._sdkClient) return;
    await this._sdkClient.managedThreads.send(threadId, { message });
  }

  async sendKeysToThread(threadId: string, keys: string[]): Promise<void> {
    if (!this._sdkClient) return;
    await this._sdkClient.managedThreads.send(threadId, { keys });
  }

  async getThreadsByExecution(executionId: string): Promise<ParallaxThread[]> {
    if (!this._sdkClient) return [];
    const result = await this._sdkClient.managedThreads.byExecution(executionId);
    return (result.threads || []) as ParallaxThread[];
  }

  async getThread(threadId: string): Promise<ParallaxThread | null> {
    if (!this._sdkClient) return null;
    try {
      return await this._sdkClient.managedThreads.get(threadId) as ParallaxThread;
    } catch {
      return null;
    }
  }

  async getThreadEvents(threadId: string): Promise<unknown[]> {
    if (!this._sdkClient) return [];
    try {
      const result = await this._sdkClient.managedThreads.events(threadId);
      return result.events || [];
    } catch {
      return [];
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Agent Management (legacy — via runtime HTTP endpoint)
  // ═══════════════════════════════════════════════════════════════════════

  async getAgentLogs(agentId: string, tail?: number): Promise<string[]> {
    if (!this.runtimeEndpoint) return [];
    try {
      const params = tail ? `?tail=${tail}` : '';
      const response = await fetch(
        `${this.runtimeEndpoint}/api/agents/${agentId}/logs${params}`,
        { signal: AbortSignal.timeout(10_000) },
      );
      if (!response.ok) return [];
      const data = await response.json();
      return Array.isArray(data.logs) ? data.logs : Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  async getAgentLogEntries(agentId: string, tail?: number): Promise<AgentLogEntry[]> {
    if (!this.runtimeEndpoint) return [];
    try {
      const params = tail ? `?tail=${tail}&format=json` : '?format=json';
      const response = await fetch(
        `${this.runtimeEndpoint}/api/agents/${agentId}/logs${params}`,
        { signal: AbortSignal.timeout(10_000) },
      );
      if (!response.ok) return [];
      const data = await response.json();
      return Array.isArray(data.entries) ? data.entries : [];
    } catch {
      return [];
    }
  }

  async getAgentOutput(agentId: string): Promise<string> {
    if (!this.runtimeEndpoint) return '';
    try {
      const response = await fetch(
        `${this.runtimeEndpoint}/api/agents/${agentId}/output`,
        { signal: AbortSignal.timeout(10_000) },
      );
      if (!response.ok) return '';
      const data = await response.json();
      return typeof data.output === 'string' ? data.output : '';
    } catch {
      return '';
    }
  }

  async sendAgentKeys(agentId: string, keys: string): Promise<boolean> {
    if (!this.runtimeEndpoint) return false;
    try {
      const response = await fetch(
        `${this.runtimeEndpoint}/api/agents/${agentId}/keys`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keys }),
          signal: AbortSignal.timeout(10_000),
        },
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  async pauseAgent(agentId: string): Promise<boolean> {
    // Try thread-based pause first
    if (this._sdkClient) {
      try {
        await this._sdkClient.managedThreads.send(agentId, { keys: ['ctrl+z'] });
        return true;
      } catch { /* fall through to legacy */ }
    }
    if (!this.runtimeEndpoint) return false;
    try {
      const response = await fetch(
        `${this.runtimeEndpoint}/api/agents/${agentId}/pause`,
        { method: 'POST', signal: AbortSignal.timeout(10_000) },
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  async resumeAgent(agentId: string): Promise<boolean> {
    if (!this.runtimeEndpoint) return false;
    try {
      const response = await fetch(
        `${this.runtimeEndpoint}/api/agents/${agentId}/resume`,
        { method: 'POST', signal: AbortSignal.timeout(10_000) },
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Health
  // ═══════════════════════════════════════════════════════════════════════

  async healthCheck(): Promise<{ healthy: boolean; message?: string; latency?: number }> {
    if (!this._sdkClient) {
      return { healthy: false, message: 'Not configured' };
    }

    const start = Date.now();
    try {
      await this._sdkClient.license.info();
      const latency = Date.now() - start;
      return { healthy: true, latency };
    } catch (error: any) {
      // Fall back to raw health endpoint
      try {
        const response = await fetch(`${this.controlPlaneUrl}/api/health`, {
          signal: AbortSignal.timeout(5_000),
        });
        const latency = Date.now() - start;
        if (!response.ok) return { healthy: false, message: `HTTP ${response.status}`, latency };
        const data = await response.json();
        return { healthy: true, message: data.message, latency };
      } catch (err: any) {
        return { healthy: false, message: err.message, latency: Date.now() - start };
      }
    }
  }

  private startHealthCheck() {
    void this.healthCheck().then((result) => {
      this.healthy = result.healthy;
      if (result.healthy) {
        this.logger.log(`Parallax control plane healthy (${result.latency}ms)`);
      } else {
        this.logger.warn(`Parallax control plane unhealthy: ${result.message}`);
      }
    });

    this.healthCheckInterval = setInterval(async () => {
      const result = await this.healthCheck();
      const wasHealthy = this.healthy;
      this.healthy = result.healthy;

      if (wasHealthy && !result.healthy) {
        this.logger.warn(`Parallax control plane became unhealthy: ${result.message}`);
      } else if (!wasHealthy && result.healthy) {
        this.logger.log('Parallax control plane recovered');
      }
    }, 30_000);
  }
}
