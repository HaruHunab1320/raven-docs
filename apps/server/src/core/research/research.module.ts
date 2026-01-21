import { Module, forwardRef } from '@nestjs/common';
import { ResearchController } from './research.controller';
import { ResearchJobService } from './research-job.service';
import { ResearchJobProcessor } from './processors/research-job.processor';
import { SearchModule } from '../search/search.module';
import { DatabaseModule } from '../../database/database.module';
import { QueueModule } from '../../integrations/queue/queue.module';
import { RepoBrowseService } from '../../integrations/repo/repo-browse.service';
import { WebSearchService } from './web-search.service';
import { PageModule } from '../page/page.module';
import { AgentMemoryModule } from '../agent-memory/agent-memory.module';
import { AIModule } from '../../integrations/ai/ai.module';
import { CaslModule } from '../casl/casl.module';
import { SlackModule } from '../../integrations/slack/slack.module';
import { DiscordModule } from '../../integrations/discord/discord.module';

@Module({
  imports: [
    DatabaseModule,
    QueueModule,
    SearchModule,
    PageModule,
    AgentMemoryModule,
    AIModule,
    CaslModule,
    forwardRef(() => SlackModule),
    forwardRef(() => DiscordModule),
  ],
  controllers: [ResearchController],
  providers: [
    ResearchJobService,
    ResearchJobProcessor,
    RepoBrowseService,
    WebSearchService,
  ],
  exports: [ResearchJobService],
})
export class ResearchModule {}
