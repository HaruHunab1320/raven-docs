import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QueueName, QueueJob } from '../../integrations/queue/constants';
import { TeamAgentLoopJob } from './team-deployment.service';
import { RoleAwareLoopService } from './role-aware-loop.service';
import { TeamDeploymentRepo } from '../../database/repos/team/team-deployment.repo';

@Processor(QueueName.GENERAL_QUEUE)
export class TeamAgentLoopProcessor extends WorkerHost {
  private readonly logger = new Logger(TeamAgentLoopProcessor.name);

  constructor(
    private readonly roleAwareLoop: RoleAwareLoopService,
    private readonly teamRepo: TeamDeploymentRepo,
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
      });

      // Update agent run stats
      await this.teamRepo.updateAgentRunStats(data.teamAgentId, {
        lastRunAt: new Date(),
        lastRunSummary: result.summary,
        actionsExecuted: result.actionsExecuted,
        errorsEncountered: result.errorsEncountered,
      });

      // Mark agent as idle
      await this.teamRepo.updateAgentStatus(data.teamAgentId, 'idle');

      this.logger.log(
        `Team agent loop completed: ${data.role} — ${result.summary}`,
      );

      return result;
    } catch (error: any) {
      this.logger.error(
        `Team agent loop failed: ${data.role} — ${error?.message}`,
        error?.stack,
      );

      // Mark agent as error
      await this.teamRepo.updateAgentStatus(data.teamAgentId, 'error');
      await this.teamRepo.updateAgentRunStats(data.teamAgentId, {
        lastRunAt: new Date(),
        lastRunSummary: `Error: ${error?.message || 'Unknown'}`,
        actionsExecuted: 0,
        errorsEncountered: 1,
      });

      throw error;
    }
  }
}
