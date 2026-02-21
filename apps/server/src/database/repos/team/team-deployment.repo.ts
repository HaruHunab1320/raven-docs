import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '../../types/kysely.types';
import { dbOrTx } from '../../utils';
import { sql } from 'kysely';

@Injectable()
export class TeamDeploymentRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async createDeployment(
    data: {
      workspaceId: string;
      spaceId: string;
      projectId?: string;
      templateName: string;
      config: Record<string, any>;
      deployedBy: string;
      orgPattern?: Record<string, any>;
      executionPlan?: Record<string, any>;
    },
    trx?: KyselyTransaction,
  ) {
    const db = dbOrTx(this.db, trx);
    return db
      .insertInto('teamDeployments')
      .values({
        workspaceId: data.workspaceId,
        spaceId: data.spaceId,
        projectId: data.projectId || null,
        templateName: data.templateName,
        config: JSON.stringify(data.config),
        deployedBy: data.deployedBy,
        status: 'active',
        orgPattern: data.orgPattern
          ? JSON.stringify(data.orgPattern)
          : null,
        executionPlan: data.executionPlan
          ? JSON.stringify(data.executionPlan)
          : null,
      })
      .returningAll()
      .executeTakeFirst();
  }

  async findById(id: string, trx?: KyselyTransaction) {
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('teamDeployments')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  async listByWorkspace(
    workspaceId: string,
    opts?: { spaceId?: string; status?: string },
  ) {
    let query = this.db
      .selectFrom('teamDeployments')
      .selectAll()
      .where('workspaceId', '=', workspaceId);

    if (opts?.spaceId) {
      query = query.where('spaceId', '=', opts.spaceId);
    }
    if (opts?.status) {
      query = query.where('status', '=', opts.status);
    }

    return query.orderBy('createdAt', 'desc').execute();
  }

  async updateStatus(id: string, status: string, trx?: KyselyTransaction) {
    const db = dbOrTx(this.db, trx);
    const updateData: any = { status, updatedAt: new Date() };
    if (status === 'torn_down') {
      updateData.tornDownAt = new Date();
    }
    return db
      .updateTable('teamDeployments')
      .set(updateData)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  // --- Team Agents ---

  async createAgent(
    data: {
      deploymentId: string;
      workspaceId: string;
      userId?: string;
      role: string;
      instanceNumber: number;
      systemPrompt: string;
      capabilities: string[];
    },
    trx?: KyselyTransaction,
  ) {
    const db = dbOrTx(this.db, trx);
    return db
      .insertInto('teamAgents')
      .values({
        deploymentId: data.deploymentId,
        workspaceId: data.workspaceId,
        userId: data.userId || null,
        role: data.role,
        instanceNumber: data.instanceNumber,
        systemPrompt: data.systemPrompt,
        capabilities: data.capabilities,
        status: 'idle',
      })
      .returningAll()
      .executeTakeFirst();
  }

  async getAgentsByDeployment(deploymentId: string) {
    return this.db
      .selectFrom('teamAgents')
      .selectAll()
      .where('deploymentId', '=', deploymentId)
      .orderBy('role')
      .orderBy('instanceNumber')
      .execute();
  }

  async getActiveAgentsByWorkspace(workspaceId: string) {
    return this.db
      .selectFrom('teamAgents')
      .selectAll()
      .innerJoin(
        'teamDeployments',
        'teamDeployments.id',
        'teamAgents.deploymentId',
      )
      .where('teamAgents.workspaceId', '=', workspaceId)
      .where('teamDeployments.status', '=', 'active')
      .where('teamAgents.status', '!=', 'paused')
      .select([
        'teamDeployments.spaceId',
        'teamDeployments.projectId',
        'teamDeployments.templateName',
      ])
      .execute();
  }

  async updateAgentStatus(
    id: string,
    status: string,
    trx?: KyselyTransaction,
  ) {
    const db = dbOrTx(this.db, trx);
    return db
      .updateTable('teamAgents')
      .set({ status, updatedAt: new Date() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  async updateAgentRunStats(
    id: string,
    data: {
      lastRunAt: Date;
      lastRunSummary: string;
      actionsExecuted: number;
      errorsEncountered: number;
    },
  ) {
    return this.db
      .updateTable('teamAgents')
      .set({
        lastRunAt: data.lastRunAt,
        lastRunSummary: data.lastRunSummary,
        totalActions: sql`total_actions + ${data.actionsExecuted}`,
        totalErrors: sql`total_errors + ${data.errorsEncountered}`,
        updatedAt: new Date(),
      })
      .where('id', '=', id)
      .execute();
  }

  async findAgentById(id: string) {
    return this.db
      .selectFrom('teamAgents')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  /**
   * Atomic task claiming — assigns a task to an agent only if unassigned.
   * Returns the task if claimed, null if already taken.
   */
  async claimTask(
    taskId: string,
    agentUserId: string,
    workspaceId: string,
  ) {
    const result = await this.db
      .updateTable('tasks')
      .set({
        assigneeId: agentUserId,
        status: 'in_progress',
        updatedAt: new Date(),
      })
      .where('id', '=', taskId)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .where((eb) =>
        eb.or([
          eb('assigneeId', 'is', null),
          eb('assigneeId', '=', agentUserId),
        ]),
      )
      .where('status', 'in', ['todo', 'blocked'])
      .returningAll()
      .executeTakeFirst();

    return result || null;
  }

  // --- Workflow State ---

  async updateWorkflowState(id: string, state: Record<string, any>) {
    return this.db
      .updateTable('teamDeployments')
      .set({
        workflowState: JSON.stringify(state),
        updatedAt: new Date(),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
  }

  async getWorkflowState(id: string) {
    const row = await this.db
      .selectFrom('teamDeployments')
      .select(['workflowState', 'executionPlan', 'orgPattern'])
      .where('id', '=', id)
      .executeTakeFirst();
    return row || null;
  }

  async findActiveDeploymentsInWorkspace(workspaceId: string) {
    return this.db
      .selectFrom('teamDeployments')
      .selectAll()
      .where('workspaceId', '=', workspaceId)
      .where('status', '=', 'active')
      .execute();
  }

  async updateAgentCurrentStep(agentId: string, stepId: string | null) {
    return this.db
      .updateTable('teamAgents')
      .set({ currentStepId: stepId, updatedAt: new Date() })
      .where('id', '=', agentId)
      .returningAll()
      .executeTakeFirst();
  }

  async updateAgentReportsTo(agentId: string, reportsToAgentId: string | null) {
    return this.db
      .updateTable('teamAgents')
      .set({ reportsToAgentId, updatedAt: new Date() })
      .where('id', '=', agentId)
      .returningAll()
      .executeTakeFirst();
  }
}
