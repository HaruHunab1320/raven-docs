import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  WsResponse,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Inject, Logger, UseGuards, forwardRef } from '@nestjs/common';
import { TokenService } from '../../core/auth/services/token.service';
import { JwtPayload, JwtType } from '../../core/auth/dto/jwt-payload';
import {
  MCPEvent,
  MCPEventType,
  MCPOperationType,
  MCPResourceType,
} from './interfaces/mcp-event.interface';
import * as cookie from 'cookie';
import { WorkspaceService } from '../../core/workspace/services/workspace.service';
import { MCPPermissionGuard } from './guards/mcp-permission.guard';
import { MCPApiKeyService } from './services/mcp-api-key.service';
import { UserService } from '../../core/user/user.service';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { MCPService } from './mcp.service';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

/**
 * MCP WebSocket Gateway
 *
 * Handles real-time communication for MCP events using WebSockets.
 * This enables clients to receive real-time updates for resources they have access to.
 */
@WebSocketGateway({
  namespace: 'mcp',
  transports: ['websocket'],
  cors: { origin: '*' },
})
export class MCPWebSocketGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit
{
  @WebSocketServer()
  private server: Server;

  private readonly logger = new Logger(MCPWebSocketGateway.name);
  private connectedClients: Map<
    string,
    { userId: string; workspaceId: string }
  > = new Map();

  constructor(
    private tokenService: TokenService,
    private workspaceService: WorkspaceService,
    private mcpApiKeyService: MCPApiKeyService,
    private userService: UserService,
    private readonly environmentService: EnvironmentService,
    @Inject(forwardRef(() => MCPService))
    private readonly mcpService: MCPService,
    @InjectPinoLogger(MCPWebSocketGateway.name)
    private readonly pinoLogger: PinoLogger,
  ) {}

  // Implement the afterInit method required by OnGatewayInit
  afterInit(server: Server): void {
    this.logger.log('WebSocket Gateway initialized');
  }

  /**
   * Handle client connections
   *
   * Verifies the client's JWT token or API key, sets up room subscriptions,
   * and stores client information.
   */
  async handleConnection(client: Socket): Promise<void> {
    try {
      if (!client) {
        this.logger.error('Client object is undefined in handleConnection');
        return;
      }

      this.logger.log(`Client connected: ${client.id}`);

      let userId: string;
      let workspaceId: string;
      let authenticated = false;

      // Try API key authentication first
      const apiKey = client.handshake.auth.apiKey;
      if (apiKey && typeof apiKey === 'string' && apiKey.startsWith('mcp_')) {
        try {
          // Authenticate using API key
          const keyData = await this.mcpApiKeyService.validateApiKey(apiKey);
          if (keyData) {
            userId = keyData.userId;
            workspaceId = keyData.workspaceId;
            authenticated = true;
            this.logger.debug(
              `Client ${client.id} authenticated using API key`,
            );
          }
        } catch (e) {
          const error = e as Error;
          this.logger.debug(`API key authentication failed: ${error.message}`);
        }
      }

      // If API key authentication failed, try JWT
      if (!authenticated) {
        try {
          // Try cookies first
          const cookies = cookie.parse(client.handshake.headers.cookie || '');
          if (cookies['authToken']) {
            const token = await this.tokenService.verifyJwt(
              cookies['authToken'],
              JwtType.ACCESS,
            );

            if (token) {
              userId = token.sub;
              workspaceId = token.workspaceId;
              authenticated = true;
              this.logger.debug(
                `Client ${client.id} authenticated using cookie token`,
              );
            }
          }
          // If cookie authentication failed, try auth header
          else {
            const authHeader = client.handshake.headers.authorization;
            if (authHeader) {
              const jwt = authHeader.replace('Bearer ', '');
              const token = await this.tokenService.verifyJwt(
                jwt,
                JwtType.ACCESS,
              );

              if (token) {
                userId = token.sub;
                workspaceId = token.workspaceId;
                authenticated = true;
                this.logger.debug(
                  `Client ${client.id} authenticated using auth header token`,
                );
              }
            }
          }
        } catch (e) {
          const error = e as Error;
          this.logger.debug(`JWT authentication failed: ${error.message}`);
        }
      }

      if (!authenticated) {
        throw new Error('Authentication failed');
      }

      // Store client info
      this.connectedClients.set(client.id, { userId, workspaceId });

      // Join workspace room
      const workspaceRoom = this.getWorkspaceRoomName(workspaceId);
      client.join(workspaceRoom);

      // Join user-specific room
      const userRoom = this.getUserRoomName(userId);
      client.join(userRoom);

      this.logger.debug(
        `Client ${client.id} authenticated as user ${userId} in workspace ${workspaceId}`,
      );

      // Emit successful connection event
      client.emit('mcp:connected', { userId, workspaceId });
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Client connection error: ${err.message}`, err.stack);
      if (client) {
        client.emit('mcp:error', { message: 'Authentication failed' });
        client.disconnect();
      }
    }
  }

  /**
   * Handle client disconnections
   *
   * Cleans up resources when clients disconnect.
   */
  handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected: ${client.id}`);
    this.connectedClients.delete(client.id);
  }

  /**
   * Subscribe to a resource
   *
   * Allows clients to subscribe to specific resources for real-time updates.
   */
  @SubscribeMessage('mcp:subscribe')
  handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: {
      resourceType: MCPResourceType;
      resourceId: string;
    },
  ): void {
    try {
      if (!client) {
        this.logger.error('Client object is undefined in handleSubscribe');
        return;
      }

      const clientInfo = this.connectedClients.get(client.id);
      if (!clientInfo) {
        throw new Error('Client not authenticated');
      }

      const { resourceType, resourceId } = payload;
      const roomName = this.getResourceRoomName(resourceType, resourceId);

      this.logger.debug(`Client ${client.id} subscribing to ${roomName}`);
      client.join(roomName);

      client.emit('mcp:subscribed', { resourceType, resourceId });
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Subscribe error: ${err.message}`);
      if (client) {
        client.emit('mcp:error', {
          message: 'Failed to subscribe',
          error: err.message,
        });
      }
    }
  }

  /**
   * Unsubscribe from a resource
   *
   * Allows clients to unsubscribe from specific resources.
   */
  @SubscribeMessage('mcp:unsubscribe')
  handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: {
      resourceType: MCPResourceType;
      resourceId: string;
    },
  ): void {
    try {
      if (!client) {
        this.logger.error('Client object is undefined in handleUnsubscribe');
        return;
      }

      const { resourceType, resourceId } = payload;
      const roomName = this.getResourceRoomName(resourceType, resourceId);

      this.logger.debug(`Client ${client.id} unsubscribing from ${roomName}`);
      client.leave(roomName);

      client.emit('mcp:unsubscribed', { resourceType, resourceId });
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Unsubscribe error: ${err.message}`);
      if (client) {
        client.emit('mcp:error', {
          message: 'Failed to unsubscribe',
          error: err.message,
        });
      }
    }
  }

  /**
   * Update presence status
   *
   * Allows clients to broadcast their presence information.
   */
  @SubscribeMessage('mcp:presence')
  handlePresence(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: {
      pageId: string;
      status: 'online' | 'offline' | 'idle';
      cursorPosition?: { x: number; y: number };
    },
  ): void {
    try {
      if (!client) {
        this.logger.error('Client object is undefined in handlePresence');
        return;
      }

      const clientInfo = this.connectedClients.get(client.id);
      if (!clientInfo) {
        throw new Error('Client not authenticated');
      }

      const { userId, workspaceId } = clientInfo;
      const { pageId, status, cursorPosition } = payload;

      // Create presence event
      const presenceEvent: MCPEvent = {
        type: MCPEventType.PRESENCE,
        resource: MCPResourceType.PAGE,
        operation: MCPOperationType.READ,
        resourceId: pageId,
        timestamp: new Date().toISOString(),
        userId,
        workspaceId,
        data: {
          status,
          cursorPosition,
          lastActive: new Date().toISOString(),
        },
      };

      // Broadcast to page room
      const roomName = this.getResourceRoomName(MCPResourceType.PAGE, pageId);
      this.server.to(roomName).emit('mcp:event', presenceEvent);
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Presence update error: ${err.message}`);
      if (client) {
        client.emit('mcp:error', {
          message: 'Failed to update presence',
          error: err.message,
        });
      }
    }
  }

  /**
   * Publish an MCP event to relevant subscribers
   *
   * This method is called by other parts of the application to broadcast events.
   */
  public publishEvent(event: MCPEvent): void {
    // Guard: ensure server is initialized
    if (!this.server) {
      this.logger.debug('[MCP-WebSocket] Server not initialized, skipping event');
      return;
    }

    // Add debug logs to track event publishing
    this.logger.debug(
      `[MCP-WebSocket] Publishing event: ${event.type}.${event.resource}.${event.operation} for ID: ${event.resourceId}`,
    );
    this.logger.debug(`[MCP-WebSocket] Event data: ${JSON.stringify(event)}`);

    try {
      // First emit to the specific resource room
      const roomName = this.getResourceRoomName(
        event.resource,
        event.resourceId,
      );
      const roomSize = this.getRoomSize(roomName);
      this.logger.debug(
        `[MCP-WebSocket] Broadcasting to ${roomSize} clients in room: ${roomName}`,
      );

      this.server.to(roomName).emit('mcp:event', event);

      // Also emit to the workspace room
      if (event.workspaceId) {
        const workspaceRoom = this.getWorkspaceRoomName(event.workspaceId);
        const workspaceRoomSize = this.getRoomSize(workspaceRoom);
        this.logger.debug(
          `[MCP-WebSocket] Broadcasting to ${workspaceRoomSize} clients in workspace room: ${workspaceRoom}`,
        );

        this.server.to(workspaceRoom).emit('mcp:event', event);
      }

      // Also emit to the user room if applicable
      if (event.userId) {
        const userRoom = this.getUserRoomName(event.userId);
        const userRoomSize = this.getRoomSize(userRoom);
        this.logger.debug(
          `[MCP-WebSocket] Broadcasting to ${userRoomSize} clients in user room: ${userRoom}`,
        );

        this.server.to(userRoom).emit('mcp:event', event);

        // For TOOL_EXECUTED events, also emit to watchers of this user
        if (event.type === MCPEventType.TOOL_EXECUTED) {
          const watchRoom = this.getWatchRoomName(event.userId);
          const watchRoomSize = this.getRoomSize(watchRoom);
          if (watchRoomSize > 0) {
            this.logger.debug(
              `[MCP-WebSocket] Broadcasting to ${watchRoomSize} watchers in room: ${watchRoom}`,
            );
            this.server.to(watchRoom).emit('mcp:activity', event);
          }
        }
      }

      // For debugging, let's see if we have any connected clients at all
      const totalClients = this.server?.sockets?.sockets?.size ?? 0;
      this.logger.debug(
        `[MCP-WebSocket] Total connected clients: ${totalClients}`,
      );

      // Log all connected clients
      if (totalClients > 0) {
        this.logger.debug('[MCP-WebSocket] Connected client details:');
        this.connectedClients.forEach((details, clientId) => {
          this.logger.debug(
            `[MCP-WebSocket] Client ${clientId}: workspaceId=${details.workspaceId}, userId=${details.userId}`,
          );
        });
      } else {
        this.logger.warn(
          '[MCP-WebSocket] No clients connected to receive events!',
        );
      }

      // Emit to all clients to ensure events are received during testing
      this.logger.debug(
        `[MCP-WebSocket] Broadcasting to all clients for testing`,
      );
      this.server.emit('mcp:event', event);
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `[MCP-WebSocket] Error publishing event: ${err.message}`,
        err.stack,
      );
    }
  }

  // Helper method to safely get room size
  private getRoomSize(roomName: string): number {
    try {
      if (!this.server) return 0;
      // The adapter might be using a Map to store rooms
      if (this.server.adapter && typeof this.server.adapter === 'object') {
        // Try to access rooms safely
        const adapter = this.server.adapter as any;
        if (adapter.rooms && adapter.rooms instanceof Map) {
          return adapter.rooms.get(roomName)?.size || 0;
        }
      }
      return 0;
    } catch (error) {
      this.logger.warn(
        `Could not determine room size for ${roomName}: ${error}`,
      );
      return 0;
    }
  }

  /**
   * Get the room name for a specific resource
   */
  private getResourceRoomName(
    resourceType: MCPResourceType,
    resourceId: string,
  ): string {
    return `${resourceType}:${resourceId}`;
  }

  /**
   * Get the room name for a workspace
   */
  private getWorkspaceRoomName(workspaceId: string): string {
    return `workspace:${workspaceId}`;
  }

  /**
   * Get the room name for a user
   */
  private getUserRoomName(userId: string): string {
    return `user:${userId}`;
  }

  /**
   * Get the room name for watching a user/agent's activity
   */
  private getWatchRoomName(targetUserId: string): string {
    return `watch:${targetUserId}`;
  }

  /**
   * Subscribe to watch a user/agent's activity
   *
   * Allows workspace admins to observe what a user or agent is doing in real-time.
   * Events are streamed to watchers including tool executions, page edits, etc.
   */
  @SubscribeMessage('mcp:watch')
  handleWatch(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: {
      targetUserId: string;
    },
  ): void {
    try {
      if (!client) {
        this.logger.error('Client object is undefined in handleWatch');
        return;
      }

      const clientInfo = this.connectedClients.get(client.id);
      if (!clientInfo) {
        throw new Error('Client not authenticated');
      }

      const { targetUserId } = payload;
      const watchRoom = this.getWatchRoomName(targetUserId);

      this.logger.log(
        `Client ${client.id} (user ${clientInfo.userId}) starting to watch user ${targetUserId}`,
      );
      client.join(watchRoom);

      client.emit('mcp:watching', {
        targetUserId,
        message: `Now watching activity for user ${targetUserId}`,
      });
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Watch error: ${err.message}`);
      if (client) {
        client.emit('mcp:error', {
          message: 'Failed to start watching',
          error: err.message,
        });
      }
    }
  }

  /**
   * Stop watching a user/agent's activity
   */
  @SubscribeMessage('mcp:unwatch')
  handleUnwatch(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: {
      targetUserId: string;
    },
  ): void {
    try {
      if (!client) {
        this.logger.error('Client object is undefined in handleUnwatch');
        return;
      }

      const { targetUserId } = payload;
      const watchRoom = this.getWatchRoomName(targetUserId);

      this.logger.log(`Client ${client.id} stopped watching user ${targetUserId}`);
      client.leave(watchRoom);

      client.emit('mcp:unwatched', {
        targetUserId,
        message: `Stopped watching activity for user ${targetUserId}`,
      });
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Unwatch error: ${err.message}`);
      if (client) {
        client.emit('mcp:error', {
          message: 'Failed to stop watching',
          error: err.message,
        });
      }
    }
  }

  @SubscribeMessage('mcp:test-event')
  handleTestEvent(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: MCPEvent,
  ): WsResponse<{ success: boolean; message?: string; error?: string }> {
    if (!client) {
      this.logger.error('Client object is undefined in handleTestEvent');
      return {
        event: 'mcp:test-event',
        data: { success: false, error: 'Client is undefined' },
      };
    }

    this.logger.debug(
      `Received test event from client ${client.id}. Broadcasting to room.`,
    );

    try {
      // Log the received test event
      this.logger.debug(`Test event payload: ${JSON.stringify(payload)}`);

      // Modify the payload to indicate it's an echo from server
      const modifiedPayload = {
        ...payload,
        data: {
          ...(payload.data || {}),
          echoedByServer: true,
          serverTimestamp: new Date().toISOString(),
        },
      };

      // Use our modified publishEvent method to send the event
      this.logger.debug('Broadcasting test event to all clients...');

      // First, broadcast to specific resource room if provided
      if (payload.resourceId) {
        const roomName = this.getResourceRoomName(
          payload.resource,
          payload.resourceId,
        );
        this.server.to(roomName).emit('mcp:event', modifiedPayload);
        this.logger.debug(`Test event sent to room: ${roomName}`);
      }

      // Also broadcast to all clients for testing purposes
      this.server.emit('mcp:event', modifiedPayload);
      this.logger.debug(`Test event broadcasted to all clients`);

      // Return acknowledgment to sender
      return {
        event: 'mcp:test-event',
        data: { success: true, message: 'Test event broadcasted' },
      };
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Error handling test event: ${err.message}`, err.stack);
      return {
        event: 'mcp:test-event',
        data: { success: false, error: err.message },
      };
    }
  }
}
