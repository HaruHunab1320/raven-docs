import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@raven-docs/db/types/kysely.types';
import { QueueName, QueueJob } from '../../integrations/queue/constants';
import { PatternDetectionService } from './pattern-detection.service';
import { PatternActionService } from './pattern-action.service';
import { PatternDetectionRepo } from '../../database/repos/pattern-detection/pattern-detection.repo';
import { resolveIntelligenceSettings } from '../workspace/intelligence-defaults';

@Processor(QueueName.GENERAL_QUEUE)
export class PatternDetectionProcessor extends WorkerHost {
  private readonly logger = new Logger(PatternDetectionProcessor.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly patternService: PatternDetectionService,
    private readonly patternActionService: PatternActionService,
    private readonly patternRepo: PatternDetectionRepo,
  ) {
    super();
  }

  async process(job: Job): Promise<any> {
    if (job.name !== QueueJob.PATTERN_DETECTION) {
      return; // Let other processors handle non-pattern jobs
    }

    const { workspaceId } = job.data;
    this.logger.log(`Running pattern detection for workspace ${workspaceId}`);

    try {
      // Load workspace settings
      const workspace = await this.db
        .selectFrom('workspaces')
        .select(['workspaces.id', 'workspaces.settings'])
        .where('workspaces.id', '=', workspaceId)
        .executeTakeFirst();

      if (!workspace) {
        this.logger.warn(`Workspace ${workspaceId} not found`);
        return;
      }

      const settings = resolveIntelligenceSettings(workspace.settings);
      if (!settings.enabled) {
        this.logger.log(
          `Intelligence disabled for workspace ${workspaceId}, skipping`,
        );
        return;
      }

      // Run all pattern evaluators
      const detected = await this.patternService.runAllPatterns(
        workspaceId,
        settings,
      );

      // Execute actions for newly detected patterns
      if (detected > 0) {
        const newPatterns = await this.patternRepo.listByWorkspace(
          workspaceId,
          { status: 'detected', limit: detected },
        );

        for (const pattern of newPatterns) {
          const rule = settings.patternRules.find(
            (r) => r.type === pattern.patternType,
          );
          if (rule) {
            await this.patternActionService.executeAction(rule.action, {
              id: pattern.id,
              workspaceId: pattern.workspaceId,
              patternType: pattern.patternType,
              severity: pattern.severity,
              title: pattern.title,
              details:
                typeof pattern.details === 'string'
                  ? JSON.parse(pattern.details)
                  : pattern.details || {},
            });
          }
        }
      }

      this.logger.log(
        `Pattern detection completed for workspace ${workspaceId}: ${detected} new pattern(s)`,
      );

      return { detected };
    } catch (error: any) {
      this.logger.error(
        `Pattern detection failed for workspace ${workspaceId}: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }
}
