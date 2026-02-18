import { Module } from '@nestjs/common';
import { ContextAssemblyService } from './context-assembly.service';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { ResearchGraphModule } from '../research-graph/research-graph.module';
import { VectorModule } from '../../integrations/vector/vector.module';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule, KnowledgeModule, ResearchGraphModule, VectorModule],
  providers: [ContextAssemblyService],
  exports: [ContextAssemblyService],
})
export class ContextAssemblyModule {}
