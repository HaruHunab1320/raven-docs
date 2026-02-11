import { Module } from '@nestjs/common';
import { VectorSearchService } from './vector-search.service';
import { AIModule } from '../ai/ai.module';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule, AIModule],
  providers: [VectorSearchService],
  exports: [VectorSearchService],
})
export class VectorModule {}
