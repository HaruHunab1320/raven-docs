import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QueueName, QueueJob } from '../../integrations/queue/constants';
import { CodingSwarmService } from './coding-swarm.service';

@Processor(QueueName.GENERAL_QUEUE)
export class CodingSwarmProcessor extends WorkerHost {
  private readonly logger = new Logger(CodingSwarmProcessor.name);

  constructor(private readonly codingSwarmService: CodingSwarmService) {
    super();
  }

  async process(job: Job): Promise<any> {
    if (job.name !== QueueJob.CODING_SWARM) {
      return; // Let other processors handle non-swarm jobs
    }

    const { executionId } = job.data;
    this.logger.log(`Processing coding swarm execution: ${executionId}`);

    try {
      await this.codingSwarmService.processExecution(executionId);
      this.logger.log(`Coding swarm execution ${executionId} initiated`);
    } catch (error: any) {
      this.logger.error(
        `Coding swarm execution ${executionId} failed: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
