/**
 * Repository for managing Parallax agent assignments
 * Handles assigning agents to projects and tasks
 */
import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '../../types/kysely.types';
import { sql } from 'kysely';

export type AssignmentType = 'project' | 'task';
export type AgentRole = 'member' | 'lead';

export interface ParallaxAgentAssignment {
  id: string;
  agentId: string;
  workspaceId: string;
  assignmentType: AssignmentType;
  projectId: string | null;
  taskId: string | null;
  role: AgentRole;
  assignedAt: Date;
  assignedBy: string | null;
  unassignedAt: Date | null;
}

export interface InsertableAgentAssignment {
  agentId: string;
  workspaceId: string;
  assignmentType: AssignmentType;
  projectId?: string | null;
  taskId?: string | null;
  role?: AgentRole;
  assignedBy?: string | null;
}

@Injectable()
export class ParallaxAgentAssignmentRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  private baseFields = [
    'id',
    'agentId',
    'workspaceId',
    'assignmentType',
    'projectId',
    'taskId',
    'role',
    'assignedAt',
    'assignedBy',
    'unassignedAt',
  ] as const;

  async create(
    assignment: InsertableAgentAssignment,
  ): Promise<ParallaxAgentAssignment> {
    return this.db
      .insertInto('parallaxAgentAssignments')
      .values({
        ...assignment,
        role: assignment.role || 'member',
      })
      .returning(this.baseFields)
      .executeTakeFirstOrThrow() as Promise<ParallaxAgentAssignment>;
  }

  async findById(id: string): Promise<ParallaxAgentAssignment | undefined> {
    return this.db
      .selectFrom('parallaxAgentAssignments')
      .select(this.baseFields)
      .where('id', '=', id)
      .executeTakeFirst() as Promise<ParallaxAgentAssignment | undefined>;
  }

  async findActiveByAgent(agentId: string): Promise<ParallaxAgentAssignment[]> {
    return this.db
      .selectFrom('parallaxAgentAssignments')
      .select(this.baseFields)
      .where('agentId', '=', agentId)
      .where('unassignedAt', 'is', null)
      .orderBy('assignedAt', 'desc')
      .execute() as Promise<ParallaxAgentAssignment[]>;
  }

  async findByProject(projectId: string): Promise<ParallaxAgentAssignment[]> {
    return this.db
      .selectFrom('parallaxAgentAssignments')
      .select(this.baseFields)
      .where('projectId', '=', projectId)
      .where('unassignedAt', 'is', null)
      .orderBy('assignedAt', 'desc')
      .execute() as Promise<ParallaxAgentAssignment[]>;
  }

  async findByTask(taskId: string): Promise<ParallaxAgentAssignment[]> {
    return this.db
      .selectFrom('parallaxAgentAssignments')
      .select(this.baseFields)
      .where('taskId', '=', taskId)
      .where('unassignedAt', 'is', null)
      .orderBy('assignedAt', 'desc')
      .execute() as Promise<ParallaxAgentAssignment[]>;
  }

  async findExistingAssignment(
    agentId: string,
    projectId?: string,
    taskId?: string,
  ): Promise<ParallaxAgentAssignment | undefined> {
    let query = this.db
      .selectFrom('parallaxAgentAssignments')
      .select(this.baseFields)
      .where('agentId', '=', agentId)
      .where('unassignedAt', 'is', null);

    if (projectId) {
      query = query.where('projectId', '=', projectId);
    }
    if (taskId) {
      query = query.where('taskId', '=', taskId);
    }

    return query.executeTakeFirst() as Promise<
      ParallaxAgentAssignment | undefined
    >;
  }

  async unassign(id: string): Promise<ParallaxAgentAssignment | undefined> {
    return this.db
      .updateTable('parallaxAgentAssignments')
      .set({ unassignedAt: sql`now()` })
      .where('id', '=', id)
      .where('unassignedAt', 'is', null)
      .returning(this.baseFields)
      .executeTakeFirst() as Promise<ParallaxAgentAssignment | undefined>;
  }

  async unassignAllByAgent(agentId: string): Promise<number> {
    const result = await this.db
      .updateTable('parallaxAgentAssignments')
      .set({ unassignedAt: sql`now()` })
      .where('agentId', '=', agentId)
      .where('unassignedAt', 'is', null)
      .executeTakeFirst();

    return Number(result.numUpdatedRows ?? 0);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom('parallaxAgentAssignments')
      .where('id', '=', id)
      .executeTakeFirst();

    return (result.numDeletedRows ?? 0) > 0;
  }

  async countActiveByAgent(agentId: string): Promise<number> {
    const result = await this.db
      .selectFrom('parallaxAgentAssignments')
      .select(sql`count(*)`.as('count'))
      .where('agentId', '=', agentId)
      .where('unassignedAt', 'is', null)
      .executeTakeFirst();

    return Number(result?.count || 0);
  }
}
