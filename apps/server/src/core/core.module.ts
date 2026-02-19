import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { WorkspaceModule } from './workspace/workspace.module';
import { PageModule } from './page/page.module';
import { AttachmentModule } from './attachment/attachment.module';
import { CommentModule } from './comment/comment.module';
import { SearchModule } from './search/search.module';
import { SpaceModule } from './space/space.module';
import { GroupModule } from './group/group.module';
import { CaslModule } from './casl/casl.module';
import { DomainMiddleware } from '../common/middlewares/domain.middleware';
import { ProjectModule } from './project/project.module';
import { DatabaseModule } from '../database/database.module';
import { EnvironmentModule } from '../integrations/environment/environment.module';
import { AgentMemoryModule } from './agent-memory/agent-memory.module';
import { AgentModule } from './agent/agent.module';
import { GoalModule } from './goal/goal.module';
import { ResearchModule } from './research/research.module';
import { ParallaxAgentsModule } from './parallax-agents/parallax-agents.module';
import { TerminalModule } from './terminal/terminal.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { BugReportModule } from './bug-report/bug-report.module';
import { ResearchGraphModule } from './research-graph/research-graph.module';
import { ContextAssemblyModule } from './context-assembly/context-assembly.module';
import { TeamModule } from './team/team.module';
import { ResearchDashboardModule } from './research-dashboard/research-dashboard.module';
import { PatternDetectionModule } from './pattern-detection/pattern-detection.module';
import { GitWorkspaceModule } from './git-workspace/git-workspace.module';
import { CodingSwarmModule } from './coding-swarm/coding-swarm.module';

const modules = [
  UserModule,
  AuthModule,
  WorkspaceModule,
  PageModule,
  AttachmentModule,
  CommentModule,
  SearchModule,
  SpaceModule,
  GroupModule,
  CaslModule,
  ProjectModule,
  AgentMemoryModule,
  AgentModule,
  GoalModule,
  ResearchModule,
  ParallaxAgentsModule,
  TerminalModule,
  KnowledgeModule,
  BugReportModule,
  ResearchGraphModule,
  ContextAssemblyModule,
  TeamModule,
  ResearchDashboardModule,
  PatternDetectionModule,
  GitWorkspaceModule,
  CodingSwarmModule,
];

@Module({
  imports: [...modules, DatabaseModule, EnvironmentModule],
  controllers: [],
  providers: [],
  exports: [...modules],
})
export class CoreModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(DomainMiddleware)
      .exclude(
        { path: 'auth/setup', method: RequestMethod.POST },
        { path: 'health', method: RequestMethod.GET },
        { path: 'health/live', method: RequestMethod.GET },
        { path: 'api-keys/register', method: RequestMethod.POST },
        { path: 'mcp-standard/(.*)', method: RequestMethod.ALL },
      )
      .forRoutes('*');
  }
}
