import { Injectable, Logger } from '@nestjs/common';
import { TaskService } from '../../../core/project/services/task.service';
import { ResearchDashboardService } from '../../../core/research-dashboard/research-dashboard.service';
import SpaceAbilityFactory from '../../../core/casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../../core/casl/interfaces/space-ability.type';
import { User } from '@raven-docs/db/types/entity.types';
import {
  createInternalError,
  createInvalidParamsError,
  createPermissionDeniedError,
} from '../utils/error.utils';

const OPEN_QUESTION_LABEL_NAME = 'open-question';
const OPEN_QUESTION_LABEL_COLOR = '#f59e0b'; // amber

/**
 * MCP Handler for Open Question operations
 *
 * Open questions are tracked as tasks with the "open-question" label.
 *
 * Methods:
 * - openquestion.create: Create a task and assign the "open-question" label
 * - openquestion.list: List open questions via ResearchDashboardService
 */
@Injectable()
export class OpenQuestionHandler {
  private readonly logger = new Logger(OpenQuestionHandler.name);

  constructor(
    private readonly taskService: TaskService,
    private readonly dashboardService: ResearchDashboardService,
    private readonly spaceAbility: SpaceAbilityFactory,
  ) {}

  /**
   * Create an open question (task + label)
   * Method: openquestion.create
   */
  async create(params: any, userId: string) {
    this.logger.debug(`OpenQuestionHandler.create called by ${userId}`);
    try {
      if (!params.title) {
        throw createInvalidParamsError('title is required');
      }
      if (!params.workspaceId) {
        throw createInvalidParamsError('workspaceId is required');
      }
      if (!params.spaceId) {
        throw createInvalidParamsError('spaceId is required');
      }

      // Permission check
      const user = { id: userId } as User;
      const ability = await this.spaceAbility.createForUser(user, params.spaceId);
      if (ability.cannot(SpaceCaslAction.Manage, SpaceCaslSubject.Page)) {
        throw createPermissionDeniedError('You do not have permission to create tasks in this space');
      }

      // Create the task
      const task = await this.taskService.create(userId, params.workspaceId, {
        title: params.title,
        description: params.description,
        spaceId: params.spaceId,
        priority: params.priority,
      });

      // Find or create the "open-question" label
      const labelId = await this.findOrCreateLabel(params.workspaceId);

      // Assign the label to the task
      await this.taskService.assignLabel(params.workspaceId, task.id, labelId);

      return {
        success: true,
        task: {
          id: task.id,
          title: task.title,
          status: task.status,
          priority: task.priority,
        },
        label: OPEN_QUESTION_LABEL_NAME,
      };
    } catch (error: any) {
      this.logger.error(
        `Error in openquestion.create: ${error.message || 'Unknown error'}`,
        error.stack,
      );
      if (error.code && typeof error.code === 'number') throw error;
      throw createInternalError(error.message || String(error));
    }
  }

  /**
   * List open questions
   * Method: openquestion.list
   */
  async list(params: any, userId: string) {
    this.logger.debug(`OpenQuestionHandler.list called by ${userId}`);
    try {
      if (!params.workspaceId) {
        throw createInvalidParamsError('workspaceId is required');
      }

      const questions = await this.dashboardService.getOpenQuestions(
        params.workspaceId,
        params.spaceId,
      );

      return {
        questions,
        total: questions.length,
      };
    } catch (error: any) {
      this.logger.error(
        `Error in openquestion.list: ${error.message || 'Unknown error'}`,
        error.stack,
      );
      if (error.code && typeof error.code === 'number') throw error;
      throw createInternalError(error.message || String(error));
    }
  }

  /**
   * Find the "open-question" label or create it if it doesn't exist.
   */
  private async findOrCreateLabel(workspaceId: string): Promise<string> {
    const labels = await this.taskService.listLabels(workspaceId);
    const existing = labels.find(
      (l: any) => l.name.toLowerCase() === OPEN_QUESTION_LABEL_NAME,
    );
    if (existing) return existing.id;

    const created = await this.taskService.createLabel(workspaceId, {
      name: OPEN_QUESTION_LABEL_NAME,
      color: OPEN_QUESTION_LABEL_COLOR,
    });
    return created.id;
  }
}
