import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { TokenService } from '../auth/services/token.service';
import { JwtPayload, JwtType } from '../auth/dto/jwt-payload';
import { TerminalSessionService } from './terminal-session.service';
import * as cookie from 'cookie';
import WebSocket from 'ws';
import { TerminalAttachment } from 'pty-manager';
import { AgentExecutionService } from '../coding-swarm/agent-execution.service';

interface TerminalClient extends Socket {
  userId?: string;
  workspaceId?: string;
  sessionId?: string;
  runtimeWs?: WebSocket; // Proxy connection to runtime
  localAttachment?: TerminalAttachment; // Local PTY attachment
  localAttachmentUnsub?: () => void;
}

@WebSocketGateway({
  namespace: '/terminal',
  cors: { origin: '*' },
  transports: ['websocket'],
})
export class TerminalGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(TerminalGateway.name);

  // Legacy mode: Runtime connects TO Raven
  private runtimeConnections: Map<string, Socket> = new Map(); // runtimeSessionId -> socket

  // Proxy mode: Raven connects TO Runtime
  private proxyConnections: Map<string, WebSocket> = new Map(); // sessionId -> WebSocket to runtime

  constructor(
    private readonly tokenService: TokenService,
    private readonly terminalSessionService: TerminalSessionService,
    @Optional() private readonly agentExecution?: AgentExecutionService,
  ) {}

  async handleConnection(client: TerminalClient): Promise<void> {
    try {
      // Check if this is a runtime connection (legacy mode)
      const runtimeSessionId = client.handshake.query.runtimeSessionId as string;
      if (runtimeSessionId) {
        await this.handleRuntimeConnection(client, runtimeSessionId);
        return;
      }

      // Otherwise, authenticate as user
      const cookies = cookie.parse(client.handshake.headers.cookie || '');
      const token: JwtPayload = await this.tokenService.verifyJwt(
        cookies['authToken'],
        JwtType.ACCESS,
      );

      client.userId = token.sub;
      client.workspaceId = token.workspaceId;

      this.logger.log(`User ${client.userId} connected to terminal gateway`);
    } catch (err) {
      this.logger.error(`Terminal connection failed: ${err instanceof Error ? err.message : String(err)}`);
      client.emit('error', { message: 'Unauthorized' });
      client.disconnect();
    }
  }

  /**
   * Legacy mode: Runtime connects TO Raven
   */
  private async handleRuntimeConnection(
    client: Socket,
    runtimeSessionId: string,
  ): Promise<void> {
    const session =
      await this.terminalSessionService.findByRuntimeSessionId(runtimeSessionId);
    if (!session) {
      client.emit('error', { message: 'Invalid session' });
      client.disconnect();
      return;
    }

    this.runtimeConnections.set(runtimeSessionId, client);
    client.join(`runtime:${runtimeSessionId}`);

    this.logger.log(`Runtime connected for session ${runtimeSessionId}`);
    await this.terminalSessionService.updateStatus(session.id, 'connecting');
  }

  handleDisconnect(client: TerminalClient): void {
    // Clean up proxy connection if exists
    if (client.runtimeWs) {
      client.runtimeWs.close();
    }
    if (client.localAttachmentUnsub) {
      client.localAttachmentUnsub();
      client.localAttachmentUnsub = undefined;
    }
    client.localAttachment = undefined;

    if (client.sessionId) {
      this.terminalSessionService.handleUserDisconnect(client.sessionId, client.userId);
      this.proxyConnections.delete(client.sessionId);
      this.logger.log(`User ${client.userId} disconnected from session ${client.sessionId}`);
    }

    // Check if this was a legacy runtime connection
    for (const [sessionId, socket] of this.runtimeConnections.entries()) {
      if (socket.id === client.id) {
        this.runtimeConnections.delete(sessionId);
        this.terminalSessionService.handleRuntimeDisconnect(sessionId);
        this.logger.log(`Runtime disconnected for session ${sessionId}`);
        break;
      }
    }
  }

  /**
   * User attaches to a terminal session.
   * This will either use legacy mode (runtime connected to Raven) or
   * proxy mode (Raven connects to runtime).
   */
  @SubscribeMessage('attach')
  async handleAttach(
    @ConnectedSocket() client: TerminalClient,
    @MessageBody() data: { sessionId?: string; agentId?: string },
  ): Promise<void> {
    try {
      let session;

      if (data.sessionId) {
        session = await this.terminalSessionService.findById(data.sessionId);
      } else if (data.agentId) {
        session = await this.terminalSessionService.findActiveByAgent(data.agentId);
      }

      if (!session) {
        client.emit('error', { message: 'Session not found' });
        return;
      }

      // Verify workspace access
      if (session.workspaceId !== client.workspaceId) {
        client.emit('error', { message: 'Access denied' });
        return;
      }

      // Attach user to session
      await this.terminalSessionService.attachUser(
        session.id,
        client.userId,
        client.workspaceId,
      );

      // Clean up any existing attachment on this client before re-attaching.
      // This prevents orphaned listeners from sending duplicate data.
      if (client.localAttachmentUnsub) {
        client.localAttachmentUnsub();
        client.localAttachmentUnsub = undefined;
      }
      client.localAttachment = undefined;
      if (client.runtimeWs) {
        client.runtimeWs.close();
        client.runtimeWs = undefined;
      }
      if (client.sessionId) {
        client.leave(`session:${client.sessionId}`);
        this.proxyConnections.delete(client.sessionId);
      }

      client.sessionId = session.id;
      client.join(`session:${session.id}`);

      // Check if we need to use proxy mode
      const hasLegacyConnection = this.runtimeConnections.has(session.runtimeSessionId);

      let resolvedStatus = session.status;

      if (!hasLegacyConnection && session.runtimeEndpoint) {
        // Close any existing orphaned proxy for this session
        const existingProxy = this.proxyConnections.get(session.id);
        if (existingProxy) {
          existingProxy.close();
          this.proxyConnections.delete(session.id);
        }
        // Proxy mode: Connect to runtime's terminal WebSocket
        await this.setupProxyConnection(client, session);
      } else if (!hasLegacyConnection && this.agentExecution?.mode === 'local') {
        // Local PTY mode: attach directly to the local runtime session.
        // IMPORTANT: We store the attachment but defer the onData listener
        // until after clear + log replay so live data doesn't interleave
        // with historical data (which corrupts TUI rendering).
        const localAttachment = this.agentExecution.attachTerminal(
          session.runtimeSessionId,
        ) as TerminalAttachment | null;
        if (localAttachment) {
          client.localAttachment = localAttachment;
          await this.terminalSessionService.updateStatus(session.id, 'active');
          resolvedStatus = 'active';
        }
      }

      // Notify user of successful attachment
      client.emit('attached', {
        sessionId: session.id,
        agentId: session.agentId,
        status: resolvedStatus,
        cols: session.cols,
        rows: session.rows,
      });

      // Tell client to clear before replaying historical logs.
      // This prevents duplicate content when reconnecting.
      client.emit('clear');

      // Send recent logs to catch up
      const logs = await this.terminalSessionService.getRecentLogs(session.id, 500);
      if (logs.length > 0) {
        const output = logs
          .filter((l) => l.logType === 'stdout' || l.logType === 'stderr')
          .map((l) => l.content)
          .join('');
        client.emit('data', output);
      }

      // NOW start the live data listener — after clear + replay are done.
      // This ensures historical data is delivered cleanly before live
      // streaming begins, preventing interleaved/garbled TUI output.
      if (client.localAttachment && !client.localAttachmentUnsub) {
        const sid = session.id;
        client.localAttachmentUnsub = client.localAttachment.onData((chunk) => {
          client.emit('data', chunk);
          void this.terminalSessionService.logOutput(sid, chunk.slice(0, 10000));
        });
      }

      this.logger.log(`User ${client.userId} attached to session ${session.id}`);
    } catch (err) {
      client.emit('error', { message: err instanceof Error ? err.message : 'Unknown error' });
    }
  }

  /**
   * Set up a proxy connection to the runtime's terminal WebSocket
   *
   * Important: PTY output can include raw escape sequences and binary data.
   * We forward the raw data without parsing to preserve terminal emulation.
   */
  private async setupProxyConnection(
    client: TerminalClient,
    session: { id: string; agentId: string; runtimeEndpoint: string; runtimeSessionId: string },
  ): Promise<void> {
    const wsUrl = this.buildWsUrl(
      session.runtimeEndpoint,
      `/ws/agents/${session.agentId}/terminal`,
    );

    this.logger.log(`Setting up proxy connection to ${wsUrl}`);

    try {
      const runtimeWs = new WebSocket(wsUrl);
      client.runtimeWs = runtimeWs;
      this.proxyConnections.set(session.id, runtimeWs);

      runtimeWs.on('open', () => {
        this.logger.log(`Proxy connection established for session ${session.id}`);
        this.terminalSessionService.updateStatus(session.id, 'active');
      });

      runtimeWs.on('message', async (data: WebSocket.Data, isBinary: boolean) => {
        // Forward raw data to user - preserves escape sequences and binary content
        // Socket.io handles binary data correctly when we pass Buffer/string
        if (isBinary && Buffer.isBuffer(data)) {
          // Binary data - forward as-is
          client.emit('data', data.toString('binary'));
        } else {
          // Text data - forward as string
          const output = data.toString();
          client.emit('data', output);
        }

        // Log output for audit (truncate if too long to avoid DB bloat)
        const logData = data.toString().slice(0, 10000);
        await this.terminalSessionService.logOutput(session.id, logData);
      });

      runtimeWs.on('close', (code, reason) => {
        this.logger.log(`Proxy connection closed for session ${session.id}: ${code} ${reason}`);
        client.emit('status', { status: 'disconnected' });
        this.proxyConnections.delete(session.id);
        client.runtimeWs = undefined;
      });

      runtimeWs.on('error', (err) => {
        this.logger.error(`Proxy connection error for session ${session.id}: ${err.message}`);
        client.emit('error', { message: 'Runtime connection error' });
      });
    } catch (err: any) {
      this.logger.error(`Failed to set up proxy connection: ${err.message}`);
      throw err;
    }
  }

  private buildWsUrl(httpEndpoint: string, path: string): string {
    const url = new URL(httpEndpoint);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = path;
    return url.toString();
  }

  @SubscribeMessage('detach')
  async handleDetach(@ConnectedSocket() client: TerminalClient): Promise<void> {
    if (client.sessionId) {
      await this.terminalSessionService.detachUser(client.sessionId, client.userId);
      client.leave(`session:${client.sessionId}`);

      // Close proxy connection
      if (client.runtimeWs) {
        client.runtimeWs.close();
        client.runtimeWs = undefined;
      }
      if (client.localAttachmentUnsub) {
        client.localAttachmentUnsub();
        client.localAttachmentUnsub = undefined;
      }
      client.localAttachment = undefined;
      this.proxyConnections.delete(client.sessionId);

      client.emit('detached');
      this.logger.log(`User ${client.userId} detached from session ${client.sessionId}`);
      client.sessionId = undefined;
    }
  }

  /**
   * User sends input to terminal
   */
  @SubscribeMessage('input')
  async handleInput(
    @ConnectedSocket() client: TerminalClient,
    @MessageBody() data: string,
  ): Promise<void> {
    if (!client.sessionId) {
      client.emit('error', { message: 'Not attached to a session' });
      return;
    }

    const session = await this.terminalSessionService.findById(client.sessionId);
    if (!session) {
      client.emit('error', { message: 'Session not found' });
      return;
    }

    // Try proxy mode first
    if (client.runtimeWs && client.runtimeWs.readyState === WebSocket.OPEN) {
      client.runtimeWs.send(data);
      await this.terminalSessionService.logInput(session.id, data);
      return;
    }

    // Local PTY mode
    if (client.localAttachment) {
      client.localAttachment.write(data);
      await this.terminalSessionService.logInput(session.id, data);
      return;
    }

    // Fall back to legacy mode
    const runtimeSocket = this.runtimeConnections.get(session.runtimeSessionId);
    if (runtimeSocket) {
      runtimeSocket.emit('input', data);
      await this.terminalSessionService.logInput(session.id, data);
    } else {
      client.emit('error', { message: 'Runtime not connected' });
    }
  }

  /**
   * User resizes terminal
   */
  @SubscribeMessage('resize')
  async handleResize(
    @ConnectedSocket() client: TerminalClient,
    @MessageBody() data: { cols: number; rows: number },
  ): Promise<void> {
    if (!client.sessionId) return;

    const session = await this.terminalSessionService.findById(client.sessionId);
    if (!session) return;

    await this.terminalSessionService.resize(session.id, data.cols, data.rows);

    // Proxy mode: Send resize as JSON message to Parallax runtime
    if (client.runtimeWs && client.runtimeWs.readyState === WebSocket.OPEN) {
      client.runtimeWs.send(JSON.stringify({
        type: 'resize',
        cols: data.cols,
        rows: data.rows,
      }));
      this.logger.debug(`Resize sent for session ${session.id}: ${data.cols}x${data.rows}`);
      return;
    }

    // Local PTY mode
    if (client.localAttachment) {
      client.localAttachment.resize(data.cols, data.rows);
      return;
    }

    // Fall back to legacy mode
    const runtimeSocket = this.runtimeConnections.get(session.runtimeSessionId);
    if (runtimeSocket) {
      runtimeSocket.emit('resize', data);
    }
  }

  /**
   * Legacy mode: Runtime sends output data
   */
  @SubscribeMessage('output')
  async handleOutput(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { runtimeSessionId: string; data: string },
  ): Promise<void> {
    const session = await this.terminalSessionService.findByRuntimeSessionId(
      data.runtimeSessionId,
    );
    if (!session) return;

    await this.terminalSessionService.logOutput(session.id, data.data);
    this.server.to(`session:${session.id}`).emit('data', data.data);
  }

  /**
   * Legacy mode: Runtime updates session status
   */
  @SubscribeMessage('status')
  async handleStatus(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      runtimeSessionId: string;
      status: 'active' | 'login_required' | 'disconnected' | 'terminated';
      loginUrl?: string;
    },
  ): Promise<void> {
    const session = await this.terminalSessionService.findByRuntimeSessionId(
      data.runtimeSessionId,
    );
    if (!session) return;

    await this.terminalSessionService.updateStatus(session.id, data.status);
    this.server.to(`session:${session.id}`).emit('status', {
      status: data.status,
      loginUrl: data.loginUrl,
    });

    this.logger.log(`Session ${session.id} status updated to ${data.status}`);
  }

  broadcastToSession(sessionId: string, event: string, data: any): void {
    this.server.to(`session:${sessionId}`).emit(event, data);
  }

  onModuleDestroy(): void {
    // Close all proxy connections
    for (const ws of this.proxyConnections.values()) {
      ws.close();
    }
    this.proxyConnections.clear();

    // Disconnect all socket.io clients - NestJS handles the underlying server cleanup
    if (this.server) {
      this.server.disconnectSockets(true);
    }
  }
}
