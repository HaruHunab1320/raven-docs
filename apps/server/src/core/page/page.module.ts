import { Module, forwardRef } from '@nestjs/common';
import { PageService } from './services/page.service';
import { PageController } from './page.controller';
import { PageHistoryService } from './services/page-history.service';
import { DatabaseModule } from '../../database/database.module';
import { AgentMemoryModule } from '../agent-memory/agent-memory.module';
import { ProjectModule } from '../project/project.module';
import { ResearchGraphModule } from '../research-graph/research-graph.module';

@Module({
  imports: [DatabaseModule, AgentMemoryModule, forwardRef(() => ProjectModule), ResearchGraphModule],
  controllers: [PageController],
  providers: [PageService, PageHistoryService],
  exports: [PageService, PageHistoryService],
})
export class PageModule {}
