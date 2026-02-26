import { Module, forwardRef } from '@nestjs/common';
import { TeamDeploymentService } from './team-deployment.service';
import { RoleAwareLoopService } from './role-aware-loop.service';
import { TeamAgentLoopProcessor } from './team-agent-loop.processor';
import { WorkflowExecutorService } from './workflow-executor.service';
import { TeamCoordinatorListener } from './team-coordinator.listener';
import { TeamRuntimeListener } from './team-runtime.listener';
import { TeamRuntimeSessionListener } from './team-runtime-session.listener';
import { TeamTemplateValidationService } from './team-template-validation.service';
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
import { WsModule } from '../../ws/ws.module';
import { CodingSwarmModule } from '../coding-swarm/coding-swarm.module';
import { TerminalModule } from '../terminal/terminal.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    DatabaseModule,
    WorkspaceModule,
    SpaceModule,
    AIModule,
    AgentMemoryModule,
    ContextAssemblyModule,
    WsModule,
    CodingSwarmModule,
    TerminalModule,
    UserModule,
    forwardRef(() => MCPModule),
  ],
  controllers: [TeamController],
  providers: [
    TeamDeploymentService,
    RoleAwareLoopService,
    TeamAgentLoopProcessor,
    WorkflowExecutorService,
    TeamCoordinatorListener,
    TeamRuntimeListener,
    TeamRuntimeSessionListener,
    TeamTemplateValidationService,
    TeamDeploymentRepo,
    TeamTemplateRepo,
  ],
  exports: [
    TeamDeploymentService,
    RoleAwareLoopService,
    WorkflowExecutorService,
    TeamTemplateValidationService,
  ],
})
export class TeamModule {}
