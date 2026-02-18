import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TeamDeploymentRepo } from '../../database/repos/team/team-deployment.repo';
import { UserRepo } from '@raven-docs/db/repos/user/user.repo';
import { WorkspaceService } from '../workspace/services/workspace.service';
import { SpaceMemberService } from '../space/services/space-member.service';
import { SpaceRole } from '../../common/helpers/types/permission';
import { resolveIntelligenceSettings } from '../workspace/intelligence-defaults';
import { WorkspaceRepo } from '@raven-docs/db/repos/workspace/workspace.repo';
import { QueueName, QueueJob } from '../../integrations/queue/constants';

export interface TeamAgentLoopJob {
  teamAgentId: string;
  deploymentId: string;
  workspaceId: string;
  spaceId: string;
  agentUserId: string;
  role: string;
  systemPrompt: string;
  capabilities: string[];
}

@Injectable()
export class TeamDeploymentService {
  private readonly logger = new Logger(TeamDeploymentService.name);

  constructor(
    private readonly teamRepo: TeamDeploymentRepo,
    private readonly userRepo: UserRepo,
    private readonly workspaceRepo: WorkspaceRepo,
    private readonly workspaceService: WorkspaceService,
    private readonly spaceMemberService: SpaceMemberService,
    @InjectQueue(QueueName.GENERAL_QUEUE)
    private readonly generalQueue: Queue,
  ) {}

  /**
   * Deploy a team from a template to a space/project.
   * Creates team_deployment, team_agent records, and pseudo-users for each agent.
   */
  async deployTeam(
    workspaceId: string,
    spaceId: string,
    templateName: string,
    deployedBy: string,
    opts?: { projectId?: string },
  ) {
    // Look up the template from workspace intelligence settings
    const workspace = await this.workspaceRepo.findById(workspaceId);
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    const intelligence = resolveIntelligenceSettings(workspace.settings);
    const template = intelligence.teamTemplates.find(
      (t) => t.name === templateName,
    );
    if (!template) {
      throw new NotFoundException(
        `Team template "${templateName}" not found. Available: ${intelligence.teamTemplates.map((t) => t.name).join(', ')}`,
      );
    }

    // Create the deployment record
    const deployment = await this.teamRepo.createDeployment({
      workspaceId,
      spaceId,
      projectId: opts?.projectId,
      templateName,
      config: template,
      deployedBy,
    });

    const agents = [];

    // Create agent instances for each role
    for (const roleDef of template.roles) {
      for (let i = 1; i <= roleDef.count; i++) {
        const agentName =
          roleDef.count > 1
            ? `${template.name} - ${roleDef.role} #${i}`
            : `${template.name} - ${roleDef.role}`;

        // Create pseudo-user for this agent
        const agentEmail = `team-${deployment.id.slice(0, 8)}-${roleDef.role}-${i}@agents.internal`;
        const agentUser = await this.userRepo.insertAgentUser({
          agentId: `team-agent-${deployment.id.slice(0, 8)}-${roleDef.role}-${i}`,
          name: agentName,
          email: agentEmail,
          workspaceId,
        });

        // Add to workspace and space
        await this.workspaceService.addUserToWorkspace(
          agentUser.id,
          workspaceId,
        );
        await this.spaceMemberService.addUserToSpace(
          agentUser.id,
          spaceId,
          SpaceRole.WRITER,
          workspaceId,
        );

        // Create team_agent record
        const agent = await this.teamRepo.createAgent({
          deploymentId: deployment.id,
          workspaceId,
          userId: agentUser.id,
          role: roleDef.role,
          instanceNumber: i,
          systemPrompt: roleDef.systemPrompt,
          capabilities: roleDef.capabilities,
        });

        agents.push({ ...agent, userName: agentName });
      }
    }

    this.logger.log(
      `Deployed team "${templateName}" with ${agents.length} agents to space ${spaceId}`,
    );

    return {
      deployment,
      agents,
    };
  }

  /**
   * Get deployment with its agents
   */
  async getDeployment(deploymentId: string) {
    const deployment = await this.teamRepo.findById(deploymentId);
    if (!deployment) {
      throw new NotFoundException('Deployment not found');
    }

    const agents = await this.teamRepo.getAgentsByDeployment(deploymentId);
    return { deployment, agents };
  }

  /**
   * List deployments for a workspace
   */
  async listDeployments(
    workspaceId: string,
    opts?: { spaceId?: string; status?: string },
  ) {
    return this.teamRepo.listByWorkspace(workspaceId, opts);
  }

  /**
   * Trigger a single run of all agents in a deployment
   */
  async triggerTeamRun(deploymentId: string) {
    const deployment = await this.teamRepo.findById(deploymentId);
    if (!deployment || deployment.status !== 'active') {
      throw new NotFoundException('Active deployment not found');
    }

    const agents = await this.teamRepo.getAgentsByDeployment(deploymentId);
    const jobs = [];

    for (const agent of agents) {
      if (agent.status === 'paused' || !agent.userId) continue;

      const jobData: TeamAgentLoopJob = {
        teamAgentId: agent.id,
        deploymentId: deployment.id,
        workspaceId: deployment.workspaceId,
        spaceId: deployment.spaceId,
        agentUserId: agent.userId,
        role: agent.role,
        systemPrompt: agent.systemPrompt,
        capabilities: agent.capabilities as string[],
      };

      const job = await this.generalQueue.add(
        QueueJob.TEAM_AGENT_LOOP,
        jobData,
        {
          attempts: 1, // Don't retry agent loops
          removeOnComplete: { count: 50 },
          removeOnFail: { count: 20 },
        },
      );

      jobs.push({ agentId: agent.id, role: agent.role, jobId: job.id });
    }

    this.logger.log(
      `Triggered ${jobs.length} agent loops for deployment ${deploymentId}`,
    );

    return { triggered: jobs.length, jobs };
  }

  /**
   * Pause a deployment — stops all agents from running
   */
  async pauseDeployment(deploymentId: string) {
    return this.teamRepo.updateStatus(deploymentId, 'paused');
  }

  /**
   * Resume a paused deployment
   */
  async resumeDeployment(deploymentId: string) {
    return this.teamRepo.updateStatus(deploymentId, 'active');
  }

  /**
   * Teardown a deployment — mark torn down, agents stop running
   */
  async teardownTeam(deploymentId: string) {
    const deployment = await this.teamRepo.findById(deploymentId);
    if (!deployment) {
      throw new NotFoundException('Deployment not found');
    }

    await this.teamRepo.updateStatus(deploymentId, 'torn_down');

    this.logger.log(`Tore down team deployment ${deploymentId}`);

    return { success: true, deploymentId };
  }

  /**
   * Atomic task claim — agent claims an unassigned task
   */
  async claimTaskForAgent(
    taskId: string,
    teamAgentId: string,
    workspaceId: string,
  ) {
    const agent = await this.teamRepo.findAgentById(teamAgentId);
    if (!agent || !agent.userId) {
      throw new NotFoundException('Team agent not found');
    }

    const claimed = await this.teamRepo.claimTask(
      taskId,
      agent.userId,
      workspaceId,
    );

    return claimed;
  }
}
