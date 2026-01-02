import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';
import { EnvironmentService } from '../../environment/environment.service';

/**
 * Service for managing context data in MCP sessions
 * Uses Redis for persistence with TTL support
 */
@Injectable()
export class MCPContextService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MCPContextService.name);
  private redisClient: RedisClientType;
  private readonly redisUrl: string;
  private ready = false;

  constructor(private readonly environmentService: EnvironmentService) {
    // Get Redis URL from environment, with a fallback
    this.redisUrl = this.getRedisUrl();
    this.logger.log(
      `Initializing context service with Redis URL: ${this.redisUrl}`,
    );
  }

  /**
   * Get Redis URL from environment with a fallback
   */
  private getRedisUrl(): string {
    try {
      // Try different methods to get the Redis URL
      const redisUrl =
        process.env.REDIS_URL ||
        (this.environmentService['get']
          ? this.environmentService['get']('REDIS_URL')
          : null) ||
        'redis://localhost:6379';

      return redisUrl;
    } catch (error) {
      this.logger.warn(
        'Could not get Redis URL from environment service, using default',
      );
      return 'redis://localhost:6379';
    }
  }

  /**
   * Initialize Redis client when module starts
   */
  async onModuleInit() {
    try {
      this.redisClient = createClient({ url: this.redisUrl });

      this.redisClient.on('error', (err: Error) => {
        this.logger.error(`Redis connection error: ${err.message}`, err.stack);
        this.ready = false;
      });

      this.redisClient.on('connect', () => {
        this.logger.log('Connected to Redis successfully');
        this.ready = true;
      });

      this.redisClient.on('reconnecting', () => {
        this.logger.warn('Reconnecting to Redis...');
        this.ready = false;
      });

      await this.redisClient.connect();
      this.ready = true;
      this.logger.log('Context service initialized successfully');
    } catch (error: any) {
      this.logger.error(
        `Failed to initialize Redis client: ${error.message}`,
        error.stack,
      );
      this.ready = false;
    }
  }

  /**
   * Cleanup Redis client when module is destroyed
   */
  async onModuleDestroy() {
    if (this.redisClient) {
      try {
        await this.redisClient.quit();
        this.logger.log('Redis client closed');
      } catch (error: any) {
        this.logger.error(
          `Error closing Redis client: ${error.message}`,
          error.stack,
        );
      }
    }
  }

  /**
   * Check if Redis client is ready
   */
  isReady(): boolean {
    return this.ready;
  }

  /**
   * Store context data with optional TTL
   *
   * @param sessionId Session identifier
   * @param key Context key
   * @param value Context value
   * @param ttlSeconds Optional TTL in seconds
   */
  async setContext(
    sessionId: string,
    key: string,
    value: any,
    ttlSeconds?: number,
  ): Promise<void> {
    if (!this.ready) {
      throw new Error('Redis client is not ready');
    }

    try {
      const contextKey = this.getContextKey(sessionId, key);
      const serializedValue = JSON.stringify(value);

      if (ttlSeconds) {
        await this.redisClient.setEx(contextKey, ttlSeconds, serializedValue);
        this.logger.debug(
          `Set context for session ${sessionId}, key ${key} with TTL ${ttlSeconds}s`,
        );
      } else {
        await this.redisClient.set(contextKey, serializedValue);
        this.logger.debug(`Set context for session ${sessionId}, key ${key}`);
      }
    } catch (error: any) {
      this.logger.error(
        `Error setting context for session ${sessionId}, key ${key}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get context data
   *
   * @param sessionId Session identifier
   * @param key Context key
   * @returns The context value, or null if not found
   */
  async getContext(sessionId: string, key: string): Promise<any> {
    if (!this.ready) {
      throw new Error('Redis client is not ready');
    }

    try {
      const contextKey = this.getContextKey(sessionId, key);
      const value = await this.redisClient.get(contextKey);

      if (!value) {
        this.logger.debug(
          `Context not found for session ${sessionId}, key ${key}`,
        );
        return null;
      }

      this.logger.debug(`Got context for session ${sessionId}, key ${key}`);
      return JSON.parse(value);
    } catch (error: any) {
      this.logger.error(
        `Error getting context for session ${sessionId}, key ${key}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Delete context data
   *
   * @param sessionId Session identifier
   * @param key Context key
   */
  async deleteContext(sessionId: string, key: string): Promise<void> {
    if (!this.ready) {
      throw new Error('Redis client is not ready');
    }

    try {
      const contextKey = this.getContextKey(sessionId, key);
      await this.redisClient.del(contextKey);
      this.logger.debug(`Deleted context for session ${sessionId}, key ${key}`);
    } catch (error: any) {
      this.logger.error(
        `Error deleting context for session ${sessionId}, key ${key}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * List all context keys for a session
   *
   * @param sessionId Session identifier
   * @returns Array of context keys
   */
  async listContextKeys(sessionId: string): Promise<string[]> {
    if (!this.ready) {
      throw new Error('Redis client is not ready');
    }

    try {
      const pattern = `mcp:context:${sessionId}:*`;
      const keys = await this.redisClient.keys(pattern);

      // Strip the prefix to return just the user-facing keys
      const contextKeys = keys.map((k) =>
        k.replace(`mcp:context:${sessionId}:`, ''),
      );

      this.logger.debug(
        `Listed ${contextKeys.length} context keys for session ${sessionId}`,
      );

      return contextKeys;
    } catch (error: any) {
      this.logger.error(
        `Error listing context keys for session ${sessionId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Clear all context for a session
   *
   * @param sessionId Session identifier
   */
  async clearSessionContext(sessionId: string): Promise<void> {
    if (!this.ready) {
      throw new Error('Redis client is not ready');
    }

    try {
      const pattern = `mcp:context:${sessionId}:*`;
      const keys = await this.redisClient.keys(pattern);

      if (keys.length > 0) {
        await this.redisClient.del(keys);
        this.logger.debug(
          `Cleared ${keys.length} context keys for session ${sessionId}`,
        );
      } else {
        this.logger.debug(`No context to clear for session ${sessionId}`);
      }
    } catch (error: any) {
      this.logger.error(
        `Error clearing context for session ${sessionId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Helper method to generate Redis keys
   */
  private getContextKey(sessionId: string, key: string): string {
    return `mcp:context:${sessionId}:${key}`;
  }
}
