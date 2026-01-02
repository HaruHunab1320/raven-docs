import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { MCPApiKeyGuard } from './mcp-api-key.guard';

/**
 * Combined authentication guard that supports both JWT and API Key authentication
 */
@Injectable()
export class MCPAuthGuard implements CanActivate {
  private readonly logger = new Logger(MCPAuthGuard.name);

  constructor(
    private readonly jwtAuthGuard: JwtAuthGuard,
    private readonly apiKeyGuard: MCPApiKeyGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    this.logger.debug('MCPAuthGuard: Attempting authentication');

    try {
      // First try JWT authentication
      this.logger.debug('MCPAuthGuard: Trying JWT authentication');
      const jwtResult = await this.jwtAuthGuard.canActivate(context);
      if (jwtResult) {
        this.logger.debug('MCPAuthGuard: JWT authentication successful');
        return true;
      }
      this.logger.debug('MCPAuthGuard: JWT authentication failed');
    } catch (error: any) {
      // JWT authentication failed, try API key
      this.logger.debug(
        `MCPAuthGuard: JWT authentication error: ${error.message || 'Unknown error'}`,
      );
    }

    // If JWT fails, try API key authentication
    this.logger.debug('MCPAuthGuard: Trying API key authentication');
    const apiKeyResult = await this.apiKeyGuard.canActivate(context);

    if (apiKeyResult) {
      this.logger.debug('MCPAuthGuard: API key authentication successful');
    } else {
      this.logger.warn('MCPAuthGuard: API key authentication failed');
    }

    return apiKeyResult;
  }
}
