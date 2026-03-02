import { Module, MiddlewareConsumer, RequestMethod, forwardRef } from '@nestjs/common';
import { MCPStandardController } from './mcp-standard.controller';
import { MCPStandardService } from './mcp-standard.service';
import { MCPModule } from '../mcp/mcp.module';
import { UserModule } from '../../core/user/user.module';
import { TeamModule } from '../../core/team/team.module';
import { WorkspaceInjectionMiddleware } from '../mcp/middleware/workspace-injection.middleware';

@Module({
  imports: [MCPModule, UserModule, forwardRef(() => TeamModule)],
  controllers: [MCPStandardController],
  providers: [MCPStandardService, WorkspaceInjectionMiddleware],
  exports: [MCPStandardService],
})
export class MCPStandardModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(WorkspaceInjectionMiddleware)
      .forRoutes(
        { path: 'mcp-standard/*', method: RequestMethod.POST }
      );
  }
}