import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { QueueName, QueueJob } from '../../integrations/queue/constants';
import { TeamAgentLoopJob } from './team-deployment.service';
import { RoleAwareLoopService } from './role-aware-loop.service';
import { TeamDeploymentRepo } from '../../database/repos/team/team-deployment.repo';

@Processor(QueueName.TEAM_QUEUE)
export class TeamAgentLoopProcessor extends WorkerHost {
  private readonly logger = new Logger(TeamAgentLoopProcessor.name);

  constructor(
    private readonly roleAwareLoop: RoleAwareLoopService,
    private readonly teamRepo: TeamDeploymentRepo,
    private readonly eventEmitter: EventEmitter2,
  ) {
    super();
  }

  async process(job: Job): Promise<any> {
    if (job.name !== QueueJob.TEAM_AGENT_LOOP) {
      return; // Let other processors handle non-team jobs
    }

    const data = job.data as TeamAgentLoopJob;
    this.logger.log(
      `Running team agent loop: ${data.role} (agent=${data.teamAgentId})`,
    );

    try {
      // Mark agent as running
      await this.teamRepo.updateAgentStatus(data.teamAgentId, 'running');

      const result = await this.roleAwareLoop.runRoleLoop({
        teamAgentId: data.teamAgentId,
        workspaceId: data.workspaceId,
        spaceId: data.spaceId,
        agentUserId: data.agentUserId,
        role: data.role,
        systemPrompt: data.systemPrompt,
        capabilities: data.capabilities,
        stepId: data.stepId,
        stepContext: data.stepContext,
      });

      // Update agent run stats
      await this.teamRepo.updateAgentRunStats(data.teamAgentId, {
        lastRunAt: new Date(),
        lastRunSummary: result.summary,
        actionsExecuted: result.actionsExecuted,
        errorsEncountered: result.errorsEncountered,
      });

      // Clear currentStepId and mark agent as idle
      if (data.stepId) {
        await this.teamRepo.updateAgentCurrentStep(data.teamAgentId, null);
      }
      await this.teamRepo.updateAgentStatus(data.teamAgentId, 'idle');

      this.logger.log(
        `Team agent loop completed: ${data.role} — ${result.summary}`,
      );

      // Emit completion event for workflow advancement
      this.eventEmitter.emit('team.agent_loop.completed', {
        deploymentId: data.deploymentId,
        teamAgentId: data.teamAgentId,
        stepId: data.stepId,
        result,
      });

      return result;
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
}
