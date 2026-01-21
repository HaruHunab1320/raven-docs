import { Module, forwardRef } from '@nestjs/common';
import { DiscordService } from './discord.service';
import { DiscordController } from './discord.controller';
import { DatabaseModule } from '../../database/database.module';
import { AgentModule } from '../../core/agent/agent.module';
import { ResearchModule } from '../../core/research/research.module';
import { MCPModule } from '../mcp/mcp.module';

@Module({
  imports: [DatabaseModule, AgentModule, MCPModule, forwardRef(() => ResearchModule)],
  providers: [DiscordService],
  controllers: [DiscordController],
  exports: [DiscordService],
})
export class DiscordModule {}
