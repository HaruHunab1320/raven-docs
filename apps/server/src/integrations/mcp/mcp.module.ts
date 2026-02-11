import { Module, forwardRef } from '@nestjs/common';
import { MCPService } from './mcp.service';
import { PageHandler } from './handlers/page.handler';
import { ProjectHandler } from './handlers/project.handler';
import { TaskHandler } from './handlers/task.handler';
import { SpaceHandler } from './handlers/space.handler';
import { UserHandler } from './handlers/user.handler';
import { GroupHandler } from './handlers/group.handler';
import { WorkspaceHandler } from './handlers/workspace.handler';
import { AttachmentHandler } from './handlers/attachment.handler';
import { CommentHandler } from './handlers/comment.handler';
import { SystemHandler } from './handlers/system.handler';
import { ContextHandler } from './handlers/context.handler';
import { UIHandler } from './handlers/ui.handler';
import { ApprovalHandler } from './handlers/approval.handler';
import { SearchHandler } from './handlers/search.handler';
import { ImportHandler } from './handlers/import.handler';
import { ExportHandler } from './handlers/export.handler';
import { AIHandler } from './handlers/ai.handler';
import { MemoryHandler } from './handlers/memory.handler';
import { RepoHandler } from './handlers/repo.handler';
import { ResearchHandler } from './handlers/research.handler';
import { ParallaxAgentHandler } from './handlers/parallax-agent.handler';
import { GoalHandler } from './handlers/goal.handler';
import { ProfileHandler } from './handlers/profile.handler';
import { ReviewHandler } from './handlers/review.handler';
import { InsightsHandler } from './handlers/insights.handler';
import { KnowledgeHandler } from './handlers/knowledge.handler';
import { RepoBrowseService } from '../repo/repo-browse.service';
import { PageModule } from '../../core/page/page.module';
import { ProjectModule } from '../../core/project/project.module';
import { SpaceModule } from '../../core/space/space.module';
import { UserModule } from '../../core/user/user.module';
import { GroupModule } from '../../core/group/group.module';
import { WorkspaceModule } from '../../core/workspace/workspace.module';
import { CaslModule } from '../../core/casl/casl.module';
import { MCPPermissionGuard } from './guards/mcp-permission.guard';
import { AttachmentModule } from '../../core/attachment/attachment.module';
import { CommentModule } from '../../core/comment/comment.module';
import { MCPWebSocketGateway } from './mcp-websocket.gateway';
import { MCPEventService } from './services/mcp-event.service';
import { MCPSchemaService } from './services/mcp-schema.service';
import { MCPContextService } from './services/mcp-context.service';
import { TokenModule } from '../../core/auth/token.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { MCPApiKeyService } from './services/mcp-api-key.service';
import { ApiKeyController } from './controllers/api-key.controller';
import { ApprovalCenterController } from './controllers/approval-center.controller';
import { MCPApiKeyGuard } from './guards/mcp-api-key.guard';
import { MCPAuthGuard } from './guards/mcp-auth.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { EnvironmentModule } from '../../integrations/environment/environment.module';
import { DatabaseModule } from '../../database/database.module';
import { WorkspaceInjectionMiddleware } from './middleware/workspace-injection.middleware';
import { MCPApprovalService } from './services/mcp-approval.service';
import { ImportModule } from '../../integrations/import/import.module';
import { ExportModule } from '../../integrations/export/export.module';
import { SearchModule } from '../../core/search/search.module';
import { StorageModule } from '../../integrations/storage/storage.module';
import { AIModule } from '../../integrations/ai/ai.module';
import { AgentMemoryModule } from '../../core/agent-memory/agent-memory.module';
import { ResearchModule } from '../../core/research/research.module';
import { GoalModule } from '../../core/goal/goal.module';
import { AgentModule } from '../../core/agent/agent.module';
import { AgentPolicyService } from '../../core/agent/agent-policy.service';
import { ParallaxAgentsModule } from '../../core/parallax-agents/parallax-agents.module';
import { KnowledgeModule } from '../../core/knowledge/knowledge.module';

/**
 * Machine Control Protocol (MCP) Module
 *
 * This module provides MCP services, handlers, and websocket events that
 * back MCP Standard integrations and internal agent workflows.
 */
@Module({
  imports: [
    // Import modules that contain services needed by handlers
    PageModule,
    ProjectModule,
    SpaceModule,
    UserModule,
    GroupModule,
    WorkspaceModule,
    AttachmentModule,
    CommentModule,
    CaslModule,
    TokenModule,
    EnvironmentModule,
    DatabaseModule,
    ImportModule,
    ExportModule,
    SearchModule,
    StorageModule,
    AIModule,
    AgentMemoryModule,
    ResearchModule,
    GoalModule,
    forwardRef(() => AgentModule),
    forwardRef(() => ParallaxAgentsModule),
    KnowledgeModule,
    EventEmitterModule.forRoot(),
  ],
  controllers: [ApiKeyController, ApprovalCenterController],
  providers: [
    MCPService,
    // Register all handlers
    PageHandler,
    ProjectHandler,
    TaskHandler,
    SpaceHandler,
    UserHandler,
    GroupHandler,
    WorkspaceHandler,
    AttachmentHandler,
    CommentHandler,
    SystemHandler,
    ContextHandler,
    UIHandler,
    ApprovalHandler,
    SearchHandler,
    ImportHandler,
    ExportHandler,
    AIHandler,
    MemoryHandler,
    RepoHandler,
    ResearchHandler,
    ParallaxAgentHandler,
    GoalHandler,
    ProfileHandler,
    ReviewHandler,
    InsightsHandler,
    KnowledgeHandler,
    // Register services
    MCPSchemaService,
    MCPContextService,
    MCPApprovalService,
    AgentPolicyService,
    RepoBrowseService,
    // Register WebSocket components
    {
      provide: MCPWebSocketGateway,
      useClass: MCPWebSocketGateway,
    },
    MCPEventService,
    // Register API key service
    MCPApiKeyService,
    // Register guards
    JwtAuthGuard,
    MCPPermissionGuard,
    MCPApiKeyGuard,
    MCPAuthGuard,
    // Register middleware
    WorkspaceInjectionMiddleware,
  ],
  exports: [
    MCPService,
    MCPEventService,
    MCPApiKeyService,
    MCPSchemaService,
    MCPContextService,
    MCPApprovalService,
  ],
})
export class MCPModule {}
