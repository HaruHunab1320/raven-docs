import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@raven-docs/db/types/kysely.types';

@Injectable()
export class PatternActionService {
  private readonly logger = new Logger(PatternActionService.name);

  constructor(
    private readonly eventEmitter: EventEmitter2,
    @InjectKysely() private readonly db: KyselyDB,
  ) {}

  async executeAction(
    action: string,
    pattern: {
      id: string;
      workspaceId: string;
      patternType: string;
      severity: string;
      title: string;
      details: Record<string, any>;
    },
  ): Promise<void> {
    switch (action) {
      case 'notify':
        this.eventEmitter.emit('pattern.detected', {
          patternId: pattern.id,
          workspaceId: pattern.workspaceId,
          patternType: pattern.patternType,
          severity: pattern.severity,
          title: pattern.title,
          details: pattern.details,
        });
        break;

      case 'flag':
        // Pattern record itself is the flag — no additional action needed
        break;

      case 'surface':
        this.eventEmitter.emit('pattern.detected', {
          patternId: pattern.id,
          workspaceId: pattern.workspaceId,
          patternType: pattern.patternType,
          severity: pattern.severity,
          title: pattern.title,
          details: pattern.details,
          surface: true,
        });
        break;

      case 'create_task':
        await this.createTaskForPattern(pattern);
        break;

      default:
        this.logger.warn(`Unknown pattern action: ${action}`);
    }
  }

  private async createTaskForPattern(pattern: {
    workspaceId: string;
    title: string;
    details: Record<string, any>;
  }): Promise<void> {
    try {
      // Find a default space in the workspace for the task
      const space = await this.db
        .selectFrom('spaces')
        .select('spaces.id')
        .where('spaces.workspaceId', '=', pattern.workspaceId)
        .where('spaces.deletedAt', 'is', null)
        .orderBy('spaces.createdAt', 'asc')
        .executeTakeFirst();

      if (!space) {
        this.logger.warn(
          `Cannot create task for pattern: no space found in workspace ${pattern.workspaceId}`,
        );
        return;
      }

      await this.db
        .insertInto('tasks')
        .values({
          workspaceId: pattern.workspaceId,
          spaceId: space.id,
          title: `[Auto] ${pattern.title}`,
          description: JSON.stringify(pattern.details),
          status: 'todo',
        } as any)
        .execute();
    } catch (error: any) {
      this.logger.warn(
        `Failed to create task for pattern: ${error?.message}`,
      );
    }
  }
}
