import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { QueueName, QueueJob } from '../../integrations/queue/constants';
import { TeamAgentLoopJob } from './team-deployment.service';
import { TeamDeploymentRepo } from '../../database/repos/team/team-deployment.repo';
import { AgentExecutionService } from '../coding-swarm/agent-execution.service';
import { TerminalSessionService } from '../terminal/terminal-session.service';

@Processor(QueueName.TEAM_QUEUE)
export class TeamAgentLoopProcessor extends WorkerHost {
  private readonly logger = new Logger(TeamAgentLoopProcessor.name);
  private readonly agentTypeAliases: Record<string, string> = {
    'claude-code': 'claude',
    claudecode: 'claude',
    claude_code: 'claude',
    'gemini-cli': 'gemini',
    gemini_cli: 'gemini',
    'gpt-codex': 'codex',
    'openai-codex': 'codex',
  };

  constructor(
    private readonly teamRepo: TeamDeploymentRepo,
    private readonly eventEmitter: EventEmitter2,
    private readonly agentExecution: AgentExecutionService,
    private readonly terminalSessionService: TerminalSessionService,
  ) {
    super();
  }

  async process(job: Job): Promise<any> {
    if (job.name !== QueueJob.TEAM_AGENT_LOOP) {
      return; // Let other processors handle non-team jobs
    }

    const data = job.data as TeamAgentLoopJob;
    const startedAt = Date.now();
    this.logger.log(
      `Running team agent loop: ${data.role} (agent=${data.teamAgentId})`,
    );

    try {
      // Mark agent as running
      await this.teamRepo.updateAgentStatus(data.teamAgentId, 'running');
      this.eventEmitter.emit('team.agent_loop.started', {
        deploymentId: data.deploymentId,
        teamAgentId: data.teamAgentId,
        role: data.role,
        stepId: data.stepId,
      });

      const runtimeSessionId = await this.ensureRuntimeSession(data);
      await this.dispatchRuntimeTask(runtimeSessionId, data);

      await this.teamRepo.updateAgentRunStats(data.teamAgentId, {
        lastRunAt: new Date(),
        lastRunSummary: `Dispatched runtime task to session ${runtimeSessionId}; waiting for runtime completion event.`,
        actionsExecuted: 0,
        errorsEncountered: 0,
      });

      try {
        await this.teamRepo.appendRunLog(data.deploymentId, {
          id: `${Date.now()}-${data.teamAgentId}`,
          timestamp: new Date().toISOString(),
          deploymentId: data.deploymentId,
          teamAgentId: data.teamAgentId,
          role: data.role,
          stepId: data.stepId,
          summary: `Runtime dispatch queued for session ${runtimeSessionId}`,
          actionsExecuted: 0,
          errorsEncountered: 0,
          actions: [{ method: 'runtime.dispatch', status: 'executed' }],
        });
      } catch {
        // Log persistence is best-effort and should not fail runs.
      }

      this.logger.log(
        `Team agent loop dispatched: ${data.role} -> ${runtimeSessionId}`,
      );

      return {
        status: 'dispatched',
        runtimeSessionId,
      };
    } catch (error: any) {
      this.logger.error(
        `Team agent loop failed: ${data.role} — ${error?.message}`,
        error?.stack,
      );

      // Clear currentStepId and mark agent as error
      if (data.stepId) {
        await this.teamRepo.updateAgentCurrentStep(data.teamAgentId, null);
      }
      await this.teamRepo.updateAgentStatus(data.teamAgentId, 'error');
      await this.teamRepo.updateAgentRunStats(data.teamAgentId, {
        lastRunAt: new Date(),
        lastRunSummary: `Error: ${error?.message || 'Unknown'}`,
        actionsExecuted: 0,
        errorsEncountered: 1,
      });
      try {
        await this.teamRepo.appendRunLog(data.deploymentId, {
          id: `${Date.now()}-${data.teamAgentId}`,
          timestamp: new Date().toISOString(),
          deploymentId: data.deploymentId,
          teamAgentId: data.teamAgentId,
          role: data.role,
          stepId: data.stepId,
          summary: `Loop failed after ${Date.now() - startedAt}ms`,
          actionsExecuted: 0,
          errorsEncountered: 1,
          actions: [
            {
              method: data.stepId || 'team.agent_loop',
              status: 'failed',
              error: error?.message || 'Unknown error',
            },
          ],
        });
      } catch {
        // Log persistence is best-effort and should not fail runs.
      }

      // Emit failure event for workflow advancement
      this.eventEmitter.emit('team.agent_loop.failed', {
        deploymentId: data.deploymentId,
        teamAgentId: data.teamAgentId,
        stepId: data.stepId,
        error: error?.message || 'Unknown error',
      });

      throw error;
    }
  }

  private async ensureRuntimeSession(data: TeamAgentLoopJob): Promise<string> {
    const agent = await this.teamRepo.findAgentById(data.teamAgentId);
    if (!agent) {
      throw new Error(`Team agent ${data.teamAgentId} not found`);
    }
    if (agent.runtimeSessionId) return agent.runtimeSessionId;

    try {
      const deployment = await this.teamRepo.findById(data.deploymentId);
      const deploymentConfig =
        deployment && typeof deployment.config === 'string'
          ? JSON.parse(deployment.config)
          : (deployment?.config as Record<string, any> | undefined);

      const roleDef = Array.isArray(deploymentConfig?.roles)
        ? deploymentConfig.roles.find((r: any) => r?.role === agent.role)
        : null;
      const triggerUserId = deployment?.deployedBy || data.agentUserId;

      const agentType =
        this.normalizeAgentType(
          agent.agentType ||
            roleDef?.agentType ||
            deploymentConfig?.defaultAgentType ||
            process.env.TEAM_AGENT_DEFAULT_TYPE ||
            'claude',
        );
      const workdir =
        agent.workdir ||
        roleDef?.workdir ||
        deploymentConfig?.workdir ||
        process.env.TEAM_AGENT_DEFAULT_WORKDIR ||
        process.cwd();

      const spawned = await this.agentExecution.spawn(
        data.workspaceId,
        {
          type: agentType,
          name: `team-${data.deploymentId.slice(0, 8)}-${agent.role}-${agent.instanceNumber}`,
          workdir,
        },
        triggerUserId || undefined,
      );

      const terminalSession = await this.terminalSessionService.createSession(
        data.teamAgentId,
        data.workspaceId,
        spawned.id,
        {
          title: `Team ${agent.role} #${agent.instanceNumber}`,
        },
      );

      await this.teamRepo.updateAgentRuntimeSession(data.teamAgentId, {
        agentType,
        workdir,
        runtimeSessionId: spawned.id,
        terminalSessionId: terminalSession.id,
      });

      this.logger.log(
        `Bootstrapped team runtime session for ${data.teamAgentId}: runtime=${spawned.id} terminal=${terminalSession.id}`,
      );
      return spawned.id;
    } catch (error: any) {
      throw new Error(
        `Failed to bootstrap runtime session for team agent ${data.teamAgentId}: ${error?.message || 'unknown error'}`,
      );
    }
  }

  private normalizeAgentType(value: string): string {
    const raw = (value || '').trim();
    if (!raw) return 'claude';
    const normalized = raw.toLowerCase();
    return this.agentTypeAliases[normalized] || normalized;
  }

  private async dispatchRuntimeTask(
    runtimeSessionId: string,
    data: TeamAgentLoopJob,
  ): Promise<void> {
    const taskText = data.stepContext?.task || 'Continue assigned team workflow.';
    const stepText = data.stepContext?.name || data.stepId || 'manual_run';
    const targetText = data.targetExperimentId
      ? `Target experiment: ${data.targetExperimentId}`
      : data.targetTaskId
        ? `Target task: ${data.targetTaskId}`
        : 'No explicit target constraint.';
    const prompt = [
      `[Team Runtime] role=${data.role} step=${stepText}`,
      targetText,
      `Task: ${taskText}`,
      'Work in this session and emit concise progress updates as you execute.',
    ].join('\n');

    await this.agentExecution.send(runtimeSessionId, prompt, data.workspaceId);
  }
}
