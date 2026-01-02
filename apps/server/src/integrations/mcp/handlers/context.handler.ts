import { Injectable, Logger } from '@nestjs/common';
import { MCPContextService } from '../services/mcp-context.service';

/**
 * Context handler for MCP context operations
 * Provides methods for managing context data in MCP sessions
 */
@Injectable()
export class ContextHandler {
  private readonly logger = new Logger(ContextHandler.name);

  constructor(private readonly contextService: MCPContextService) {}

  /**
   * Set a context value
   *
   * @param params Parameters for setting context
   * @param userId User ID for session identification
   */
  async setContext(
    params: {
      key: string;
      value: any;
      ttl?: number;
    },
    userId: string,
  ): Promise<{ success: boolean }> {
    try {
      const { key, value, ttl } = params;

      if (!key) {
        throw new Error('Context key is required');
      }

      if (value === undefined) {
        throw new Error('Context value is required');
      }

      await this.contextService.setContext(userId, key, value, ttl);

      return { success: true };
    } catch (error: any) {
      this.logger.error(`Error setting context: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get a context value
   *
   * @param params Parameters for getting context
   * @param userId User ID for session identification
   */
  async getContext(
    params: {
      key: string;
    },
    userId: string,
  ): Promise<{ key: string; value: any } | { error: string }> {
    try {
      const { key } = params;

      if (!key) {
        throw new Error('Context key is required');
      }

      const value = await this.contextService.getContext(userId, key);

      if (value === null) {
        return { error: `Context key '${key}' not found` };
      }

      return { key, value };
    } catch (error: any) {
      this.logger.error(`Error getting context: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Delete a context value
   *
   * @param params Parameters for deleting context
   * @param userId User ID for session identification
   */
  async deleteContext(
    params: {
      key: string;
    },
    userId: string,
  ): Promise<{ success: boolean }> {
    try {
      const { key } = params;

      if (!key) {
        throw new Error('Context key is required');
      }

      await this.contextService.deleteContext(userId, key);

      return { success: true };
    } catch (error: any) {
      this.logger.error(
        `Error deleting context: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * List all context keys for a session
   *
   * @param params Optional parameters
   * @param userId User ID for session identification
   */
  async listContextKeys(
    params: Record<string, any>,
    userId: string,
  ): Promise<{ keys: string[] }> {
    try {
      const keys = await this.contextService.listContextKeys(userId);
      return { keys };
    } catch (error: any) {
      this.logger.error(
        `Error listing context keys: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Clear all context for a session
   *
   * @param params Optional parameters
   * @param userId User ID for session identification
   */
  async clearSessionContext(
    params: Record<string, any>,
    userId: string,
  ): Promise<{ success: boolean }> {
    try {
      await this.contextService.clearSessionContext(userId);
      return { success: true };
    } catch (error: any) {
      this.logger.error(
        `Error clearing session context: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
