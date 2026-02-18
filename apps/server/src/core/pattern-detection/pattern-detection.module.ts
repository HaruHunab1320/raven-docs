import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DatabaseModule } from '../../database/database.module';
import { ResearchGraphModule } from '../research-graph/research-graph.module';
import { QueueName } from '../../integrations/queue/constants';
import { PatternDetectionService } from './pattern-detection.service';
import { PatternActionService } from './pattern-action.service';
import { PatternDetectionSchedulerService } from './pattern-detection-scheduler.service';
import { PatternDetectionProcessor } from './pattern-detection.processor';

@Module({
  imports: [
    DatabaseModule,
    ResearchGraphModule,
    BullModule.registerQueue({ name: QueueName.GENERAL_QUEUE }),
  ],
  providers: [
    PatternDetectionService,
    PatternActionService,
    PatternDetectionSchedulerService,
    PatternDetectionProcessor,
  ],
  exports: [PatternDetectionService],
})
export class PatternDetectionModule {}
