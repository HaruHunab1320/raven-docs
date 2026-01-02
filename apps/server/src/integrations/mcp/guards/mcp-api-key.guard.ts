import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { MCPApiKeyService } from '../services/mcp-api-key.service';
import { UserService } from '../../../core/user/user.service';

/**
 * Guard that authenticates requests using MCP API keys
 */
@Injectable()
export class MCPApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(MCPApiKeyGuard.name);

  constructor(
    private readonly mcpApiKeyService: MCPApiKeyService,
    private readonly userService: UserService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    this.logger.debug(
      `MCPApiKeyGuard: Authorization header: ${authHeader ? 'exists' : 'missing'}`,
    );

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      this.logger.debug(
        'MCPApiKeyGuard: No Bearer token found in Authorization header',
      );
      return false;
    }

    const apiKey = authHeader.substring(7); // Remove "Bearer " prefix
    this.logger.debug(
      `MCPApiKeyGuard: API key received: ${apiKey.substring(0, 10)}...`,
    );

    // Skip if it doesn't look like an API key
    if (!apiKey.startsWith('mcp_')) {
      this.logger.debug(
        `MCPApiKeyGuard: Not an MCP API key, skipping (starts with: ${apiKey.substring(0, 5)})`,
      );
      return false;
    }

    try {
      this.logger.debug(
        `MCPApiKeyGuard: Validating API key: ${apiKey.substring(0, 10)}...`,
      );
      const keyData = await this.mcpApiKeyService.validateApiKey(apiKey);

      if (!keyData) {
        this.logger.warn(
          'MCPApiKeyGuard: API key validation failed - invalid or expired key',
        );
        return false;
      }

      this.logger.debug(
        `MCPApiKeyGuard: API key validated successfully. userId: ${keyData.userId}, workspaceId: ${keyData.workspaceId}`,
      );

      // Load the user associated with the API key
      this.logger.debug(
        `MCPApiKeyGuard: Looking up user with ID: ${keyData.userId}`,
      );
      const user = await this.userService.findById(
        keyData.userId,
        keyData.workspaceId,
      );

      if (!user) {
        this.logger.warn(
          `MCPApiKeyGuard: API key references non-existent user: ${keyData.userId}`,
        );
        return false;
      }

      this.logger.debug(`MCPApiKeyGuard: User found: ${user.email}`);

      // Attach the user and workspaceId to the request
      // Match the structure expected by the AuthUser decorator
      request['user'] = { user };
      request['workspaceId'] = keyData.workspaceId;

      this.logger.debug(
        'MCPApiKeyGuard: Authentication successful, user and workspaceId attached to request',
      );

      return true;
    } catch (error: any) {
      this.logger.error(
        `MCPApiKeyGuard: Error validating API key: ${error.message || 'Unknown error'}`,
        error.stack || '',
      );
      return false;
    }
  }
}
