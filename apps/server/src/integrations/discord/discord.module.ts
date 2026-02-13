import { Module, forwardRef } from '@nestjs/common';
import { DiscordService } from './discord.service';
import { DiscordLinkingService } from './discord-linking.service';
import { DiscordController } from './discord.controller';
import { DatabaseModule } from '../../database/database.module';
import { AgentModule } from '../../core/agent/agent.module';
import { ResearchModule } from '../../core/research/research.module';
import { MCPModule } from '../mcp/mcp.module';
import { ProjectModule } from '../../core/project/project.module';

@Module({
  imports: [
    DatabaseModule,
    forwardRef(() => AgentModule),
    forwardRef(() => MCPModule),
    forwardRef(() => ResearchModule),
    forwardRef(() => ProjectModule),
  ],
  providers: [DiscordService, DiscordLinkingService],
  controllers: [DiscordController],
  exports: [DiscordService, DiscordLinkingService],
})
export class DiscordModule {}
