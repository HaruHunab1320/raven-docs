import { Module, forwardRef } from '@nestjs/common';
import { CodingSwarmService } from './coding-swarm.service';
import { CodingSwarmProcessor } from './coding-swarm.processor';
import { CodingSwarmListener } from './coding-swarm.listener';
import { AgentExecutionService } from './agent-execution.service';
import { GitWorkspaceModule } from '../git-workspace/git-workspace.module';
import { DatabaseModule } from '../../database/database.module';
import { ParallaxAgentsModule } from '../parallax-agents/parallax-agents.module';
import { WsModule } from '../../ws/ws.module';

@Module({
  imports: [
    DatabaseModule,
    GitWorkspaceModule,
    forwardRef(() => ParallaxAgentsModule),
    WsModule,
  ],
  providers: [
    CodingSwarmService,
    CodingSwarmProcessor,
    CodingSwarmListener,
    AgentExecutionService,
  ],
  exports: [CodingSwarmService, AgentExecutionService],
})
export class CodingSwarmModule {}
