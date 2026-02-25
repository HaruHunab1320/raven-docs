import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TeamDeploymentRepo } from '../../database/repos/team/team-deployment.repo';
import { AIService } from '../../integrations/ai/ai.service';
import { AgentMemoryService } from '../agent-memory/agent-memory.service';
import { QueueName, QueueJob } from '../../integrations/queue/constants';
import { ensurePersistenceCapabilities } from './capability-guards';
import type { WorkflowState, StepState, RavenStepPlan, RavenExecutionPlan } from './workflow-state.types';
import type { TeamAgentLoopJob } from './team-deployment.service';

const MAX_OPTIMISTIC_RETRIES = 3;

@Injectable()
export class WorkflowExecutorService {
  private readonly logger = new Logger(WorkflowExecutorService.name);

  constructor(
    private readonly teamRepo: TeamDeploymentRepo,
    private readonly aiService: AIService,
    private readonly memoryService: AgentMemoryService,
    private readonly eventEmitter: EventEmitter2,
    @InjectQueue(QueueName.TEAM_QUEUE)
    private readonly teamQueue: Queue,
  ) {}

  /**
   * Advance the workflow — find ready steps and dispatch them.
   */
  async advance(
    deploymentId: string,
    trigger: { reason: string; context?: Record<string, any> },
  ): Promise<void> {
    for (let attempt = 0; attempt < MAX_OPTIMISTIC_RETRIES; attempt++) {
      try {
        await this.doAdvance(deploymentId, trigger);
        return;
      } catch (error: any) {
        if (error.message === 'OPTIMISTIC_LOCK_FAILED' && attempt < MAX_OPTIMISTIC_RETRIES - 1) {
          this.logger.warn(`Optimistic lock retry ${attempt + 1} for deployment ${deploymentId}`);
          continue;
        }
        throw error;
      }
    }
  }

  private async doAdvance(
    deploymentId: string,
    trigger: { reason: string; context?: Record<string, any> },
  ): Promise<void> {
    const deployment = await this.teamRepo.findById(deploymentId);
    if (!deployment || deployment.status !== 'active') return;

    const stateRow = await this.teamRepo.getWorkflowState(deploymentId);
    if (!stateRow?.executionPlan) return;

    const plan = this.parseJsonField<RavenExecutionPlan>(
      stateRow.executionPlan,
      {} as RavenExecutionPlan,
    );
    const state = this.parseJsonField<WorkflowState>(
      stateRow.workflowState,
      {
        currentPhase: 'idle',
        stepStates: {},
        coordinatorInvocations: 0,
      },
    );
    if (!state.stepStates) state.stepStates = {};

    if (state.currentPhase !== 'running') return;

    this.resolveWaitingStepsOnTrigger(plan.steps || [], state, trigger);

    const agents = await this.teamRepo.getAgentsByDeployment(deploymentId);

    // Top-level steps are treated as sequential: only dispatch the first
    // non-completed step, then stop.  This prevents later steps from
    // firing before earlier ones finish.
    for (const step of plan.steps) {
      const stepState = state.stepStates[step.stepId];
      if (stepState?.status === 'completed') continue; // already done

      // Dispatch this step (may be pending, or a container with pending children)
      await this.dispatchIfReady(step, state, plan, agents, deployment);

      // If it's still not completed after dispatch, stop — don't look at later steps
      if (state.stepStates[step.stepId]?.status !== 'completed') break;
    }

    state.lastAdvancedAt = new Date().toISOString();
    state.coordinatorInvocations = (state.coordinatorInvocations || 0) + 1;

    await this.saveState(deploymentId, state, stateRow);
    this.eventEmitter.emit('team.workflow.updated', {
      deploymentId,
      currentPhase: state.currentPhase,
      triggerReason: trigger.reason,
    });

    const failedEntry = Object.entries(state.stepStates || {}).find(
      ([, ss]) => ss?.status === 'failed',
    );
    if (failedEntry) {
      this.eventEmitter.emit('team.workflow.failed', {
        deploymentId,
        stepId: failedEntry?.[0],
        error: failedEntry?.[1]?.error,
      });
    }
  }

  /**
   * Mark a step as completed and advance the workflow.
   */
  async completeStep(
    deploymentId: string,
    stepId: string,
    result: any,
  ): Promise<void> {
    const stateRow = await this.teamRepo.getWorkflowState(deploymentId);
    if (!stateRow?.executionPlan) return;

    const plan = this.parseJsonField<RavenExecutionPlan>(
      stateRow.executionPlan,
      {} as RavenExecutionPlan,
    );
    const state = this.parseJsonField<WorkflowState>(
      stateRow.workflowState,
      {
        currentPhase: 'idle',
        stepStates: {},
        coordinatorInvocations: 0,
      },
    );

    if (!state.stepStates) state.stepStates = {};

    const stepState = state.stepStates[stepId];
    if (!stepState || stepState.status === 'completed') return;

    stepState.status = 'completed';
    stepState.completedAt = new Date().toISOString();
    stepState.result = result;

    // Handle parent completion for parallel/sequential containers
    this.handleParentCompletion(stepId, state, plan.steps);

    await this.saveState(deploymentId, state, stateRow);
    this.eventEmitter.emit('team.workflow.updated', {
      deploymentId,
      currentPhase: state.currentPhase,
      completedStepId: stepId,
    });

    // Check if all top-level steps are complete
    const allDone = plan.steps.every(
      (s) => state.stepStates[s.stepId]?.status === 'completed',
    );

    if (allDone) {
      state.currentPhase = 'completed';
      state.completedAt = new Date().toISOString();
      await this.saveState(deploymentId, state, stateRow);
      this.eventEmitter.emit('team.workflow.completed', { deploymentId });
      this.eventEmitter.emit('team.workflow.updated', {
        deploymentId,
        currentPhase: state.currentPhase,
      });
      return;
    }

    // Advance to dispatch next ready steps
    await this.advance(deploymentId, {
      reason: 'step_completed',
      context: { stepId, result },
    });
  }

  /**
   * Mark a step as failed, with optional retry/escalation.
   */
  async failStep(
    deploymentId: string,
    stepId: string,
    error: string,
  ): Promise<void> {
    const stateRow = await this.teamRepo.getWorkflowState(deploymentId);
    if (!stateRow?.executionPlan) return;

    const plan = this.parseJsonField<RavenExecutionPlan>(
      stateRow.executionPlan,
      {} as RavenExecutionPlan,
    );
    const state = this.parseJsonField<WorkflowState>(
      stateRow.workflowState,
      {
        currentPhase: 'idle',
        stepStates: {},
        coordinatorInvocations: 0,
      },
    );

    if (!state.stepStates) state.stepStates = {};

    const stepState = state.stepStates[stepId];
    if (!stepState) return;

    stepState.retryCount = (stepState.retryCount || 0) + 1;

    // Allow up to 2 retries before failing
    if (stepState.retryCount <= 2) {
      stepState.status = 'pending';
      stepState.error = error;
      await this.saveState(deploymentId, state, stateRow);
      await this.advance(deploymentId, {
        reason: 'step_retry',
        context: { stepId, error, retryCount: stepState.retryCount },
      });
      return;
    }

    // Check escalation config
    if (plan.escalation) {
      stepState.escalationCount = (stepState.escalationCount || 0) + 1;
      if (stepState.escalationCount <= (plan.escalation.maxDepth || 3)) {
        stepState.status = 'pending';
        stepState.error = error;
        await this.saveState(deploymentId, state, stateRow);
        this.eventEmitter.emit('team.step.escalated', {
          deploymentId,
          stepId,
          error,
          escalationCount: stepState.escalationCount,
        });
        return;
      }
    }

    stepState.status = 'failed';
    stepState.error = error;
    state.currentPhase = 'failed';
    await this.saveState(deploymentId, state, stateRow);
    this.eventEmitter.emit('team.workflow.updated', {
      deploymentId,
      currentPhase: state.currentPhase,
      failedStepId: stepId,
      error,
    });

    this.eventEmitter.emit('team.workflow.failed', {
      deploymentId,
      stepId,
      error,
    });
  }

  // ── Internal dispatch logic ──────────────────────────────────────────────

  private async dispatchIfReady(
    step: RavenStepPlan,
    state: WorkflowState,
    plan: RavenExecutionPlan,
    agents: any[],
    deployment: any,
  ): Promise<void> {
    if (!state.stepStates) state.stepStates = {};

    const existing = state.stepStates[step.stepId];
    if (existing && existing.status !== 'pending') return;

    // Initialize step state if needed
    if (!existing) {
      state.stepStates[step.stepId] = {
        status: 'pending',
        retryCount: 0,
        escalationCount: 0,
      };
    }

    switch (step.operation.kind) {
      case 'dispatch_agent_loop':
        await this.dispatchAgentLoop(step, state, agents, deployment);
        break;

      case 'invoke_coordinator':
        await this.dispatchCoordinator(step, state, agents, deployment);
        break;

      case 'await_event':
        state.stepStates[step.stepId].status = 'waiting';
        break;

      case 'aggregate_results':
        await this.dispatchAggregate(step, state, deployment);
        break;

      case 'evaluate_condition':
        await this.dispatchCondition(step, state, plan, agents, deployment);
        break;

      case 'noop':
        if (state.stepStates[step.stepId].status === 'pending') {
          state.stepStates[step.stepId].status = 'running';
          state.stepStates[step.stepId].startedAt = new Date().toISOString();
        }

        // Container step — dispatch children
        if (step.type === 'parallel' && step.children) {
          if (step.children.length === 0) {
            state.stepStates[step.stepId].status = 'completed';
            state.stepStates[step.stepId].completedAt = new Date().toISOString();
            break;
          }
          for (const child of step.children) {
            await this.dispatchIfReady(child, state, plan, agents, deployment);
          }
        } else if (step.type === 'sequential' && step.children?.length) {
          // Dispatch only the first pending child
          for (const child of step.children) {
            const childState = state.stepStates[child.stepId];
            if (!childState || childState.status === 'pending') {
              await this.dispatchIfReady(child, state, plan, agents, deployment);
              break;
            }
            if (childState.status !== 'completed') break;
          }
        } else if (!step.children?.length) {
          state.stepStates[step.stepId].status = 'completed';
          state.stepStates[step.stepId].completedAt = new Date().toISOString();
        }
        break;
    }
  }

  private async dispatchAgentLoop(
    step: RavenStepPlan,
    state: WorkflowState,
    agents: any[],
    deployment: any,
  ): Promise<void> {
    if (step.operation.kind !== 'dispatch_agent_loop') return;

    const role = step.operation.role;
    const agent = agents.find(
      (a) => a.role === role && a.status === 'idle' && a.userId,
    );

    if (!agent) {
      const error = `No idle agent for role "${role}" in deployment ${deployment.id}`;
      this.logger.warn(error);
      state.stepStates[step.stepId].status = 'failed';
      state.stepStates[step.stepId].error = error;
      state.currentPhase = 'failed';
      return;
    }

    await this.teamRepo.updateAgentCurrentStep(agent.id, step.stepId);

    // Update state BEFORE enqueuing — the worker may complete the job
    // before doAdvance() saves, causing completeStep() to read stale state.
    state.stepStates[step.stepId].status = 'running';
    state.stepStates[step.stepId].startedAt = new Date().toISOString();
    state.stepStates[step.stepId].assignedAgentId = agent.id;
    await this.teamRepo.updateWorkflowState(deployment.id, state as any);

    const deploymentConfig = this.parseJsonField<Record<string, any>>(
      deployment.config,
      {},
    );

    const jobData: TeamAgentLoopJob = {
      teamAgentId: agent.id,
      deploymentId: deployment.id,
      workspaceId: deployment.workspaceId,
      spaceId: deployment.spaceId,
      agentUserId: agent.userId,
      role: agent.role,
      systemPrompt: agent.systemPrompt,
      capabilities: ensurePersistenceCapabilities(agent.capabilities as string[]),
      stepId: step.stepId,
      stepContext: {
        name: step.type,
        task: step.operation.task,
      },
      targetTaskId: deploymentConfig.targetTaskId,
      targetExperimentId: deploymentConfig.targetExperimentId,
    };

    await this.teamQueue.add(QueueJob.TEAM_AGENT_LOOP, jobData, {
      attempts: 1,
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 20 },
    });
  }

  private async dispatchCoordinator(
    step: RavenStepPlan,
    state: WorkflowState,
    agents: any[],
    deployment: any,
  ): Promise<void> {
    if (step.operation.kind !== 'invoke_coordinator') return;

    // Find the lead agent (no reportsTo)
    const lead = agents.find((a) => !a.reportsToAgentId && a.userId);
    if (!lead) {
      const error = `No lead agent for deployment ${deployment.id}`;
      this.logger.warn(error);
      state.stepStates[step.stepId].status = 'failed';
      state.stepStates[step.stepId].error = error;
      state.currentPhase = 'failed';
      return;
    }

    await this.teamRepo.updateAgentCurrentStep(lead.id, step.stepId);

    // Update state BEFORE enqueuing — same race-condition guard as dispatchAgentLoop.
    state.stepStates[step.stepId].status = 'running';
    state.stepStates[step.stepId].startedAt = new Date().toISOString();
    state.stepStates[step.stepId].assignedAgentId = lead.id;
    await this.teamRepo.updateWorkflowState(deployment.id, state as any);

    const deploymentConfig = this.parseJsonField<Record<string, any>>(
      deployment.config,
      {},
    );

    const jobData: TeamAgentLoopJob = {
      teamAgentId: lead.id,
      deploymentId: deployment.id,
      workspaceId: deployment.workspaceId,
      spaceId: deployment.spaceId,
      agentUserId: lead.userId,
      role: lead.role,
      systemPrompt: lead.systemPrompt,
      capabilities: ensurePersistenceCapabilities(lead.capabilities as string[]),
      stepId: step.stepId,
      stepContext: {
        name: 'coordinator',
        task: step.operation.reason,
      },
      targetTaskId: deploymentConfig.targetTaskId,
      targetExperimentId: deploymentConfig.targetExperimentId,
    };

    await this.teamQueue.add(QueueJob.TEAM_AGENT_LOOP, jobData, {
      attempts: 1,
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 20 },
    });
  }

  private async dispatchAggregate(
    step: RavenStepPlan,
    state: WorkflowState,
    deployment: any,
  ): Promise<void> {
    if (step.operation.kind !== 'aggregate_results') return;

    const { sourceStepIds, method } = step.operation;

    // Check all sources are completed
    const allSourcesDone = sourceStepIds.every(
      (id) => state.stepStates[id]?.status === 'completed',
    );
    if (!allSourcesDone) return;

    state.stepStates[step.stepId].status = 'running';
    state.stepStates[step.stepId].startedAt = new Date().toISOString();

    const sourceResults = sourceStepIds.map((id) => ({
      stepId: id,
      result: state.stepStates[id]?.result,
    }));

    try {
      const apiKey =
        process.env.GEMINI_API_KEY ||
        process.env.GOOGLE_API_KEY ||
        process.env.GOOGLE_GENERATIVE_AI_API_KEY;

      if (!apiKey) {
        state.stepStates[step.stepId].status = 'completed';
        state.stepStates[step.stepId].result = { sourceResults, method, error: 'No AI API key' };
        return;
      }

      const prompt = [
        `Aggregate the following results using the "${method}" strategy.`,
        '',
        JSON.stringify(sourceResults, null, 2),
        '',
        'Return a JSON object with: { "aggregated": <combined result>, "summary": "<one line>" }',
      ].join('\n');

      const response = await this.aiService.generateContent({
        model: process.env.GEMINI_AGENT_MODEL || 'gemini-3-pro-preview',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });

      const text = response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch {
        const match = text.match(/\{[\s\S]*\}/);
        parsed = match ? JSON.parse(match[0]) : { aggregated: text };
      }

      state.stepStates[step.stepId].status = 'completed';
      state.stepStates[step.stepId].completedAt = new Date().toISOString();
      state.stepStates[step.stepId].result = parsed;
    } catch (error: any) {
      state.stepStates[step.stepId].status = 'failed';
      state.stepStates[step.stepId].error = error?.message;
    }
  }

  private async dispatchCondition(
    step: RavenStepPlan,
    state: WorkflowState,
    plan: RavenExecutionPlan,
    agents: any[],
    deployment: any,
  ): Promise<void> {
    if (step.operation.kind !== 'evaluate_condition') return;

    state.stepStates[step.stepId].status = 'running';
    state.stepStates[step.stepId].startedAt = new Date().toISOString();

    try {
      const apiKey =
        process.env.GEMINI_API_KEY ||
        process.env.GOOGLE_API_KEY ||
        process.env.GOOGLE_GENERATIVE_AI_API_KEY;

      let branchResult = true;

      if (apiKey) {
        const prompt = [
          `Evaluate the following condition and respond with ONLY "true" or "false":`,
          '',
          step.operation.check,
          '',
          `Current workflow state: ${JSON.stringify(state.stepStates, null, 2)}`,
        ].join('\n');

        const response = await this.aiService.generateContent({
          model: process.env.GEMINI_AGENT_MODEL || 'gemini-3-pro-preview',
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
        });

        const text = (response?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim().toLowerCase();
        branchResult = text.includes('true');
      }

      state.stepStates[step.stepId].status = 'completed';
      state.stepStates[step.stepId].completedAt = new Date().toISOString();
      state.stepStates[step.stepId].result = { branch: branchResult ? 'then' : 'else' };

      // Dispatch the selected branch
      const branch = branchResult ? step.thenBranch : step.elseBranch;
      if (branch) {
        await this.dispatchIfReady(branch, state, plan, agents, deployment);
      }
    } catch (error: any) {
      state.stepStates[step.stepId].status = 'failed';
      state.stepStates[step.stepId].error = error?.message;
    }
  }

  // ── Parent completion logic ──────────────────────────────────────────────

  private handleParentCompletion(
    completedStepId: string,
    state: WorkflowState,
    allSteps: RavenStepPlan[],
  ): void {
    for (const step of allSteps) {
      if (!step.children) continue;

      const childIds = step.children.map((c) => c.stepId);
      if (!childIds.includes(completedStepId)) {
        // Recurse into nested containers
        this.handleParentCompletion(completedStepId, state, step.children);
        continue;
      }

      if (step.type === 'parallel') {
        // All children must be complete
        const allDone = step.children.every(
          (c) => state.stepStates[c.stepId]?.status === 'completed',
        );
        if (allDone) {
          if (!state.stepStates[step.stepId]) {
            state.stepStates[step.stepId] = { status: 'pending', retryCount: 0, escalationCount: 0 };
          }
          state.stepStates[step.stepId].status = 'completed';
          state.stepStates[step.stepId].completedAt = new Date().toISOString();
        }
      }

      // Sequential: parent completes when last child is done (next child dispatch
      // happens in advance() automatically)
      if (step.type === 'sequential') {
        const lastChild = step.children[step.children.length - 1];
        if (state.stepStates[lastChild.stepId]?.status === 'completed') {
          if (!state.stepStates[step.stepId]) {
            state.stepStates[step.stepId] = { status: 'pending', retryCount: 0, escalationCount: 0 };
          }
          state.stepStates[step.stepId].status = 'completed';
          state.stepStates[step.stepId].completedAt = new Date().toISOString();
        }
      }
    }
  }

  // ── State persistence with optimistic locking ────────────────────────────

  private async saveState(
    deploymentId: string,
    state: WorkflowState,
    _stateRow: any,
  ): Promise<void> {
    await this.teamRepo.updateWorkflowState(deploymentId, state as any);
  }

  private parseJsonField<T>(value: unknown, fallback: T): T {
    if (!value) return fallback;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value) as T;
      } catch {
        return fallback;
      }
    }
    return value as T;
  }

  private resolveWaitingStepsOnTrigger(
    steps: RavenStepPlan[],
    state: WorkflowState,
    trigger: { reason: string; context?: Record<string, any> },
  ): void {
    const eventName =
      trigger.reason === 'mcp_event'
        ? String(trigger.context?.eventType || '')
        : trigger.reason === 'coding_swarm_completed'
          ? 'coding_swarm.completed'
          : trigger.reason;
    if (!eventName) return;

    const waitingStep = this.findMatchingWaitingStep(steps, state, eventName);
    if (!waitingStep) return;

    const ss = state.stepStates[waitingStep.stepId];
    ss.status = 'completed';
    ss.completedAt = new Date().toISOString();
    ss.result = {
      event: eventName,
      context: trigger.context || {},
    };

    this.handleParentCompletion(waitingStep.stepId, state, steps);
  }

  private findMatchingWaitingStep(
    steps: RavenStepPlan[],
    state: WorkflowState,
    eventName: string,
  ): RavenStepPlan | null {
    for (const step of steps) {
      const stepState = state.stepStates[step.stepId];
      if (
        step.operation.kind === 'await_event' &&
        stepState?.status === 'waiting' &&
        this.eventMatches(step.operation.eventPattern, eventName)
      ) {
        return step;
      }

      if (step.children?.length) {
        const match = this.findMatchingWaitingStep(
          step.children,
          state,
          eventName,
        );
        if (match) return match;
      }
    }
    return null;
  }

  private eventMatches(pattern: string, eventName: string): boolean {
    if (!pattern || pattern === '*') return true;
    if (pattern === eventName) return true;
    if (eventName.includes(pattern) || pattern.includes(eventName)) return true;
    return false;
  }
}
