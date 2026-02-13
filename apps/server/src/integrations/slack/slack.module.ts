import { Module, forwardRef } from '@nestjs/common';
import { SlackService } from './slack.service';
import { SlackLinkingService } from './slack-linking.service';
import { SlackController } from './slack.controller';
import { DatabaseModule } from '../../database/database.module';
import { AgentModule } from '../../core/agent/agent.module';
import { ResearchModule } from '../../core/research/research.module';
import { MCPModule } from '../mcp/mcp.module';

@Module({
  imports: [DatabaseModule, forwardRef(() => AgentModule), forwardRef(() => MCPModule), forwardRef(() => ResearchModule)],
  providers: [SlackService, SlackLinkingService],
  controllers: [SlackController],
  exports: [SlackService, SlackLinkingService],
})
export class SlackModule {}
