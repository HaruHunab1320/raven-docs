import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PageRepo } from '../../../database/repos/page/page.repo';
import { ProjectRepo } from '../../../database/repos/project/project.repo';

@Injectable()
export class TrashRetentionService {
  private readonly logger = new Logger(TrashRetentionService.name);

  constructor(
    private readonly pageRepo: PageRepo,
    private readonly projectRepo: ProjectRepo,
  ) {}

  @Cron('0 3 * * *')
  async purgeTrash() {
    const retentionDays = Number(process.env.TRASH_RETENTION_DAYS ?? 30);
    if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
      return;
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);

    try {
      const deletedPages = await this.pageRepo.deleteDeletedBefore(cutoff);
      const deletedProjects = await this.projectRepo.deleteDeletedBefore(cutoff);
      this.logger.log(
        `Purged trash older than ${retentionDays} days (pages: ${deletedPages}, projects: ${deletedProjects}).`,
      );
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error('Failed to purge trash', error.stack || error.message);
      } else {
        this.logger.error('Failed to purge trash', String(error));
      }
    }
  }
}
