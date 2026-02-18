import { Module } from '@nestjs/common';
import { MemgraphModule } from '../../integrations/memgraph/memgraph.module';
import { ResearchGraphService } from './research-graph.service';
import { ResearchGraphController } from './research-graph.controller';

@Module({
  imports: [MemgraphModule],
  controllers: [ResearchGraphController],
  providers: [ResearchGraphService],
  exports: [ResearchGraphService],
})
export class ResearchGraphModule {}
