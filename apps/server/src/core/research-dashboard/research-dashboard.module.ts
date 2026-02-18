import { Module } from '@nestjs/common';
import { ResearchDashboardController } from './research-dashboard.controller';
import { ResearchDashboardService } from './research-dashboard.service';
import { DatabaseModule } from '../../database/database.module';
import { ResearchGraphModule } from '../research-graph/research-graph.module';

@Module({
  imports: [DatabaseModule, ResearchGraphModule],
  controllers: [ResearchDashboardController],
  providers: [ResearchDashboardService],
  exports: [ResearchDashboardService],
})
export class ResearchDashboardModule {}
