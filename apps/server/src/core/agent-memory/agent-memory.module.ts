import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AgentMemoryController } from './agent-memory.controller';
import { AgentMemoryService } from './agent-memory.service';
import { AgentSummaryService } from './agent-summary.service';
import { AgentInsightsService } from './agent-insights.service';
import { AgentProfileService } from './agent-profile.service';
import { MemgraphModule } from '../../integrations/memgraph/memgraph.module';
import { AIModule } from '../../integrations/ai/ai.module';

@Module({
  imports: [DatabaseModule, MemgraphModule, AIModule],
  controllers: [AgentMemoryController],
  providers: [
    AgentMemoryService,
    AgentSummaryService,
    AgentInsightsService,
    AgentProfileService,
  ],
  exports: [
    AgentMemoryService,
    AgentSummaryService,
    AgentInsightsService,
    AgentProfileService,
  ],
})
export class AgentMemoryModule {}
