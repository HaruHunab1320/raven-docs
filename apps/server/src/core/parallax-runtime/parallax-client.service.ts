import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
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

/**
 * Client service for communicating with Parallax control plane.
 *
 * Uses the HTTP REST API exposed by the control plane:
 *   - POST /api/patterns/upload   — upload org-chart YAML patterns
 *   - POST /api/executions        — execute a pattern
 *   - GET  /api/executions/:id    — get execution status
 *   - GET  /api/health            — health check
 *
 * The gRPC PatternClient/ExecutionClient from @parallaxai/sdk-typescript
 * can be used as an alternative transport when available. This service
 * falls back to HTTP REST for maximum compatibility.
 */
@Injectable()
export class ParallaxClientService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ParallaxClientService.name);
  private controlPlaneUrl: string | null = null;
  private runtimeEndpoint: string | null = null;
  private healthy = false;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  onModuleInit() {
    this.controlPlaneUrl = process.env.PARALLAX_CONTROL_PLANE_URL || null;
    this.runtimeEndpoint = process.env.AGENT_RUNTIME_ENDPOINT || null;

    if (this.controlPlaneUrl) {
      this.logger.log(`Parallax control plane configured: ${this.controlPlaneUrl}`);
      this.startHealthCheck();
    } else {
      this.logger.log('Parallax control plane not configured — remote pattern execution disabled');
    }
  }

  onModuleDestroy() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
  }

  /**
   * Whether Parallax control plane is configured and reachable.
   */
  isAvailable(): boolean {
    return !!this.controlPlaneUrl && this.healthy;
  }

  /**
   * Whether remote agent runtime is configured (HTTP endpoint for spawn/send/stop).
   */
  isRuntimeConfigured(): boolean {
    return !!this.runtimeEndpoint;
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

  /**
   * Upload an OrgPattern to Parallax as a YAML org-chart pattern.
   * The control plane auto-compiles it to a Prism script for execution.
   */
  async uploadOrgPattern(
    orgPattern: OrgPattern,
    overwrite = true,
  ): Promise<ParallaxPatternUploadResult> {
    if (!this.controlPlaneUrl) {
      throw new Error('Parallax control plane not configured');
    }

    const yaml = serializeOrgPatternToYaml(orgPattern);
    const filename = `${orgPattern.name.replace(/\s+/g, '-').toLowerCase()}.yaml`;

    this.logger.log(`Uploading org pattern "${orgPattern.name}" to Parallax as ${filename}`);

    const response = await this.request('/api/patterns/upload', {
      method: 'POST',
      body: JSON.stringify({
        filename,
        content: yaml,
        overwrite,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(`Failed to upload pattern: ${response.status} ${errorText}`);
      return {
        success: false,
        name: orgPattern.name,
        error: `${response.status}: ${errorText}`,
      };
    }

    const result = await response.json();
    this.logger.log(`Pattern "${orgPattern.name}" uploaded successfully`);

    return {
      success: true,
      name: orgPattern.name,
      version: orgPattern.version,
      ...result,
    };
  }

  /**
   * Upload an OrgPattern directly as a JSON object.
   * Used when the control plane supports direct org-pattern execution
   * (bypasses YAML serialization).
   */
  async uploadOrgPatternDirect(
    orgPattern: OrgPattern,
  ): Promise<ParallaxPatternUploadResult> {
    if (!this.controlPlaneUrl) {
      throw new Error('Parallax control plane not configured');
    }

    const parallaxPattern = toParallaxOrgPattern(orgPattern);

    this.logger.log(`Uploading org pattern "${orgPattern.name}" directly to Parallax`);

    const response = await this.request('/api/patterns', {
      method: 'POST',
      body: JSON.stringify(parallaxPattern),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        name: orgPattern.name,
        error: `${response.status}: ${errorText}`,
      };
    }

    const result = await response.json();
    return {
      success: true,
      name: orgPattern.name,
      version: orgPattern.version,
      ...result,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Execution Management
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Execute a named pattern on the Parallax control plane.
   */
  async executePattern(
    request: ParallaxExecutionRequest,
  ): Promise<ParallaxExecutionResult> {
    if (!this.controlPlaneUrl) {
      throw new Error('Parallax control plane not configured');
    }

    this.logger.log(`Executing pattern "${request.patternName}"`);

    const response = await this.request('/api/executions', {
      method: 'POST',
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Parallax execution failed: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    this.logger.log(`Execution started: ${result.id} (pattern: ${request.patternName})`);
    return result;
  }

  /**
   * Get the status of a running or completed execution.
   */
  async getExecutionStatus(
    executionId: string,
  ): Promise<ParallaxExecutionStatus> {
    if (!this.controlPlaneUrl) {
      throw new Error('Parallax control plane not configured');
    }

    const response = await this.request(`/api/executions/${executionId}`, {
      method: 'GET',
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get execution status: ${response.status} ${errorText}`);
    }

    return response.json();
  }

  /**
   * Cancel a running execution.
   */
  async cancelExecution(executionId: string): Promise<void> {
    if (!this.controlPlaneUrl) {
      throw new Error('Parallax control plane not configured');
    }

    const response = await this.request(`/api/executions/${executionId}/cancel`, {
      method: 'POST',
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to cancel execution: ${response.status} ${errorText}`);
    }

    this.logger.log(`Execution ${executionId} cancelled`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Agent Management (via runtime HTTP endpoint)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Get logs from a remote agent.
   * Returns raw string lines for backward compat; callers that need
   * structured entries can use getAgentLogEntries().
   */
  async getAgentLogs(agentId: string, tail?: number): Promise<string[]> {
    if (!this.runtimeEndpoint) return [];

    try {
      const params = tail ? `?tail=${tail}` : '';
      const response = await fetch(
        `${this.runtimeEndpoint}/api/agents/${agentId}/logs${params}`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(10_000),
        },
      );

      if (!response.ok) return [];

      const data = await response.json();
      return Array.isArray(data.logs) ? data.logs : Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  /**
   * Get structured log entries from a remote agent.
   */
  async getAgentLogEntries(agentId: string, tail?: number): Promise<AgentLogEntry[]> {
    if (!this.runtimeEndpoint) return [];

    try {
      const params = tail ? `?tail=${tail}&format=json` : '?format=json';
      const response = await fetch(
        `${this.runtimeEndpoint}/api/agents/${agentId}/logs${params}`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(10_000),
        },
      );

      if (!response.ok) return [];

      const data = await response.json();
      return Array.isArray(data.entries) ? data.entries : [];
    } catch {
      return [];
    }
  }

  /**
   * Get the output buffer from a remote agent (for stall classification).
   */
  async getAgentOutput(agentId: string): Promise<string> {
    if (!this.runtimeEndpoint) return '';

    try {
      const response = await fetch(
        `${this.runtimeEndpoint}/api/agents/${agentId}/output`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(10_000),
        },
      );

      if (!response.ok) return '';

      const data = await response.json();
      return typeof data.output === 'string' ? data.output : '';
    } catch {
      return '';
    }
  }

  /**
   * Send keys to a remote agent (for interrupt, enter, etc.).
   */
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

  /**
   * Pause a remote agent (for user takeover).
   */
  async pauseAgent(agentId: string): Promise<boolean> {
    if (!this.runtimeEndpoint) return false;

    try {
      const response = await fetch(
        `${this.runtimeEndpoint}/api/agents/${agentId}/pause`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(10_000),
        },
      );

      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Resume a paused remote agent.
   */
  async resumeAgent(agentId: string): Promise<boolean> {
    if (!this.runtimeEndpoint) return false;

    try {
      const response = await fetch(
        `${this.runtimeEndpoint}/api/agents/${agentId}/resume`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(10_000),
        },
      );

      return response.ok;
    } catch {
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Health Checking
  // ═══════════════════════════════════════════════════════════════════════

  async healthCheck(): Promise<{ healthy: boolean; message?: string; latency?: number }> {
    if (!this.controlPlaneUrl) {
      return { healthy: false, message: 'Not configured' };
    }

    const start = Date.now();
    try {
      const response = await this.request('/api/health', {
        method: 'GET',
        timeout: 5_000,
      });

      const latency = Date.now() - start;
      if (!response.ok) {
        return { healthy: false, message: `HTTP ${response.status}`, latency };
      }

      const data = await response.json();
      return {
        healthy: true,
        message: data.message,
        latency,
      };
    } catch (error: any) {
      return {
        healthy: false,
        message: error.message,
        latency: Date.now() - start,
      };
    }
  }

  private startHealthCheck() {
    // Initial check
    void this.healthCheck().then((result) => {
      this.healthy = result.healthy;
      if (result.healthy) {
        this.logger.log(`Parallax control plane healthy (${result.latency}ms)`);
      } else {
        this.logger.warn(`Parallax control plane unhealthy: ${result.message}`);
      }
    });

    // Periodic check every 30s
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

  // ═══════════════════════════════════════════════════════════════════════
  // HTTP Client
  // ═══════════════════════════════════════════════════════════════════════

  private async request(
    path: string,
    options: {
      method: string;
      body?: string;
      timeout?: number;
    },
  ): Promise<Response> {
    const url = `${this.controlPlaneUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const webhookSecret = process.env.PARALLAX_WEBHOOK_SECRET;
    if (webhookSecret) {
      headers['X-Webhook-Secret'] = webhookSecret;
    }

    return fetch(url, {
      method: options.method,
      headers,
      body: options.body,
      signal: AbortSignal.timeout(options.timeout || 30_000),
    });
  }
}
