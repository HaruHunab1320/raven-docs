import { Module, forwardRef } from '@nestjs/common';
import { TeamDeploymentService } from './team-deployment.service';
import { RoleAwareLoopService } from './role-aware-loop.service';
import { TeamAgentLoopProcessor } from './team-agent-loop.processor';
import { WorkflowExecutorService } from './workflow-executor.service';
import { TeamCoordinatorListener } from './team-coordinator.listener';
import { TeamController } from './team.controller';
import { TeamDeploymentRepo } from '../../database/repos/team/team-deployment.repo';
import { TeamTemplateRepo } from '../../database/repos/team/team-template.repo';
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
  controllers: [TeamController],
  providers: [
    TeamDeploymentService,
    RoleAwareLoopService,
    TeamAgentLoopProcessor,
    WorkflowExecutorService,
    TeamCoordinatorListener,
    TeamDeploymentRepo,
    TeamTemplateRepo,
  ],
  exports: [TeamDeploymentService, RoleAwareLoopService, WorkflowExecutorService],
})
export class TeamModule {}
