import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectKysely } from 'nestjs-kysely';
import { TeamDeploymentRepo } from '../../database/repos/team/team-deployment.repo';
import { TeamTemplateRepo } from '../../database/repos/team/team-template.repo';
import { UserRepo } from '@raven-docs/db/repos/user/user.repo';
import { WorkspaceService } from '../workspace/services/workspace.service';
import { SpaceMemberService } from '../space/services/space-member.service';
import { SpaceRole } from '../../common/helpers/types/permission';
import { resolveIntelligenceSettings } from '../workspace/intelligence-defaults';
import { WorkspaceRepo } from '@raven-docs/db/repos/workspace/workspace.repo';
import { QueueName, QueueJob } from '../../integrations/queue/constants';
import { compileOrgPattern } from './raven-compile-target';
import { WorkflowExecutorService } from './workflow-executor.service';
import { ensurePersistenceCapabilities } from './capability-guards';
import type { OrgPattern } from './org-chart.types';
import type { WorkflowState } from './workflow-state.types';
import type { KyselyDB } from '../../database/types/kysely.types';

export interface TeamAgentLoopJob {
  teamAgentId: string;
  deploymentId: string;
  workspaceId: string;
  spaceId: string;
  agentUserId: string;
  role: string;
  systemPrompt: string;
  capabilities: string[];
  stepId?: string;
  stepContext?: { name: string; task: string };
  targetTaskId?: string;
  targetExperimentId?: string;
}

export type TeamMemoryPolicy = 'none' | 'carry_all';

@Injectable()
export class TeamDeploymentService {
  private readonly logger = new Logger(TeamDeploymentService.name);

  constructor(
    private readonly teamRepo: TeamDeploymentRepo,
    private readonly templateRepo: TeamTemplateRepo,
    private readonly userRepo: UserRepo,
    private readonly workspaceRepo: WorkspaceRepo,
    private readonly workspaceService: WorkspaceService,
    private readonly spaceMemberService: SpaceMemberService,
    private readonly workflowExecutor: WorkflowExecutorService,
    @InjectQueue(QueueName.TEAM_QUEUE)
    private readonly teamQueue: Queue,
    @InjectKysely() private readonly db: KyselyDB,
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
        const normalizedCapabilities = ensurePersistenceCapabilities(
          roleDef.capabilities,
        );
        const roleAgentType =
          (roleDef as any).agentType ||
          intelligence.defaultTeamAgentType ||
          process.env.TEAM_AGENT_DEFAULT_TYPE ||
          'claude-code';
        const roleWorkdir =
          (roleDef as any).workdir ||
          process.env.TEAM_AGENT_DEFAULT_WORKDIR ||
          process.cwd();
        const agent = await this.teamRepo.createAgent({
          deploymentId: deployment.id,
          workspaceId,
          userId: agentUser.id,
          role: roleDef.role,
          instanceNumber: i,
          agentType: roleAgentType,
          workdir: roleWorkdir,
          systemPrompt: roleDef.systemPrompt,
          capabilities: normalizedCapabilities,
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
  async getDeployment(workspaceId: string, deploymentId: string) {
    const deployment = await this.teamRepo.findById(deploymentId);
    if (!deployment || deployment.workspaceId !== workspaceId) {
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
    opts?: { spaceId?: string; status?: string; includeTornDown?: boolean },
  ) {
    return this.teamRepo.listByWorkspace(workspaceId, opts);
  }

  /**
   * Redeploy an existing team deployment.
   * - memoryPolicy=none: fresh pseudo-agent users
   * - memoryPolicy=carry_all: reuse source deployment agent users by role+instance
   */
  async redeployDeployment(
    workspaceId: string,
    sourceDeploymentId: string,
    redeployedBy: string,
    opts?: {
      spaceId?: string;
      projectId?: string;
      memoryPolicy?: TeamMemoryPolicy;
      teamName?: string;
    },
  ) {
    const sourceDeployment = await this.teamRepo.findById(sourceDeploymentId);
    if (!sourceDeployment) {
      throw new NotFoundException('Source deployment not found');
    }
    if (sourceDeployment.workspaceId !== workspaceId) {
      throw new NotFoundException('Source deployment not found in workspace');
    }

    const orgPattern = this.parseDeploymentOrgPattern(sourceDeployment);
    if (!orgPattern) {
      throw new BadRequestException(
        'Source deployment does not contain an org pattern; redeploy is unavailable',
      );
    }

    const targetSpaceId = opts?.spaceId || sourceDeployment.spaceId;
    const targetProjectId =
      opts?.projectId !== undefined
        ? opts.projectId
        : sourceDeployment.projectId || undefined;
    const memoryPolicy = opts?.memoryPolicy || 'none';
    const sourceConfig = this.parseJsonSafe(sourceDeployment.config) || {};
    const sourceTeamName =
      sourceConfig.teamName || sourceDeployment.templateName || orgPattern.name;

    const sourceAgents =
      memoryPolicy === 'carry_all'
        ? await this.teamRepo.getAgentsByDeployment(sourceDeploymentId)
        : [];
    const sourceAgentUsers = new Map<string, string>();
    for (const agent of sourceAgents) {
      if (!agent.userId) continue;
      sourceAgentUsers.set(
        this.buildRoleInstanceKey(agent.role, agent.instanceNumber),
        agent.userId,
      );
    }

    const result = await this.deployFromOrgPatternInternal(
      workspaceId,
      targetSpaceId,
      orgPattern,
      redeployedBy,
      {
        projectId: targetProjectId,
        memoryPolicy,
        sourceDeploymentId,
        sourceAgentUsers,
        teamName: opts?.teamName || sourceTeamName,
      },
    );

    this.logger.log(
      `Redeployed team from ${sourceDeploymentId} -> ${result.deployment.id} (policy=${memoryPolicy})`,
    );

    return result;
  }

  /**
   * Trigger a single run of all agents in a deployment
   */
  async triggerTeamRun(workspaceId: string, deploymentId: string) {
    const deployment = await this.teamRepo.findById(deploymentId);
    if (
      !deployment ||
      deployment.workspaceId !== workspaceId ||
      deployment.status !== 'active'
    ) {
      throw new NotFoundException('Active deployment not found');
    }

    const agents = await this.teamRepo.getAgentsByDeployment(deploymentId);
    const jobs = [];
    const deploymentConfig = this.parseJsonSafe(deployment.config) || {};
    const targetTaskId = deploymentConfig.targetTaskId as string | undefined;
    const targetExperimentId = deploymentConfig.targetExperimentId as
      | string
      | undefined;

    if (targetExperimentId) {
      await this.updateTargetExperimentStatus(
        deployment.workspaceId,
        deployment.spaceId,
        targetExperimentId,
        'running',
        {
          activeTeamDeploymentId: deployment.id,
          lastTriggeredAt: new Date().toISOString(),
        },
      );
    }

    for (const agent of agents) {
      if (agent.status === 'paused' || !agent.userId) continue;

      await this.teamRepo.updateAgentCurrentStep(agent.id, 'manual_run');

      const jobData: TeamAgentLoopJob = {
        teamAgentId: agent.id,
        deploymentId: deployment.id,
        workspaceId: deployment.workspaceId,
        spaceId: deployment.spaceId,
        agentUserId: agent.userId,
        role: agent.role,
        systemPrompt: agent.systemPrompt,
        capabilities: ensurePersistenceCapabilities(agent.capabilities as string[]),
        stepId: 'manual_run',
        stepContext: {
          name: 'manual-run',
          task: 'Execute one ad-hoc team loop',
        },
        targetTaskId,
        targetExperimentId,
      };

      const job = await this.teamQueue.add(
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
  async pauseDeployment(workspaceId: string, deploymentId: string) {
    const deployment = await this.teamRepo.findById(deploymentId);
    if (!deployment || deployment.workspaceId !== workspaceId) {
      throw new NotFoundException('Deployment not found');
    }
    return this.teamRepo.updateStatus(deploymentId, 'paused');
  }

  /**
   * Resume a paused deployment
   */
  async resumeDeployment(workspaceId: string, deploymentId: string) {
    const existing = await this.teamRepo.findById(deploymentId);
    if (!existing || existing.workspaceId !== workspaceId) {
      throw new NotFoundException('Deployment not found');
    }

    const deployment = await this.teamRepo.updateStatus(deploymentId, 'active');
    if (!deployment) {
      throw new NotFoundException('Deployment not found');
    }

    // If workflow hasn't started yet, resume should continue execution behavior.
    const stateRow = await this.teamRepo.getWorkflowState(deploymentId);
    const state =
      typeof stateRow?.workflowState === 'string'
        ? (JSON.parse(stateRow.workflowState) as WorkflowState)
        : ((stateRow?.workflowState || {}) as unknown as WorkflowState);

    if (!state.currentPhase || state.currentPhase === 'idle' || state.currentPhase === 'paused') {
      await this.startWorkflow(workspaceId, deploymentId);
    }

    return deployment;
  }

  /**
   * Teardown a deployment — mark torn down, agents stop running
   */
  async teardownTeam(workspaceId: string, deploymentId: string) {
    const deployment = await this.teamRepo.findById(deploymentId);
    if (!deployment || deployment.workspaceId !== workspaceId) {
      throw new NotFoundException('Deployment not found');
    }

    const deploymentConfig = this.parseJsonSafe(deployment.config) || {};
    const targetExperimentId = deploymentConfig.targetExperimentId as
      | string
      | undefined;

    await this.teamRepo.updateStatus(deploymentId, 'torn_down');

    // Also mark workflow as torn_down so the UI phase badge updates
    const stateRow = await this.teamRepo.getWorkflowState(deploymentId);
    if (stateRow?.workflowState) {
      const state =
        typeof stateRow.workflowState === 'string'
          ? JSON.parse(stateRow.workflowState)
          : stateRow.workflowState;
      state.currentPhase = 'torn_down';
      state.tornDownAt = new Date().toISOString();
      await this.teamRepo.updateWorkflowState(deploymentId, state);
    }

    // If this team was actively driving an experiment, release it back to planned.
    if (targetExperimentId) {
      const page = await this.db
        .selectFrom('pages')
        .select(['id', 'metadata'])
        .where('id', '=', targetExperimentId)
        .where('workspaceId', '=', deployment.workspaceId)
        .where('spaceId', '=', deployment.spaceId)
        .where('pageType', '=', 'experiment')
        .where('deletedAt', 'is', null)
        .executeTakeFirst();

      if (page) {
        const metadata =
          typeof page.metadata === 'string'
            ? (JSON.parse(page.metadata) as Record<string, any>)
            : ((page.metadata as Record<string, any>) || {});
        const currentStatus = String(metadata.status || '').toLowerCase();

        if (currentStatus === 'running' || currentStatus === 'active') {
          await this.updateTargetExperimentStatus(
            deployment.workspaceId,
            deployment.spaceId,
            targetExperimentId,
            'planned',
            {
              activeTeamDeploymentId: deployment.id,
              tornDownAt: new Date().toISOString(),
            },
          );
        }
      }
    }

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

  /**
   * Deploy a team from an OrgPattern (org-chart compiler output).
   * Compiles the pattern, creates deployment + agents with reporting chains.
   */
  async deployFromOrgPattern(
    workspaceId: string,
    spaceId: string,
    orgPattern: OrgPattern,
    deployedBy: string,
    opts?: { projectId?: string; teamName?: string },
  ) {
    return this.deployFromOrgPatternInternal(
      workspaceId,
      spaceId,
      orgPattern,
      deployedBy,
      opts,
    );
  }

  private async deployFromOrgPatternInternal(
    workspaceId: string,
    spaceId: string,
    orgPattern: OrgPattern,
    deployedBy: string,
    opts?: {
      projectId?: string;
      memoryPolicy?: TeamMemoryPolicy;
      sourceDeploymentId?: string;
      sourceAgentUsers?: Map<string, string>;
      teamName?: string;
    },
  ) {
    const workspace = await this.workspaceRepo.findById(workspaceId);
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }
    const intelligence = resolveIntelligenceSettings(workspace.settings);
    const executionPlan = compileOrgPattern(orgPattern);
    const memoryPolicy = opts?.memoryPolicy || 'none';
    const sourceAgentUsers = opts?.sourceAgentUsers || new Map<string, string>();

    // Create the deployment record
    const deployment = await this.teamRepo.createDeployment({
      workspaceId,
      spaceId,
      projectId: opts?.projectId,
      templateName: orgPattern.name,
      config: {
        ...(orgPattern as any),
        teamName: opts?.teamName || orgPattern.name,
        defaultAgentType: intelligence.defaultTeamAgentType,
        redeploy: opts?.sourceDeploymentId
          ? {
              sourceDeploymentId: opts.sourceDeploymentId,
              memoryPolicy,
              redeployedAt: new Date().toISOString(),
            }
          : undefined,
      } as any,
      deployedBy,
      orgPattern: orgPattern as any,
      executionPlan: executionPlan as any,
    });

    const agents = [];
    const agentsByRole: Record<string, any> = {};

    // Create agent instances per role
    for (const [roleId, roleDef] of Object.entries(executionPlan.roles)) {
      const count = roleDef.minInstances;

      for (let i = 1; i <= count; i++) {
        const agentName =
          count > 1
            ? `${orgPattern.name} - ${roleDef.name} #${i}`
            : `${orgPattern.name} - ${roleDef.name}`;

        const key = this.buildRoleInstanceKey(roleId, i);
        const reusedUserId =
          memoryPolicy === 'carry_all'
            ? sourceAgentUsers.get(key)
            : undefined;

        let agentUserId: string;
        if (reusedUserId) {
          agentUserId = reusedUserId;
          await this.ensureAgentUserInSpace(
            agentUserId,
            spaceId,
            workspaceId,
          );
        } else {
          const agentEmail = `team-${deployment.id.slice(0, 8)}-${roleId}-${i}@agents.internal`;
          const agentUser = await this.userRepo.insertAgentUser({
            agentId: `team-agent-${deployment.id.slice(0, 8)}-${roleId}-${i}`,
            name: agentName,
            email: agentEmail,
            workspaceId,
          });

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
          agentUserId = agentUser.id;
        }

        const systemPrompt = [
          `You are "${roleDef.name}", part of the "${orgPattern.name}" team.`,
          orgPattern.structure.roles[roleId]?.description || '',
          `Your capabilities: ${ensurePersistenceCapabilities(roleDef.capabilities).join(', ')}`,
        ]
          .filter(Boolean)
          .join('\n');

        const normalizedCapabilities = ensurePersistenceCapabilities(
          roleDef.capabilities,
        );
        const roleMetadata =
          orgPattern.structure.roles[roleId]?.metadata || {};
        const roleAgentType =
          (roleDef as any).agentType ||
          (roleMetadata as any).agentType ||
          intelligence.defaultTeamAgentType ||
          process.env.TEAM_AGENT_DEFAULT_TYPE ||
          'claude-code';
        const roleWorkdir =
          (roleDef as any).workdir ||
          (roleMetadata as any).workdir ||
          process.env.TEAM_AGENT_DEFAULT_WORKDIR ||
          process.cwd();
        const agent = await this.teamRepo.createAgent({
          deploymentId: deployment.id,
          workspaceId,
          userId: agentUserId,
          role: roleId,
          instanceNumber: i,
          agentType: roleAgentType,
          workdir: roleWorkdir,
          systemPrompt,
          capabilities: normalizedCapabilities,
        });

        agents.push({ ...agent, userName: agentName });

        if (!agentsByRole[roleId]) agentsByRole[roleId] = [];
        agentsByRole[roleId].push(agent);
      }
    }

    // Set reportsTo chains
    for (const [roleId, roleDef] of Object.entries(executionPlan.roles)) {
      if (!roleDef.reportsTo || !agentsByRole[roleDef.reportsTo]) continue;

      const parentAgent = agentsByRole[roleDef.reportsTo][0];
      const childAgents = agentsByRole[roleId] || [];

      for (const child of childAgents) {
        await this.teamRepo.updateAgentReportsTo(child.id, parentAgent.id);
      }
    }

    // Initialize workflow state
    const initialState: WorkflowState = {
      currentPhase: 'idle',
      stepStates: {},
      coordinatorInvocations: 0,
    };
    await this.teamRepo.updateWorkflowState(
      deployment.id,
      initialState as any,
    );

    this.logger.log(
      `Deployed org-pattern "${orgPattern.name}" with ${agents.length} agents to space ${spaceId} (memoryPolicy=${memoryPolicy})`,
    );

    return { deployment, agents, executionPlan };
  }

  /**
   * Start the workflow for a deployment — sets phase to 'running' and advances.
   */
  async startWorkflow(workspaceId: string, deploymentId: string) {
    const deployment = await this.teamRepo.findById(deploymentId);
    if (!deployment || deployment.workspaceId !== workspaceId) {
      throw new NotFoundException('Deployment not found');
    }

    const stateRow = await this.teamRepo.getWorkflowState(deploymentId);
    if (!stateRow) {
      throw new NotFoundException('Deployment not found');
    }

    const state =
      typeof stateRow.workflowState === 'string'
        ? (JSON.parse(stateRow.workflowState) as WorkflowState)
        : ((stateRow.workflowState || {}) as unknown as WorkflowState);
    state.currentPhase = 'running';
    state.startedAt = new Date().toISOString();
    state.coordinatorInvocations = state.coordinatorInvocations || 0;
    state.stepStates = state.stepStates || {};

    await this.teamRepo.updateWorkflowState(deploymentId, state as any);

    const deploymentConfig = this.parseJsonSafe(deployment.config) || {};
    const targetExperimentId = deploymentConfig.targetExperimentId as
      | string
      | undefined;
    if (targetExperimentId) {
      await this.updateTargetExperimentStatus(
        deployment.workspaceId,
        deployment.spaceId,
        targetExperimentId,
        'running',
        {
          activeTeamDeploymentId: deployment.id,
          workflowStartedAt: state.startedAt,
        },
      );
    }

    await this.workflowExecutor.advance(deploymentId, {
      reason: 'workflow_started',
    });

    return { started: true, deploymentId };
  }

  async updateTargetExperimentFromWorkflow(
    deploymentId: string,
    nextStatus: 'completed' | 'failed',
  ) {
    const deployment = await this.teamRepo.findById(deploymentId);
    if (!deployment) return;

    const deploymentConfig = this.parseJsonSafe(deployment.config) || {};
    const targetExperimentId = deploymentConfig.targetExperimentId as
      | string
      | undefined;
    if (!targetExperimentId) return;

    await this.updateTargetExperimentStatus(
      deployment.workspaceId,
      deployment.spaceId,
      targetExperimentId,
      nextStatus,
      {
        activeTeamDeploymentId: deployment.id,
        workflowFinishedAt: new Date().toISOString(),
      },
    );
  }

  /**
   * Deploy a team from a template ID stored in team_templates table.
   * Looks up the template, extracts the OrgPattern, and delegates to deployFromOrgPattern().
   */
  async deployFromTemplateId(
    workspaceId: string,
    spaceId: string,
    templateId: string,
    deployedBy: string,
    opts?: { projectId?: string; teamName?: string },
  ) {
    const template = await this.templateRepo.findById(templateId);
    if (!template) {
      throw new NotFoundException(`Team template not found: ${templateId}`);
    }

    const orgPattern =
      typeof template.orgPattern === 'string'
        ? JSON.parse(template.orgPattern)
        : template.orgPattern;

    return this.deployFromOrgPattern(
      workspaceId,
      spaceId,
      orgPattern as OrgPattern,
      deployedBy,
      opts,
    );
  }

  async renameDeployment(
    workspaceId: string,
    deploymentId: string,
    teamName: string,
  ) {
    const deployment = await this.teamRepo.findById(deploymentId);
    if (!deployment || deployment.workspaceId !== workspaceId) {
      throw new NotFoundException('Deployment not found');
    }

    const trimmed = teamName.trim();
    if (!trimmed) {
      throw new BadRequestException('teamName cannot be empty');
    }

    const config = this.parseJsonSafe(deployment.config) || {};
    const updated = await this.teamRepo.updateConfig(deploymentId, {
      ...config,
      teamName: trimmed,
    });
    return updated;
  }

  async assignTargetTask(
    workspaceId: string,
    deploymentId: string,
    taskId?: string,
    experimentId?: string,
  ) {
    const deployment = await this.teamRepo.findById(deploymentId);
    if (!deployment || deployment.workspaceId !== workspaceId) {
      throw new NotFoundException('Deployment not found');
    }

    if (taskId && experimentId) {
      throw new BadRequestException(
        'Specify either taskId or experimentId, not both',
      );
    }

    if (taskId) {
      const task = await this.db
        .selectFrom('tasks')
        .select(['id'])
        .where('id', '=', taskId)
        .where('workspaceId', '=', workspaceId)
        .where('spaceId', '=', deployment.spaceId)
        .where('deletedAt', 'is', null)
        .executeTakeFirst();
      if (!task) {
        throw new BadRequestException(
          'Task not found in this deployment space',
        );
      }
    }

    if (experimentId) {
      const experiment = await this.db
        .selectFrom('pages')
        .select(['id'])
        .where('id', '=', experimentId)
        .where('workspaceId', '=', workspaceId)
        .where('spaceId', '=', deployment.spaceId)
        .where('pageType', '=', 'experiment')
        .where('deletedAt', 'is', null)
        .executeTakeFirst();
      if (!experiment) {
        throw new BadRequestException(
          'Experiment not found in this deployment space',
        );
      }
    }

    const config = this.parseJsonSafe(deployment.config) || {};
    const nextConfig = { ...config };
    if (taskId) {
      nextConfig.targetTaskId = taskId;
      delete nextConfig.targetExperimentId;
    } else if (experimentId) {
      nextConfig.targetExperimentId = experimentId;
      delete nextConfig.targetTaskId;
    } else {
      delete nextConfig.targetTaskId;
      delete nextConfig.targetExperimentId;
    }

    return this.teamRepo.updateConfig(deploymentId, nextConfig);
  }

  private buildRoleInstanceKey(role: string, instanceNumber: number) {
    return `${role}#${instanceNumber}`;
  }

  private parseDeploymentOrgPattern(deployment: any): OrgPattern | null {
    const raw = deployment.orgPattern || deployment.config;
    if (!raw) return null;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!parsed?.structure || !parsed?.workflow) return null;
    return parsed as OrgPattern;
  }

  private parseJsonSafe(value: unknown): any {
    if (!value) return null;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    }
    return value;
  }

  private async ensureAgentUserInSpace(
    userId: string,
    spaceId: string,
    workspaceId: string,
  ) {
    try {
      await this.spaceMemberService.addUserToSpace(
        userId,
        spaceId,
        SpaceRole.WRITER,
        workspaceId,
      );
    } catch (error: any) {
      this.logger.debug(
        `Skipping duplicate space membership for agent user ${userId}: ${error?.message || 'unknown error'}`,
      );
    }
  }

  private async updateTargetExperimentStatus(
    workspaceId: string,
    spaceId: string,
    experimentId: string,
    status: 'planned' | 'running' | 'completed' | 'failed',
    extra: Record<string, any> = {},
  ) {
    const page = await this.db
      .selectFrom('pages')
      .select(['id', 'metadata'])
      .where('id', '=', experimentId)
      .where('workspaceId', '=', workspaceId)
      .where('spaceId', '=', spaceId)
      .where('pageType', '=', 'experiment')
      .where('deletedAt', 'is', null)
      .executeTakeFirst();

    if (!page) return;

    let metadata: Record<string, any> = {};
    try {
      metadata =
        typeof page.metadata === 'string'
          ? JSON.parse(page.metadata)
          : ((page.metadata as Record<string, any>) || {});
    } catch {
      metadata = {};
    }

    const nextMetadata = {
      ...metadata,
      status,
      teamRuntime: {
        ...(metadata.teamRuntime || {}),
        ...extra,
      },
    };

    await this.db
      .updateTable('pages')
      .set({
        metadata: JSON.stringify(nextMetadata),
        updatedAt: new Date(),
      })
      .where('id', '=', experimentId)
      .execute();
  }
}
