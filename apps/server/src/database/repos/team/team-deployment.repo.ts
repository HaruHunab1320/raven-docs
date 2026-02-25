import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '../../types/kysely.types';
import { dbOrTx } from '../../utils';
import { sql } from 'kysely';
import type { TeamRunLogEntry, WorkflowState } from '../../../core/team/workflow-state.types';

@Injectable()
export class TeamDeploymentRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  private parseJsonLike<T = any>(value: unknown): T | unknown {
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value) as T;
    } catch {
      return value;
    }
  }

  private normalizeDeploymentRow<T extends Record<string, any> | undefined>(
    row: T,
  ): T {
    if (!row) return row;
    const next = { ...row } as Record<string, any>;
    next.config = this.parseJsonLike(next.config);
    next.orgPattern = this.parseJsonLike(next.orgPattern);
    next.executionPlan = this.parseJsonLike(next.executionPlan);
    next.workflowState = this.parseJsonLike(next.workflowState);
    return next as T;
  }

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
        config: data.config,
        deployedBy: data.deployedBy,
        status: 'active',
        orgPattern: data.orgPattern || null,
        executionPlan: data.executionPlan || null,
      })
      .returningAll()
      .executeTakeFirst()
      .then((row) => this.normalizeDeploymentRow(row));
  }

  async findById(id: string, trx?: KyselyTransaction) {
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('teamDeployments')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst()
      .then((row) => this.normalizeDeploymentRow(row));
  }

  async listByWorkspace(
    workspaceId: string,
    opts?: { spaceId?: string; status?: string; includeTornDown?: boolean },
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
    if (!opts?.status && !opts?.includeTornDown) {
      query = query.where('status', '!=', 'torn_down');
    }

    const rows = await query.orderBy('createdAt', 'desc').execute();
    return rows.map((row) => this.normalizeDeploymentRow(row));
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
      .executeTakeFirst()
      .then((row) => this.normalizeDeploymentRow(row));
  }

  async updateConfig(id: string, config: Record<string, any>) {
    return this.db
      .updateTable('teamDeployments')
      .set({
        config,
        updatedAt: new Date(),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst()
      .then((row) => this.normalizeDeploymentRow(row));
  }

  // --- Team Agents ---

  async createAgent(
    data: {
      deploymentId: string;
      workspaceId: string;
      userId?: string;
      role: string;
      instanceNumber: number;
      agentType?: string;
      workdir?: string;
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
        agentType: data.agentType || null,
        workdir: data.workdir || null,
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

  async findAgentByRuntimeSessionId(runtimeSessionId: string) {
    return this.db
      .selectFrom('teamAgents')
      .selectAll()
      .where('runtimeSessionId', '=', runtimeSessionId)
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
        workflowState: state,
        updatedAt: new Date(),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst()
      .then((row) => this.normalizeDeploymentRow(row));
  }

  async getWorkflowState(id: string) {
    const row = await this.db
      .selectFrom('teamDeployments')
      .select(['workflowState', 'executionPlan', 'orgPattern'])
      .where('id', '=', id)
      .executeTakeFirst();
    return this.normalizeDeploymentRow(row) || null;
  }

  async findActiveDeploymentsInWorkspace(workspaceId: string) {
    const rows = await this.db
      .selectFrom('teamDeployments')
      .selectAll()
      .where('workspaceId', '=', workspaceId)
      .where('status', '=', 'active')
      .execute();
    return rows.map((row) => this.normalizeDeploymentRow(row));
  }

  async updateAgentCurrentStep(agentId: string, stepId: string | null) {
    return this.db
      .updateTable('teamAgents')
      .set({ currentStepId: stepId, updatedAt: new Date() })
      .where('id', '=', agentId)
      .returningAll()
      .executeTakeFirst();
  }

  async updateAgentRuntimeSession(
    agentId: string,
    data: {
      agentType?: string | null;
      workdir?: string | null;
      runtimeSessionId?: string | null;
      terminalSessionId?: string | null;
    },
  ) {
    return this.db
      .updateTable('teamAgents')
      .set({
        agentType: data.agentType ?? null,
        workdir: data.workdir ?? null,
        runtimeSessionId: data.runtimeSessionId ?? null,
        terminalSessionId: data.terminalSessionId ?? null,
        updatedAt: new Date(),
      })
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

  async appendRunLog(
    deploymentId: string,
    entry: TeamRunLogEntry,
    maxEntries = 200,
  ) {
    const stateRow = await this.getWorkflowState(deploymentId);
    const state =
      typeof stateRow?.workflowState === 'string'
        ? (JSON.parse(stateRow.workflowState) as WorkflowState)
        : ((stateRow?.workflowState || {}) as unknown as WorkflowState);

    const runLogs = Array.isArray(state.runLogs) ? state.runLogs : [];
    runLogs.push(entry);
    state.runLogs = runLogs.slice(-maxEntries);

    return this.updateWorkflowState(deploymentId, state as any);
  }
}
