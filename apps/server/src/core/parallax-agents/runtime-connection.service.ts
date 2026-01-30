import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import WebSocket from 'ws';

interface RuntimeConnection {
  eventsWs: WebSocket | null;
  endpoint: string;
  workspaceId: string;
  reconnectAttempts: number;
  reconnectTimeout?: NodeJS.Timeout;
}

/**
 * Manages WebSocket connections to agent runtimes.
 *
 * Connects to runtime's event stream to receive agent lifecycle events,
 * then broadcasts them to the appropriate workspace via EventEmitter.
 */
@Injectable()
export class RuntimeConnectionService implements OnModuleDestroy {
  private readonly logger = new Logger(RuntimeConnectionService.name);
  private readonly connections: Map<string, RuntimeConnection> = new Map();
  private readonly MAX_RECONNECT_ATTEMPTS = 10;
  private readonly RECONNECT_DELAY_MS = 5000;

  constructor(private readonly eventEmitter: EventEmitter2) {}

  /**
   * Connect to a runtime's event stream
   */
  async connectToRuntime(workspaceId: string, runtimeEndpoint: string): Promise<void> {
    const existingConnection = this.connections.get(workspaceId);
    if (existingConnection?.eventsWs?.readyState === WebSocket.OPEN) {
      this.logger.debug(`Already connected to runtime for workspace ${workspaceId}`);
      return;
    }

    // Clean up existing connection if any
    if (existingConnection) {
      this.disconnectFromRuntime(workspaceId);
    }

    const connection: RuntimeConnection = {
      eventsWs: null,
      endpoint: runtimeEndpoint,
      workspaceId,
      reconnectAttempts: 0,
    };

    this.connections.set(workspaceId, connection);
    await this.establishEventConnection(connection);
  }

  /**
   * Disconnect from a runtime
   */
  disconnectFromRuntime(workspaceId: string): void {
    const connection = this.connections.get(workspaceId);
    if (!connection) return;

    if (connection.reconnectTimeout) {
      clearTimeout(connection.reconnectTimeout);
    }

    if (connection.eventsWs) {
      connection.eventsWs.close();
      connection.eventsWs = null;
    }

    this.connections.delete(workspaceId);
    this.logger.log(`Disconnected from runtime for workspace ${workspaceId}`);
  }

  /**
   * Get the runtime endpoint for a workspace
   */
  getRuntimeEndpoint(workspaceId: string): string | null {
    return this.connections.get(workspaceId)?.endpoint || null;
  }

  /**
   * Check if connected to runtime for a workspace
   */
  isConnected(workspaceId: string): boolean {
    const connection = this.connections.get(workspaceId);
    return connection?.eventsWs?.readyState === WebSocket.OPEN;
  }

  private async establishEventConnection(connection: RuntimeConnection): Promise<void> {
    const wsUrl = this.buildWsUrl(connection.endpoint, '/ws/events');

    this.logger.log(`Connecting to runtime events: ${wsUrl}`);

    try {
      const ws = new WebSocket(wsUrl);
      connection.eventsWs = ws;

      ws.on('open', () => {
        this.logger.log(`Connected to runtime events for workspace ${connection.workspaceId}`);
        connection.reconnectAttempts = 0;
      });

      ws.on('message', (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleRuntimeEvent(connection.workspaceId, message);
        } catch (err) {
          this.logger.error(`Failed to parse runtime event: ${err}`);
        }
      });

      ws.on('close', (code, reason) => {
        this.logger.warn(
          `Runtime event connection closed for workspace ${connection.workspaceId}: ${code} ${reason}`,
        );
        this.scheduleReconnect(connection);
      });

      ws.on('error', (err) => {
        this.logger.error(
          `Runtime event connection error for workspace ${connection.workspaceId}: ${err.message}`,
        );
      });
    } catch (err: any) {
      this.logger.error(`Failed to connect to runtime: ${err.message}`);
      this.scheduleReconnect(connection);
    }
  }

  private handleRuntimeEvent(
    workspaceId: string,
    message: { event: string; data: any },
  ): void {
    const { event, data } = message;

    this.logger.debug(`Runtime event for workspace ${workspaceId}: ${event}`);

    // Extract agent info - Parallax sends { agent: {...} } or flat data
    const agent = data.agent || data;
    const agentId = agent.id || data.agentId;

    switch (event) {
      // Parallax events mapped to Raven broadcasts
      case 'agent_started':
        this.eventEmitter.emit('parallax.agent_started', {
          workspaceId,
          agent,
        });
        break;

      case 'agent_ready':
        this.eventEmitter.emit('parallax.agent_ready', {
          workspaceId,
          agent,
          agentId,
          mcpEndpoint: data.mcpEndpoint,
          runtimeSessionId: data.runtimeSessionId || agentId,
        });
        break;

      case 'login_required':
        this.eventEmitter.emit('parallax.login_required', {
          workspaceId,
          agent,
          agentId,
          loginUrl: data.loginUrl,
          runtimeSessionId: data.runtimeSessionId || agentId,
        });
        break;

      case 'agent_stopped':
        this.eventEmitter.emit('parallax.agent_stopped', {
          workspaceId,
          agent,
          agentId,
          reason: data.reason,
        });
        break;

      case 'agent_error':
        this.eventEmitter.emit('parallax.agent_error', {
          workspaceId,
          agent,
          agentId,
          error: data.error || data.message,
        });
        break;

      // Legacy event names (for backwards compatibility)
      case 'agent_failed':
      case 'spawn_failed':
        this.eventEmitter.emit('parallax.agent_error', {
          workspaceId,
          agent,
          agentId,
          error: data.error || data.message,
        });
        break;

      case 'agent_spawned':
        this.eventEmitter.emit('parallax.agent_started', {
          workspaceId,
          agent: {
            id: agentId,
            name: agent.name || data.name,
            type: agent.type || data.agentType,
            status: agent.status || 'spawning',
          },
        });
        break;

      case 'agent_terminated':
        this.eventEmitter.emit('parallax.agent_stopped', {
          workspaceId,
          agent,
          agentId,
          reason: 'terminated',
        });
        break;

      default:
        this.logger.debug(`Unhandled runtime event: ${event}`);
    }
  }

  private scheduleReconnect(connection: RuntimeConnection): void {
    if (connection.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      this.logger.error(
        `Max reconnect attempts reached for workspace ${connection.workspaceId}`,
      );
      this.connections.delete(connection.workspaceId);
      return;
    }

    connection.reconnectAttempts++;
    const delay = this.RECONNECT_DELAY_MS * Math.min(connection.reconnectAttempts, 5);

    this.logger.log(
      `Scheduling reconnect for workspace ${connection.workspaceId} in ${delay}ms (attempt ${connection.reconnectAttempts})`,
    );

    connection.reconnectTimeout = setTimeout(() => {
      this.establishEventConnection(connection);
    }, delay);
  }

  private buildWsUrl(httpEndpoint: string, path: string): string {
    const url = new URL(httpEndpoint);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = path;
    return url.toString();
  }

  onModuleDestroy(): void {
    for (const workspaceId of this.connections.keys()) {
      this.disconnectFromRuntime(workspaceId);
    }
  }
}
