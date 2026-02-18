import { Module, forwardRef } from '@nestjs/common';
import { TeamDeploymentService } from './team-deployment.service';
import { RoleAwareLoopService } from './role-aware-loop.service';
import { TeamAgentLoopProcessor } from './team-agent-loop.processor';
import { TeamDeploymentRepo } from '../../database/repos/team/team-deployment.repo';
import { DatabaseModule } from '../../database/database.module';
import { WorkspaceModule } from '../workspace/workspace.module';
import { SpaceModule } from '../space/space.module';
import { AIModule } from '../../integrations/ai/ai.module';
import { AgentMemoryModule } from '../agent-memory/agent-memory.module';
import { ContextAssemblyModule } from '../context-assembly/context-assembly.module';
import { MCPModule } from '../../integrations/mcp/mcp.module';

@Module({
  imports: [
    DatabaseModule,
    WorkspaceModule,
    SpaceModule,
    AIModule,
    AgentMemoryModule,
    ContextAssemblyModule,
    forwardRef(() => MCPModule),
  ],
  providers: [
    TeamDeploymentService,
    RoleAwareLoopService,
    TeamAgentLoopProcessor,
    TeamDeploymentRepo,
  ],
  exports: [TeamDeploymentService, RoleAwareLoopService],
})
export class TeamModule {}
