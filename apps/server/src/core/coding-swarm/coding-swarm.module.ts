import { Module, forwardRef } from '@nestjs/common';
import { CodingSwarmService } from './coding-swarm.service';
import { CodingSwarmProcessor } from './coding-swarm.processor';
import { CodingSwarmListener } from './coding-swarm.listener';
import { CodingSwarmController } from './coding-swarm.controller';
import { AgentExecutionService } from './agent-execution.service';
import { WorkspacePreparationService } from './workspace-preparation.service';
import { GitWorkspaceModule } from '../git-workspace/git-workspace.module';
import { DatabaseModule } from '../../database/database.module';
import { ParallaxAgentsModule } from '../parallax-agents/parallax-agents.module';
import { MCPModule } from '../../integrations/mcp/mcp.module';
import { WsModule } from '../../ws/ws.module';

@Module({
  imports: [
    DatabaseModule,
    GitWorkspaceModule,
    forwardRef(() => ParallaxAgentsModule),
    forwardRef(() => MCPModule),
    WsModule,
  ],
  controllers: [CodingSwarmController],
  providers: [
    CodingSwarmService,
    CodingSwarmProcessor,
    CodingSwarmListener,
    AgentExecutionService,
    WorkspacePreparationService,
  ],
  exports: [CodingSwarmService, AgentExecutionService],
})
export class CodingSwarmModule {}
