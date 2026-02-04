import { Module, forwardRef } from '@nestjs/common';
import { ParallaxAgentsService } from './parallax-agents.service';
import { ParallaxAgentsController } from './parallax-agents.controller';
import { ParallaxAgentsListener } from './parallax-agents.listener';
import { RuntimeConnectionService } from './runtime-connection.service';
import { DatabaseModule } from '../../database/database.module';
import { MCPModule } from '../../integrations/mcp/mcp.module';
import { TerminalModule } from '../terminal/terminal.module';
import { WsModule } from '../../ws/ws.module';
import { WorkspaceModule } from '../workspace/workspace.module';

@Module({
  imports: [
    DatabaseModule,
    forwardRef(() => MCPModule), // Forward ref to avoid circular dependency
    forwardRef(() => TerminalModule), // Terminal sessions for agent runtime
    forwardRef(() => WorkspaceModule), // For creating agent user accounts
    WsModule, // For broadcasting events to frontend
  ],
  controllers: [ParallaxAgentsController],
  providers: [ParallaxAgentsService, ParallaxAgentsListener, RuntimeConnectionService],
  exports: [ParallaxAgentsService, RuntimeConnectionService],
})
export class ParallaxAgentsModule {}
