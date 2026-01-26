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
import { Logger, OnModuleDestroy } from '@nestjs/common';
import { TokenService } from '../auth/services/token.service';
import { JwtPayload, JwtType } from '../auth/dto/jwt-payload';
import { TerminalSessionService } from './terminal-session.service';
import * as cookie from 'cookie';

interface TerminalClient extends Socket {
  userId?: string;
  workspaceId?: string;
  sessionId?: string;
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
  private runtimeConnections: Map<string, Socket> = new Map(); // runtimeSessionId -> socket

  constructor(
    private readonly tokenService: TokenService,
    private readonly terminalSessionService: TerminalSessionService,
  ) {}

  async handleConnection(client: TerminalClient): Promise<void> {
    try {
      // Check if this is a runtime connection
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

  private async handleRuntimeConnection(
    client: Socket,
    runtimeSessionId: string,
  ): Promise<void> {
    // Validate the runtime session exists
    const session =
      await this.terminalSessionService.findByRuntimeSessionId(runtimeSessionId);
    if (!session) {
      client.emit('error', { message: 'Invalid session' });
      client.disconnect();
      return;
    }

    // Store the runtime connection
    this.runtimeConnections.set(runtimeSessionId, client);
    client.join(`runtime:${runtimeSessionId}`);

    this.logger.log(`Runtime connected for session ${runtimeSessionId}`);

    // Update session status to connecting
    await this.terminalSessionService.updateStatus(session.id, 'connecting');
  }

  handleDisconnect(client: TerminalClient): void {
    if (client.sessionId) {
      // User disconnected from a session
      this.terminalSessionService.handleUserDisconnect(client.sessionId, client.userId);
      this.logger.log(`User ${client.userId} disconnected from session ${client.sessionId}`);
    }

    // Check if this was a runtime connection
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
   * User attaches to a terminal session
   */
  @SubscribeMessage('attach')
  async handleAttach(
    @ConnectedSocket() client: TerminalClient,
    @MessageBody() data: { sessionId: string },
  ): Promise<void> {
    try {
      const session = await this.terminalSessionService.attachUser(
        data.sessionId,
        client.userId,
        client.workspaceId,
      );

      client.sessionId = session.id;
      client.join(`session:${session.id}`);

      // Notify user of successful attachment
      client.emit('attached', {
        sessionId: session.id,
        status: session.status,
        cols: session.cols,
        rows: session.rows,
      });

      // Send recent logs to catch up
      const logs = await this.terminalSessionService.getRecentLogs(session.id, 500);
      if (logs.length > 0) {
        const output = logs
          .filter((l) => l.logType === 'stdout' || l.logType === 'stderr')
          .map((l) => l.content)
          .join('');
        client.emit('data', output);
      }

      this.logger.log(`User ${client.userId} attached to session ${session.id}`);
    } catch (err) {
      client.emit('error', { message: err instanceof Error ? err.message : 'Unknown error' });
    }
  }

  /**
   * User detaches from a terminal session
   */
  @SubscribeMessage('detach')
  async handleDetach(@ConnectedSocket() client: TerminalClient): Promise<void> {
    if (client.sessionId) {
      await this.terminalSessionService.detachUser(client.sessionId, client.userId);
      client.leave(`session:${client.sessionId}`);
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

    // Forward input to runtime
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

    // Forward resize to runtime
    const runtimeSocket = this.runtimeConnections.get(session.runtimeSessionId);
    if (runtimeSocket) {
      runtimeSocket.emit('resize', data);
    }
  }

  /**
   * Runtime sends output data
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

    // Log the output
    await this.terminalSessionService.logOutput(session.id, data.data);

    // Forward to all attached users
    this.server.to(`session:${session.id}`).emit('data', data.data);
  }

  /**
   * Runtime updates session status
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

    // Notify attached users of status change
    this.server.to(`session:${session.id}`).emit('status', {
      status: data.status,
      loginUrl: data.loginUrl,
    });

    this.logger.log(`Session ${session.id} status updated to ${data.status}`);
  }

  /**
   * Broadcast to all users attached to a session
   */
  broadcastToSession(sessionId: string, event: string, data: any): void {
    this.server.to(`session:${sessionId}`).emit(event, data);
  }

  onModuleDestroy(): void {
    if (this.server) {
      this.server.close();
    }
  }
}
