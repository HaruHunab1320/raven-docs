import { Module, forwardRef } from '@nestjs/common';
import { SlackService } from './slack.service';
import { SlackController } from './slack.controller';
import { DatabaseModule } from '../../database/database.module';
import { AgentModule } from '../../core/agent/agent.module';
import { ResearchModule } from '../../core/research/research.module';
import { MCPModule } from '../mcp/mcp.module';

@Module({
  imports: [DatabaseModule, AgentModule, MCPModule, forwardRef(() => ResearchModule)],
  providers: [SlackService],
  controllers: [SlackController],
  exports: [SlackService],
})
export class SlackModule {}
