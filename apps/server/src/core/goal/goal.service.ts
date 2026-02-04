import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@raven-docs/db/types/kysely.types';
import { v7 as uuid7 } from 'uuid';

@Injectable()
export class GoalService {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async listGoals(workspaceId: string, creatorId: string, spaceId?: string) {
    let query = this.db
      .selectFrom('goals')
      .selectAll()
      .where('workspaceId', '=', workspaceId)
      .where('creatorId', '=', creatorId);

    if (spaceId) {
      query = query.where((eb) =>
        eb('spaceId', '=', spaceId).or('spaceId', 'is', null),
      );
    }

    return query.orderBy('createdAt', 'desc').execute();
  }

  async listGoalsForTask(taskId: string, workspaceId: string, creatorId: string) {
    return this.db
      .selectFrom('taskGoalAssignments')
      .innerJoin('tasks', 'tasks.id', 'taskGoalAssignments.taskId')
      .innerJoin('goals', 'goals.id', 'taskGoalAssignments.goalId')
      .select([
        'goals.id as id',
        'goals.name as name',
        'goals.horizon as horizon',
        'goals.description as description',
        'goals.keywords as keywords',
      ])
      .where('taskGoalAssignments.taskId', '=', taskId)
      .where('tasks.workspaceId', '=', workspaceId)
      .where('goals.creatorId', '=', creatorId)
      .execute();
  }

  async listGoalsForTasks(taskIds: string[], workspaceId: string, creatorId: string) {
    if (taskIds.length === 0) {
      return [];
    }

    return this.db
      .selectFrom('taskGoalAssignments')
      .innerJoin('tasks', 'tasks.id', 'taskGoalAssignments.taskId')
      .innerJoin('goals', 'goals.id', 'taskGoalAssignments.goalId')
      .select([
        'taskGoalAssignments.taskId as taskId',
        'goals.id as id',
        'goals.name as name',
        'goals.horizon as horizon',
        'goals.description as description',
        'goals.keywords as keywords',
      ])
      .where('taskGoalAssignments.taskId', 'in', taskIds)
      .where('tasks.workspaceId', '=', workspaceId)
      .where('goals.creatorId', '=', creatorId)
      .execute();
  }

  async createGoal(input: {
    workspaceId: string;
    creatorId: string;
    spaceId?: string;
    name: string;
    horizon: string;
    description?: string;
    keywords?: string[];
  }) {
    const now = new Date();
    return this.db
      .insertInto('goals')
      .values({
        id: uuid7(),
        workspaceId: input.workspaceId,
        creatorId: input.creatorId,
        spaceId: input.spaceId || null,
        name: input.name,
        horizon: input.horizon,
        description: input.description || null,
        keywords: input.keywords || [],
        createdAt: now,
        updatedAt: now,
      })
      .returningAll()
      .executeTakeFirst();
  }

  async updateGoal(input: {
    goalId: string;
    workspaceId: string;
    creatorId: string;
    spaceId?: string;
    name?: string;
    horizon?: string;
    description?: string;
    keywords?: string[];
  }) {
    // Verify ownership
    const existing = await this.db
      .selectFrom('goals')
      .select(['creatorId'])
      .where('id', '=', input.goalId)
      .where('workspaceId', '=', input.workspaceId)
      .executeTakeFirst();

    if (!existing) {
      throw new NotFoundException('Goal not found');
    }

    if (existing.creatorId !== input.creatorId) {
      throw new ForbiddenException('You can only update your own goals');
    }

    const updatePayload: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (input.name !== undefined) updatePayload.name = input.name;
    if (input.horizon !== undefined) updatePayload.horizon = input.horizon;
    if (input.description !== undefined) {
      updatePayload.description = input.description;
    }
    if (input.keywords !== undefined) updatePayload.keywords = input.keywords;
    if (input.spaceId !== undefined) updatePayload.spaceId = input.spaceId;

    const updated = await this.db
      .updateTable('goals')
      .set(updatePayload)
      .where('id', '=', input.goalId)
      .where('workspaceId', '=', input.workspaceId)
      .where('creatorId', '=', input.creatorId)
      .returningAll()
      .executeTakeFirst();

    return updated;
  }

  async deleteGoal(workspaceId: string, creatorId: string, goalId: string) {
    // Verify ownership
    const existing = await this.db
      .selectFrom('goals')
      .select(['creatorId'])
      .where('id', '=', goalId)
      .where('workspaceId', '=', workspaceId)
      .executeTakeFirst();

    if (!existing) {
      throw new NotFoundException('Goal not found');
    }

    if (existing.creatorId !== creatorId) {
      throw new ForbiddenException('You can only delete your own goals');
    }

    await this.db
      .deleteFrom('goals')
      .where('id', '=', goalId)
      .where('workspaceId', '=', workspaceId)
      .where('creatorId', '=', creatorId)
      .execute();

    return { deleted: true };
  }

  async assignGoal(taskId: string, goalId: string) {
    return this.db
      .insertInto('taskGoalAssignments')
      .values({
        id: uuid7(),
        taskId,
        goalId,
        createdAt: new Date(),
      })
      .onConflict((oc) => oc.columns(['taskId', 'goalId']).doNothing())
      .executeTakeFirst();
  }

  async unassignGoal(taskId: string, goalId: string) {
    await this.db
      .deleteFrom('taskGoalAssignments')
      .where('taskId', '=', taskId)
      .where('goalId', '=', goalId)
      .execute();
    return { deleted: true };
  }

  async findMatchingGoals(
    workspaceId: string,
    creatorId: string,
    spaceId: string | undefined,
    text: string,
  ) {
    const goals = await this.listGoals(workspaceId, creatorId, spaceId);
    const lowered = text.toLowerCase();
    return goals.filter((goal) => {
      const keywords = Array.isArray(goal.keywords) ? goal.keywords : [];
      return keywords.some((keyword) =>
        lowered.includes(String(keyword).toLowerCase()),
      );
    });
  }
}
