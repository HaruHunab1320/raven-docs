import { Module } from '@nestjs/common';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeProcessorService } from './knowledge-processor.service';
import { VectorModule } from '../../integrations/vector/vector.module';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule, VectorModule],
  controllers: [KnowledgeController],
  providers: [KnowledgeService, KnowledgeProcessorService],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
