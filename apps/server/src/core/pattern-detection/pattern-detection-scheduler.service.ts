import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@raven-docs/db/types/kysely.types';
import { QueueName, QueueJob } from '../../integrations/queue/constants';
import { resolveIntelligenceSettings } from '../workspace/intelligence-defaults';

@Injectable()
export class PatternDetectionSchedulerService {
  private readonly logger = new Logger(PatternDetectionSchedulerService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    @InjectQueue(QueueName.GENERAL_QUEUE) private readonly queue: Queue,
  ) {}

  @Cron('0 */6 * * *')
  async runScheduled() {
    this.logger.log('Running scheduled pattern detection...');

    const workspaces = await this.db
      .selectFrom('workspaces')
      .select(['workspaces.id', 'workspaces.settings'])
      .where('workspaces.deletedAt', 'is', null)
      .execute();

    let enqueued = 0;

    for (const workspace of workspaces) {
      const settings = resolveIntelligenceSettings(workspace.settings);
      if (!settings.enabled) continue;

      try {
        await this.queue.add(
          QueueJob.PATTERN_DETECTION,
          {
            workspaceId: workspace.id,
          },
          {
            removeOnComplete: true,
            removeOnFail: 100,
            attempts: 2,
            backoff: { type: 'exponential', delay: 30000 },
          },
        );
        enqueued++;
      } catch (error: any) {
        this.logger.warn(
          `Failed to enqueue pattern detection for workspace ${workspace.id}: ${error?.message}`,
        );
      }
    }

    this.logger.log(
      `Scheduled pattern detection: enqueued ${enqueued} workspace(s)`,
    );
  }
}
