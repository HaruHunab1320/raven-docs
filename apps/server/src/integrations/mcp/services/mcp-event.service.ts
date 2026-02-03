import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import {
  MCPEvent,
  MCPEventType,
  MCPOperationType,
  MCPResourceType,
  ToolExecutedEventData,
} from '../interfaces/mcp-event.interface';
import { MCPWebSocketGateway } from '../mcp-websocket.gateway';

/**
 * MCP Event Service
 *
 * This service handles publishing MCP events to WebSocket clients and
 * converting internal application events to MCP events.
 */
@Injectable()
export class MCPEventService {
  private readonly logger = new Logger(MCPEventService.name);

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly mcpWebSocketGateway: MCPWebSocketGateway,
  ) {}

  /**
   * Publish an MCP event
   *
   * This method handles publishing an event to WebSocket clients
   * and also emits the event internally for other services to consume.
   *
   * @param event The MCP event to publish
   */
  public publishEvent(event: MCPEvent): void {
    try {
      this.logger.debug(
        `Publishing MCP event: ${event.type}.${event.resource}.${event.operation}`,
      );

      // First, publish to WebSocket clients
      this.mcpWebSocketGateway.publishEvent(event);

      // Also emit the event internally using EventEmitter2
      // Format: mcp.{eventType}.{resourceType}.{operation}
      const eventName = `mcp.${event.type}.${event.resource}.${event.operation}`;
      this.eventEmitter.emit(eventName, event);

      // Emit a generic event for all MCP events
      this.eventEmitter.emit('mcp.event', event);
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Error publishing MCP event: ${err.message}`,
        err.stack,
      );
    }
  }

  /**
   * Broadcast an MCP event directly
   *
   * Use this method when you need to send an event directly without the internal event emitter
   *
   * @param event The MCP event to broadcast
   */
  public async broadcastEvent(event: MCPEvent): Promise<void> {
    try {
      this.logger.debug(
        `Broadcasting MCP event: ${event.type}.${event.resource}.${event.operation}`,
      );

      // Publish to WebSocket clients
      this.mcpWebSocketGateway.publishEvent(event);
      return Promise.resolve();
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Error broadcasting MCP event: ${err.message}`,
        err.stack,
      );
      return Promise.reject(error);
    }
  }

  /**
   * Create a resource created event
   *
   * @param resource The resource type
   * @param resourceId The resource ID
   * @param data Additional event data
   * @param userId The user who triggered the event
   * @param workspaceId The workspace ID
   * @param spaceId Optional space ID
   */
  public createCreatedEvent(
    resource: MCPResourceType,
    resourceId: string,
    data: any,
    userId: string,
    workspaceId: string,
    spaceId?: string,
  ): void {
    const event: MCPEvent = {
      type: MCPEventType.CREATED,
      resource,
      operation: MCPOperationType.CREATE,
      resourceId,
      timestamp: new Date().toISOString(),
      data,
      userId,
      workspaceId,
      spaceId,
    };

    this.publishEvent(event);
  }

  /**
   * Create a resource updated event
   *
   * @param resource The resource type
   * @param resourceId The resource ID
   * @param data Additional event data
   * @param userId The user who triggered the event
   * @param workspaceId The workspace ID
   * @param spaceId Optional space ID
   */
  public createUpdatedEvent(
    resource: MCPResourceType,
    resourceId: string,
    data: any,
    userId: string,
    workspaceId: string,
    spaceId?: string,
  ): void {
    const event: MCPEvent = {
      type: MCPEventType.UPDATED,
      resource,
      operation: MCPOperationType.UPDATE,
      resourceId,
      timestamp: new Date().toISOString(),
      data,
      userId,
      workspaceId,
      spaceId,
    };

    this.publishEvent(event);
  }

  /**
   * Create a resource deleted event
   *
   * @param resource The resource type
   * @param resourceId The resource ID
   * @param data Additional event data
   * @param userId The user who triggered the event
   * @param workspaceId The workspace ID
   * @param spaceId Optional space ID
   */
  public createDeletedEvent(
    resource: MCPResourceType,
    resourceId: string,
    data: any,
    userId: string,
    workspaceId: string,
    spaceId?: string,
  ): void {
    const event: MCPEvent = {
      type: MCPEventType.DELETED,
      resource,
      operation: MCPOperationType.DELETE,
      resourceId,
      timestamp: new Date().toISOString(),
      data,
      userId,
      workspaceId,
      spaceId,
    };

    this.publishEvent(event);
  }

  /**
   * Create a resource moved event
   *
   * @param resource The resource type
   * @param resourceId The resource ID
   * @param data Additional event data
   * @param userId The user who triggered the event
   * @param workspaceId The workspace ID
   * @param spaceId Optional space ID
   */
  public createMovedEvent(
    resource: MCPResourceType,
    resourceId: string,
    data: any,
    userId: string,
    workspaceId: string,
    spaceId?: string,
  ): void {
    const event: MCPEvent = {
      type: MCPEventType.MOVED,
      resource,
      operation: MCPOperationType.MOVE,
      resourceId,
      timestamp: new Date().toISOString(),
      data,
      userId,
      workspaceId,
      spaceId,
    };

    this.publishEvent(event);
  }

  /**
   * Create a permission changed event
   *
   * @param resource The resource type
   * @param resourceId The resource ID
   * @param data Additional event data
   * @param userId The user who triggered the event
   * @param workspaceId The workspace ID
   * @param spaceId Optional space ID
   */
  public createPermissionChangedEvent(
    resource: MCPResourceType,
    resourceId: string,
    data: any,
    userId: string,
    workspaceId: string,
    spaceId?: string,
  ): void {
    const event: MCPEvent = {
      type: MCPEventType.PERMISSION_CHANGED,
      resource,
      operation: MCPOperationType.UPDATE,
      resourceId,
      timestamp: new Date().toISOString(),
      data,
      userId,
      workspaceId,
      spaceId,
    };

    this.publishEvent(event);
  }

  /**
   * Create a tool executed event (for agent/user activity tracking)
   *
   * @param data Tool execution data
   * @param userId The user who executed the tool
   * @param workspaceId The workspace ID
   */
  public createToolExecutedEvent(
    data: ToolExecutedEventData,
    userId: string,
    workspaceId: string,
  ): void {
    const event: MCPEvent = {
      type: MCPEventType.TOOL_EXECUTED,
      resource: MCPResourceType.AGENT,
      operation: MCPOperationType.EXECUTE,
      resourceId: data.agentId || userId,
      timestamp: new Date().toISOString(),
      data,
      userId,
      workspaceId,
    };

    this.publishEvent(event);
  }

  // Event handlers for comment-related events
  @OnEvent('comment.created')
  handleCommentCreated(payload: {
    comment: any;
    userId: string;
    workspaceId: string;
  }): void {
    this.createCreatedEvent(
      MCPResourceType.COMMENT,
      payload.comment.id,
      {
        content: payload.comment.content,
        pageId: payload.comment.pageId,
        parentCommentId: payload.comment.parentCommentId,
      },
      payload.userId,
      payload.workspaceId,
      undefined, // We don't have spaceId in the payload but we could fetch it if needed
    );
  }

  @OnEvent('comment.updated')
  handleCommentUpdated(payload: {
    comment: any;
    userId: string;
    workspaceId: string;
  }): void {
    this.createUpdatedEvent(
      MCPResourceType.COMMENT,
      payload.comment.id,
      {
        content: payload.comment.content,
      },
      payload.userId,
      payload.workspaceId,
    );
  }

  @OnEvent('comment.deleted')
  handleCommentDeleted(payload: {
    commentId: string;
    pageId: string;
    userId: string;
    workspaceId: string;
  }): void {
    this.createDeletedEvent(
      MCPResourceType.COMMENT,
      payload.commentId,
      {
        pageId: payload.pageId,
      },
      payload.userId,
      payload.workspaceId,
    );
  }

  // Event handlers for page-related events
  @OnEvent('page.created')
  handlePageCreated(payload: {
    page: any;
    userId: string;
    workspaceId: string;
    spaceId: string;
  }): void {
    this.createCreatedEvent(
      MCPResourceType.PAGE,
      payload.page.id,
      {
        title: payload.page.title,
        parentPageId: payload.page.parentPageId,
      },
      payload.userId,
      payload.workspaceId,
      payload.spaceId,
    );
  }

  @OnEvent('page.updated')
  handlePageUpdated(payload: {
    page: any;
    userId: string;
    workspaceId: string;
    spaceId: string;
    updateType: 'content' | 'metadata' | 'full';
  }): void {
    this.createUpdatedEvent(
      MCPResourceType.PAGE,
      payload.page.id,
      {
        title: payload.page.title,
        updateType: payload.updateType,
      },
      payload.userId,
      payload.workspaceId,
      payload.spaceId,
    );
  }

  @OnEvent('page.deleted')
  handlePageDeleted(payload: {
    pageId: string;
    userId: string;
    workspaceId: string;
    spaceId: string;
  }): void {
    this.createDeletedEvent(
      MCPResourceType.PAGE,
      payload.pageId,
      {},
      payload.userId,
      payload.workspaceId,
      payload.spaceId,
    );
  }

  @OnEvent('page.moved')
  handlePageMoved(payload: {
    pageId: string;
    userId: string;
    workspaceId: string;
    sourceSpaceId: string;
    targetSpaceId: string;
    newParentPageId?: string;
  }): void {
    this.createMovedEvent(
      MCPResourceType.PAGE,
      payload.pageId,
      {
        sourceSpaceId: payload.sourceSpaceId,
        targetSpaceId: payload.targetSpaceId,
        newParentPageId: payload.newParentPageId,
      },
      payload.userId,
      payload.workspaceId,
      payload.targetSpaceId,
    );
  }

  // ========== Parallax Agent Event Handlers ==========

  @OnEvent('parallax.access_requested')
  handleAgentAccessRequested(payload: {
    agent: any;
    workspaceId: string;
  }): void {
    const event: MCPEvent = {
      type: MCPEventType.AGENT_ACCESS_REQUESTED,
      resource: MCPResourceType.AGENT,
      operation: MCPOperationType.CREATE,
      resourceId: payload.agent.id,
      timestamp: new Date().toISOString(),
      data: {
        agentId: payload.agent.id,
        agentName: payload.agent.name,
        capabilities: payload.agent.capabilities,
        requestedPermissions: payload.agent.requestedPermissions,
      },
      userId: 'system', // Access requests come from Parallax, not a user
      workspaceId: payload.workspaceId,
    };
    this.publishEvent(event);
  }

  @OnEvent('parallax.access_approved')
  handleAgentAccessApproved(payload: {
    agent: any;
    workspaceId: string;
    grantedPermissions: string[];
  }): void {
    const event: MCPEvent = {
      type: MCPEventType.AGENT_ACCESS_APPROVED,
      resource: MCPResourceType.AGENT,
      operation: MCPOperationType.APPROVE,
      resourceId: payload.agent.id,
      timestamp: new Date().toISOString(),
      data: {
        agentId: payload.agent.id,
        agentName: payload.agent.name,
        grantedPermissions: payload.grantedPermissions,
        approvedBy: payload.agent.resolvedBy,
      },
      userId: payload.agent.resolvedBy || 'system',
      workspaceId: payload.workspaceId,
    };
    this.publishEvent(event);
  }

  @OnEvent('parallax.access_denied')
  handleAgentAccessDenied(payload: {
    agent: any;
    workspaceId: string;
    reason: string;
  }): void {
    const event: MCPEvent = {
      type: MCPEventType.AGENT_ACCESS_DENIED,
      resource: MCPResourceType.AGENT,
      operation: MCPOperationType.DENY,
      resourceId: payload.agent.id,
      timestamp: new Date().toISOString(),
      data: {
        agentId: payload.agent.id,
        agentName: payload.agent.name,
        reason: payload.reason,
        deniedBy: payload.agent.resolvedBy,
      },
      userId: payload.agent.resolvedBy || 'system',
      workspaceId: payload.workspaceId,
    };
    this.publishEvent(event);
  }

  @OnEvent('parallax.access_revoked')
  handleAgentAccessRevoked(payload: {
    agentId: string;
    workspaceId: string;
    reason: string;
  }): void {
    const event: MCPEvent = {
      type: MCPEventType.AGENT_ACCESS_REVOKED,
      resource: MCPResourceType.AGENT,
      operation: MCPOperationType.REVOKE,
      resourceId: payload.agentId,
      timestamp: new Date().toISOString(),
      data: {
        agentId: payload.agentId,
        reason: payload.reason,
      },
      userId: 'system',
      workspaceId: payload.workspaceId,
    };
    this.publishEvent(event);
  }

  @OnEvent('parallax.project_assigned')
  handleAgentProjectAssigned(payload: {
    agentId: string;
    projectId: string;
    role: string;
    workspaceId: string;
  }): void {
    const event: MCPEvent = {
      type: MCPEventType.AGENT_ASSIGNED,
      resource: MCPResourceType.AGENT,
      operation: MCPOperationType.ASSIGN,
      resourceId: payload.agentId,
      timestamp: new Date().toISOString(),
      data: {
        agentId: payload.agentId,
        assignmentType: 'project',
        projectId: payload.projectId,
        role: payload.role,
      },
      userId: 'system',
      workspaceId: payload.workspaceId,
    };
    this.publishEvent(event);
  }

  @OnEvent('parallax.task_assigned')
  handleAgentTaskAssigned(payload: {
    agentId: string;
    taskId: string;
    workspaceId: string;
  }): void {
    const event: MCPEvent = {
      type: MCPEventType.AGENT_ASSIGNED,
      resource: MCPResourceType.AGENT,
      operation: MCPOperationType.ASSIGN,
      resourceId: payload.agentId,
      timestamp: new Date().toISOString(),
      data: {
        agentId: payload.agentId,
        assignmentType: 'task',
        taskId: payload.taskId,
      },
      userId: 'system',
      workspaceId: payload.workspaceId,
    };
    this.publishEvent(event);
  }

  @OnEvent('parallax.unassigned')
  handleAgentUnassigned(payload: {
    agentId: string;
    assignmentType: string;
    targetId: string;
    workspaceId: string;
  }): void {
    const event: MCPEvent = {
      type: MCPEventType.AGENT_UNASSIGNED,
      resource: MCPResourceType.AGENT,
      operation: MCPOperationType.UNASSIGN,
      resourceId: payload.agentId,
      timestamp: new Date().toISOString(),
      data: {
        agentId: payload.agentId,
        assignmentType: payload.assignmentType,
        targetId: payload.targetId,
      },
      userId: 'system',
      workspaceId: payload.workspaceId,
    };
    this.publishEvent(event);
  }
}
