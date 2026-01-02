import { Injectable, Logger } from '@nestjs/common';
import { MCPContextService } from '../services/mcp-context.service';
import { MCPEventService } from '../services/mcp-event.service';
import {
  MCPEvent,
  MCPEventType,
  MCPOperationType,
  MCPResourceType,
} from '../interfaces/mcp-event.interface';

@Injectable()
export class UIHandler {
  private readonly logger = new Logger(UIHandler.name);

  constructor(
    private readonly mcpEventService: MCPEventService,
    private readonly mcpContextService: MCPContextService,
  ) {}

  /**
   * Handle navigation requests by broadcasting a navigation event
   *
   * This uses the WebSocket system to notify clients about navigation requests
   */
  async navigate(
    params: {
      destination: 'space' | 'page' | 'home' | 'dashboard';
      spaceId?: string;
      spaceSlug?: string;
      pageId?: string;
      pageSlug?: string;
      workspaceId: string;
    },
    userId: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      this.logger.debug(
        `UI navigation requested by user ${userId} to ${params.destination}`,
      );

      // Validate the destination type
      const validDestinations = ['space', 'page', 'home', 'dashboard'];
      if (!validDestinations.includes(params.destination)) {
        throw new Error(`Invalid destination: ${params.destination}`);
      }

      // Validate that we have the required parameters based on destination
      if (
        params.destination === 'space' &&
        !params.spaceId &&
        !params.spaceSlug
      ) {
        throw new Error(
          'Space navigation requires either spaceId or spaceSlug',
        );
      }

      if (params.destination === 'page' && !params.pageId && !params.pageSlug) {
        throw new Error('Page navigation requires either pageId or pageSlug');
      }

      // Create the navigation event
      const event: MCPEvent = {
        type: MCPEventType.NAVIGATION,
        resource: MCPResourceType.UI,
        operation: MCPOperationType.NAVIGATE,
        resourceId: 'navigation', // Use a constant value since navigation doesn't target a specific resource ID
        timestamp: new Date().toISOString(),
        data: {
          destination: params.destination,
          spaceId: params.spaceId,
          spaceSlug: params.spaceSlug,
          pageId: params.pageId,
          pageSlug: params.pageSlug,
        },
        userId,
        workspaceId: params.workspaceId,
        spaceId: params.spaceId,
      };

      // Add more detailed logging
      this.logger.debug(
        `Navigation event type value: "${event.type}" (matches enum? ${event.type === MCPEventType.NAVIGATION})`,
      );
      this.logger.debug(
        `Navigation event resource value: "${event.resource}" (matches enum? ${event.resource === MCPResourceType.UI})`,
      );
      this.logger.debug(
        `Navigation event operation value: "${event.operation}" (matches enum? ${event.operation === MCPOperationType.NAVIGATE})`,
      );
      this.logger.debug(
        `Broadcasting navigation event: ${JSON.stringify(event)}`,
      );

      // Broadcast the event to all clients in the workspace
      await this.mcpEventService.broadcastEvent(event);

      return {
        success: true,
        message: `Navigation request sent to ${params.destination}`,
      };
    } catch (error) {
      this.logger.error(
        `Navigation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new Error(
        `Failed to navigate: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
}
