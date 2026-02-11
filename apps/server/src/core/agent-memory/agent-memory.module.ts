import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AgentMemoryController } from './agent-memory.controller';
import { AgentMemoryService } from './agent-memory.service';
import { AgentInsightsService } from './agent-insights.service';
import { AgentProfileService } from './agent-profile.service';
import { MemgraphModule } from '../../integrations/memgraph/memgraph.module';
import { AIModule } from '../../integrations/ai/ai.module';
import { VectorModule } from '../../integrations/vector/vector.module';

@Module({
  imports: [DatabaseModule, MemgraphModule, AIModule, VectorModule],
  controllers: [AgentMemoryController],
  providers: [
    AgentMemoryService,
    AgentInsightsService,
    AgentProfileService,
  ],
  exports: [
    AgentMemoryService,
    AgentInsightsService,
    AgentProfileService,
  ],
})
export class AgentMemoryModule {}
