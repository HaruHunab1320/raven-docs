import { Module, forwardRef } from '@nestjs/common';
import { ParallaxAgentsService } from './parallax-agents.service';
import { ParallaxAgentsController } from './parallax-agents.controller';
import { DatabaseModule } from '../../database/database.module';
import { MCPModule } from '../../integrations/mcp/mcp.module';

@Module({
  imports: [
    DatabaseModule,
    forwardRef(() => MCPModule), // Forward ref to avoid circular dependency
  ],
  controllers: [ParallaxAgentsController],
  providers: [ParallaxAgentsService],
  exports: [ParallaxAgentsService],
})
export class ParallaxAgentsModule {}
