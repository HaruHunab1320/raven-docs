import { Module, forwardRef } from '@nestjs/common';
import { CodingSwarmService } from './coding-swarm.service';
import { CodingSwarmProcessor } from './coding-swarm.processor';
import { CodingSwarmListener } from './coding-swarm.listener';
import { CodingSwarmController } from './coding-swarm.controller';
import { AgentExecutionService } from './agent-execution.service';
import { StallClassifierService } from './stall-classifier.service';
import { WorkspacePreparationService } from './workspace-preparation.service';
import { GitWorkspaceModule } from '../git-workspace/git-workspace.module';
import { DatabaseModule } from '../../database/database.module';
import { ParallaxAgentsModule } from '../parallax-agents/parallax-agents.module';
import { AIModule } from '../../integrations/ai/ai.module';
import { MCPModule } from '../../integrations/mcp/mcp.module';
import { WsModule } from '../../ws/ws.module';
import { TerminalModule } from '../terminal/terminal.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    DatabaseModule,
    GitWorkspaceModule,
    AIModule,
    forwardRef(() => ParallaxAgentsModule),
    forwardRef(() => MCPModule),
    forwardRef(() => TerminalModule),
    UserModule,
    WsModule,
  ],
  controllers: [CodingSwarmController],
  providers: [
    CodingSwarmService,
    CodingSwarmProcessor,
    CodingSwarmListener,
    AgentExecutionService,
    StallClassifierService,
    WorkspacePreparationService,
  ],
  exports: [CodingSwarmService, AgentExecutionService, StallClassifierService, WorkspacePreparationService],
})
export class CodingSwarmModule {}
