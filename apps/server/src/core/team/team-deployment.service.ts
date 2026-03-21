import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TeamDeploymentRepo } from '../../database/repos/team/team-deployment.repo';
import { TeamTemplateRepo } from '../../database/repos/team/team-template.repo';
import { UserRepo } from '@raven-docs/db/repos/user/user.repo';
import { WorkspaceService } from '../workspace/services/workspace.service';
import { SpaceMemberService } from '../space/services/space-member.service';
import { SpaceRole } from '../../common/helpers/types/permission';
import { resolveIntelligenceSettings } from '../workspace/intelligence-defaults';
import { WorkspaceRepo } from '@raven-docs/db/repos/workspace/workspace.repo';
import { ensurePersistenceCapabilities } from './capability-guards';
import { TerminalSessionService } from '../terminal/terminal-session.service';
import { AgentExecutionService } from '../coding-swarm/agent-execution.service';
import { TeamMessagingService } from './team-messaging.service';
import type { OrgPattern } from './org-chart.types';
import { cleanupScratchDirs } from './team-scratch-dir';
import type { WorkflowState } from './workflow-state.types';
import type { KyselyDB } from '../../database/types/kysely.types';
import { ParallaxClientService } from '../parallax-runtime/parallax-client.service';

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
    private readonly terminalSessionService: TerminalSessionService,
    @Optional() private readonly agentExecution: AgentExecutionService,
    @Optional() private readonly teamMessaging: TeamMessagingService,
    @Optional() private readonly parallaxClient: ParallaxClientService,
    @InjectKysely() private readonly db: KyselyDB,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Whether the Parallax SDK is available for thread-based execution.
   * Preferred over pattern execution when PARALLAX_API_KEY is configured.
   */
  get isThreadRuntimeAvailable(): boolean {
    return !!this.parallaxClient?.isSdkAvailable;
  }

  /**
   * Whether the Parallax remote runtime is available for pattern-based execution.
   * Legacy path — used when SDK is not configured but control plane URL is set.
   */
  get isRemoteRuntimeAvailable(): boolean {
    return !!this.parallaxClient?.isAvailable();
  }

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
          null;
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

    // Spawn Parallax threads eagerly at deploy time (if SDK is available)
    if (this.isThreadRuntimeAvailable) {
      await this.spawnThreadsForDeployment(deployment, agents, workspaceId);
    }

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
   * Trigger a team run — resets agents, then spawns the coordinator agent
   * and sends it the initial task message. The coordinator drives the team
   * by messaging workers via team_send_message.
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

    const deploymentConfig = this.parseJsonSafe(deployment.config) || {};
    const targetExperimentId = deploymentConfig.targetExperimentId as
      | string
      | undefined;
    const targetTaskId = deploymentConfig.targetTaskId as string | undefined;

    if (!targetExperimentId && !targetTaskId) {
      throw new BadRequestException(
        'Cannot trigger a team run without a target. Assign a target experiment or task first.',
      );
    }

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

    // Reset agents back to idle
    await this.resetTeam(workspaceId, deploymentId);

    // Find the coordinator (lead agent — no reportsToAgentId)
    const agents = await this.teamRepo.getAgentsByDeployment(deploymentId);
    const coordinator = agents.find((a) => !a.reportsToAgentId);

    if (!coordinator) {
      throw new BadRequestException(
        'No coordinator agent found in this deployment. At least one agent must have no reportsTo.',
      );
    }

    if (!this.teamMessaging) {
      throw new BadRequestException(
        'Team messaging service is not available.',
      );
    }

    // ── Thread-based execution via Parallax SDK (preferred) ──────────
    if (this.isThreadRuntimeAvailable) {
      // If coordinator already has a thread ID (spawned at deploy time), send task to it
      if (coordinator.runtimeSessionId) {
        return this.sendTaskToExistingThreads(deployment, agents, coordinator);
      }
      // No pre-spawned threads — spawn fresh ones now (first trigger on old deployments)
      return this.triggerThreadedTeamRun(workspaceId, deployment, agents, coordinator);
    }

    // ── Pattern-based execution via Parallax (legacy) ─────────────────
    if (this.isRemoteRuntimeAvailable) {
      return this.triggerRemoteTeamRun(workspaceId, deployment, agents, coordinator);
    }

    // ── Local execution via PTY agents ────────────────────────────────
    // Build and send the initial task message to the coordinator
    const initialMessage = this.teamMessaging.buildInitialTaskMessage(
      deployment,
      agents,
    );
    await this.teamMessaging.sendMessage('system', coordinator.id, initialMessage);

    // Update workflow state to running
    const stateRow = await this.teamRepo.getWorkflowState(deploymentId);
    const state =
      typeof stateRow?.workflowState === 'string'
        ? (JSON.parse(stateRow.workflowState) as WorkflowState)
        : ((stateRow?.workflowState || {}) as unknown as WorkflowState);
    state.currentPhase = 'running';
    state.startedAt = new Date().toISOString();
    state.coordinatorInvocations = (state.coordinatorInvocations || 0) + 1;
    await this.teamRepo.updateWorkflowState(deploymentId, state as any);

    this.logger.log(
      `Triggered team run for deployment ${deploymentId}: coordinator=${coordinator.role} (${coordinator.id.slice(0, 8)})`,
    );

    return { triggered: 'messaging', deploymentId, coordinatorId: coordinator.id };
  }

  /**
   * Execute a team deployment via Parallax managed threads (SDK path).
   *
   * Spawns one long-running thread per agent role. The thread poller
   * translates thread lifecycle events into parallax.* events so all
   * existing team event handlers work without modification.
   *
   * Local mode (no PARALLAX_API_KEY): never called — falls through to PTY.
   */
  private async triggerThreadedTeamRun(
    workspaceId: string,
    deployment: any,
    agents: any[],
    coordinator: any,
  ) {
    const deploymentConfig = this.parseJsonSafe(deployment.config) || {};
    const serverUrl = process.env.APP_URL || 'http://localhost:3000';

    // Use deployment ID as the Parallax execution ID so all threads are grouped
    const executionId = deployment.id;

    // Build base env vars injected into every thread
    const baseEnv: Record<string, string> = {
      MCP_SERVER_URL: serverUrl,
      RAVEN_WORKSPACE_ID: workspaceId,
      RAVEN_DEPLOYMENT_ID: deployment.id,
    };

    const targetExperimentId = deploymentConfig.targetExperimentId as string | undefined;
    const targetTaskId = deploymentConfig.targetTaskId as string | undefined;
    if (targetExperimentId) baseEnv.RAVEN_TARGET_EXPERIMENT_ID = targetExperimentId;
    if (targetTaskId) baseEnv.RAVEN_TARGET_TASK_ID = targetTaskId;

    const spawnedThreadIds: string[] = [];

    // Spawn a thread for each agent
    for (const agent of agents) {
      const isCoordinator = agent.id === coordinator.id;

      // Coordinator gets the full initial task; workers get their system prompt
      const objective = isCoordinator
        ? (this.teamMessaging?.buildInitialTaskMessage(deployment, agents) ?? agent.systemPrompt ?? agent.role)
        : (agent.systemPrompt || `You are the ${agent.role} agent. Wait for instructions from the coordinator.`);

      try {
        const thread = await this.parallaxClient!.spawnThread({
          executionId,
          agentType: agent.agentType || 'claude',
          name: `${agent.role}-${agent.instanceNumber || 1}`,
          role: agent.role,
          objective,
          environment: {
            ...baseEnv,
            RAVEN_AGENT_ID: agent.id,
            RAVEN_AGENT_ROLE: agent.role,
          },
          metadata: {
            ravenDeploymentId: deployment.id,
            ravenAgentId: agent.id,
            ravenWorkspaceId: workspaceId,
          },
        });

        spawnedThreadIds.push(thread.id);

        this.logger.log(
          `Spawned thread ${thread.id} for agent ${agent.id} (role=${agent.role})`,
        );
      } catch (err: any) {
        this.logger.error(
          `Failed to spawn thread for agent ${agent.id} (role=${agent.role}): ${err?.message}`,
        );
        throw err;
      }
    }

    // Persist execution ID + thread IDs so the poller knows what to watch
    const updatedConfig = {
      ...deploymentConfig,
      parallaxExecutionId: executionId,
      parallaxThreadIds: spawnedThreadIds,
    };
    await this.teamRepo.updateConfig(deployment.id, updatedConfig as any);

    // Update workflow state
    const stateRow = await this.teamRepo.getWorkflowState(deployment.id);
    const state =
      typeof stateRow?.workflowState === 'string'
        ? (JSON.parse(stateRow.workflowState) as any)
        : ((stateRow?.workflowState || {}) as any);
    state.currentPhase = 'running';
    state.startedAt = new Date().toISOString();
    state.coordinatorInvocations = (state.coordinatorInvocations || 0) + 1;
    await this.teamRepo.updateWorkflowState(deployment.id, state);

    this.logger.log(
      `Triggered THREADED team run for deployment ${deployment.id}: ` +
      `${spawnedThreadIds.length} threads spawned (executionId=${executionId})`,
    );

    return {
      triggered: 'parallax_threads',
      deploymentId: deployment.id,
      coordinatorId: coordinator.id,
      parallaxExecutionId: executionId,
      threadCount: spawnedThreadIds.length,
    };
  }

  /**
   * Send the initial task message to the coordinator's pre-spawned Parallax thread.
   * The thread is already running — we just deliver the task objective.
   */
  private async sendTaskToExistingThreads(
    deployment: any,
    agents: any[],
    coordinator: any,
  ) {
    const message = this.teamMessaging!.buildInitialTaskMessage(deployment, agents);

    this.logger.log(
      `Sending task to existing coordinator thread ${coordinator.runtimeSessionId} ` +
      `(role=${coordinator.role}, deploymentId=${deployment.id})`,
    );

    await this.parallaxClient!.sendToThread(coordinator.runtimeSessionId, message);

    const stateRow = await this.teamRepo.getWorkflowState(deployment.id);
    const state =
      typeof stateRow?.workflowState === 'string'
        ? (JSON.parse(stateRow.workflowState) as any)
        : ((stateRow?.workflowState || {}) as any);
    state.currentPhase = 'running';
    state.startedAt = new Date().toISOString();
    state.coordinatorInvocations = (state.coordinatorInvocations || 0) + 1;
    await this.teamRepo.updateWorkflowState(deployment.id, state);

    this.logger.log(
      `Triggered team run via existing threads for deployment ${deployment.id}: ` +
      `coordinator=${coordinator.role} (thread=${coordinator.runtimeSessionId})`,
    );

    return {
      triggered: 'parallax_threads_existing',
      deploymentId: deployment.id,
      coordinatorId: coordinator.id,
      coordinatorThreadId: coordinator.runtimeSessionId,
    };
  }

  /**
   * Spawn Parallax threads for every agent at deploy time.
   * Stores thread ID in each agent's runtimeSessionId.
   * Status flows: provisioning → active.
   */
  private async spawnThreadsForDeployment(
    deployment: any,
    agents: any[],
    workspaceId: string,
  ) {
    const serverUrl = process.env.APP_URL || 'http://localhost:3000';
    const executionId = deployment.id;

    const baseEnv: Record<string, string> = {
      MCP_SERVER_URL: serverUrl,
      RAVEN_WORKSPACE_ID: workspaceId,
      RAVEN_DEPLOYMENT_ID: deployment.id,
    };

    await this.teamRepo.updateStatus(deployment.id, 'provisioning');

    for (const agent of agents) {
      const objective =
        agent.systemPrompt ||
        `You are the ${agent.role} agent. Stay running and wait for instructions from the coordinator.`;

      try {
        const thread = await this.parallaxClient!.spawnThread({
          executionId,
          agentType: agent.agentType || 'claude',
          name: `${agent.role}-${agent.instanceNumber || 1}`,
          role: agent.role,
          objective,
          environment: {
            ...baseEnv,
            RAVEN_AGENT_ID: agent.id,
            RAVEN_AGENT_ROLE: agent.role,
          },
          metadata: {
            ravenDeploymentId: deployment.id,
            ravenAgentId: agent.id,
            ravenWorkspaceId: workspaceId,
          },
        });

        await this.teamRepo.updateAgentRuntimeSession(agent.id, {
          runtimeSessionId: thread.id,
          terminalSessionId: null,
        });

        this.logger.log(
          `Spawned thread ${thread.id} for agent ${agent.id} (role=${agent.role}) at deploy time`,
        );
      } catch (err: any) {
        this.logger.error(
          `Failed to spawn thread for agent ${agent.id} (role=${agent.role}): ${err?.message}`,
        );
      }
    }

    await this.teamRepo.updateStatus(deployment.id, 'active');

    const config = this.parseJsonSafe(deployment.config) || {};
    await this.teamRepo.updateConfig(deployment.id, {
      ...config,
      parallaxExecutionId: executionId,
    } as any);

    this.logger.log(
      `Deployed ${agents.length} Parallax threads for deployment ${deployment.id}`,
    );
  }

  /**
   * Execute a team deployment via Parallax remote runtime.
   *
   * 1. Upload the OrgPattern to Parallax (idempotent)
   * 2. Execute the pattern with task input
   * 3. Map Parallax agent IDs back to Raven team_agent records
   * 4. Stream execution events into the existing event pipeline
   */
  private async triggerRemoteTeamRun(
    workspaceId: string,
    deployment: any,
    agents: any[],
    coordinator: any,
  ) {
    const deploymentConfig = this.parseJsonSafe(deployment.config) || {};
    const orgPattern = this.parseJsonSafe(deployment.orgPattern) as OrgPattern | null;

    if (!orgPattern) {
      throw new BadRequestException(
        'Deployment has no org pattern — cannot execute remotely.',
      );
    }

    // Step 1: Upload org pattern to Parallax
    const uploadResult = await this.parallaxClient!.uploadOrgPattern(orgPattern);
    if (!uploadResult.success) {
      this.logger.error(`Failed to upload pattern to Parallax: ${uploadResult.error}`);
      throw new BadRequestException(
        `Failed to register pattern with Parallax: ${uploadResult.error}`,
      );
    }

    // Step 2: Build execution input
    const targetExperimentId = deploymentConfig.targetExperimentId as string | undefined;
    const targetTaskId = deploymentConfig.targetTaskId as string | undefined;
    const serverUrl = process.env.APP_URL || 'http://localhost:3000';

    // Build env vars that every agent pod needs for MCP connectivity
    const agentEnv: Record<string, string> = {
      MCP_SERVER_URL: serverUrl,
      RAVEN_WORKSPACE_ID: workspaceId,
      RAVEN_DEPLOYMENT_ID: deployment.id,
    };

    // Step 3: Execute pattern on Parallax
    const executionResult = await this.parallaxClient!.executePattern({
      patternName: orgPattern.name,
      input: {
        workspaceId,
        spaceId: deployment.spaceId,
        deploymentId: deployment.id,
        targetExperimentId,
        targetTaskId,
        teamName: deploymentConfig.teamName || orgPattern.name,
        agents: agents.map((a) => ({
          id: a.id,
          role: a.role,
          instanceNumber: a.instanceNumber,
          userId: a.userId,
          systemPrompt: a.systemPrompt,
          capabilities: a.capabilities,
          agentType: a.agentType,
        })),
      },
      options: {
        stream: true,
        timeout: 600_000, // 10 min timeout for team runs
      },
      webhook: {
        url: `${serverUrl}/api/parallax-agents/spawn-callback`,
      },
      agentEnv,
    });

    // Step 4: Store execution ID in deployment config
    const updatedConfig = {
      ...deploymentConfig,
      parallaxExecutionId: executionResult.id,
      parallaxStreamUrl: executionResult.streamUrl,
    };
    await this.teamRepo.updateConfig(deployment.id, updatedConfig as any);

    // Step 5: Update workflow state
    const stateRow = await this.teamRepo.getWorkflowState(deployment.id);
    const state =
      typeof stateRow?.workflowState === 'string'
        ? (JSON.parse(stateRow.workflowState) as WorkflowState)
        : ((stateRow?.workflowState || {}) as unknown as WorkflowState);
    state.currentPhase = 'running';
    state.startedAt = new Date().toISOString();
    state.coordinatorInvocations = (state.coordinatorInvocations || 0) + 1;
    await this.teamRepo.updateWorkflowState(deployment.id, state as any);

    this.logger.log(
      `Triggered REMOTE team run for deployment ${deployment.id}: ` +
      `pattern=${orgPattern.name}, execution=${executionResult.id}, ` +
      `coordinator=${coordinator.role} (${coordinator.id.slice(0, 8)})`,
    );

    return {
      triggered: 'parallax',
      deploymentId: deployment.id,
      coordinatorId: coordinator.id,
      parallaxExecutionId: executionResult.id,
    };
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

    return deployment;
  }

  /**
   * Take over an agent — sets userTakeover flag so the orchestrator
   * leaves it alone while the user drives it interactively.
   */
  async takeoverAgent(workspaceId: string, agentId: string) {
    const agent = await this.teamRepo.findAgentById(agentId);
    if (!agent || agent.workspaceId !== workspaceId) {
      throw new NotFoundException('Agent not found');
    }
    if (!agent.runtimeSessionId) {
      throw new BadRequestException('Agent has no active session to take over');
    }
    if (agent.userTakeover) {
      throw new BadRequestException('Agent is already taken over');
    }

    await this.teamRepo.updateAgentUserTakeover(agentId, true);

    // Pause the remote agent if running on Parallax
    if (this.parallaxClient?.isRuntimeConfigured() && agent.runtimeSessionId) {
      await this.parallaxClient.pauseAgent(agent.runtimeSessionId);
    }

    this.eventEmitter.emit('team.agent_takeover', {
      deploymentId: agent.deploymentId,
      teamAgentId: agentId,
      userTakeover: true,
    });

    this.logger.log(`User took over agent ${agentId} (${agent.role})`);
    return { success: true, agentId };
  }

  /**
   * Release an agent — clears userTakeover flag and flushes any
   * messages that queued while the user was driving.
   */
  async releaseAgent(workspaceId: string, agentId: string) {
    const agent = await this.teamRepo.findAgentById(agentId);
    if (!agent || agent.workspaceId !== workspaceId) {
      throw new NotFoundException('Agent not found');
    }
    if (!agent.userTakeover) {
      throw new BadRequestException('Agent is not taken over');
    }

    await this.teamRepo.updateAgentUserTakeover(agentId, false);

    // Flush any messages that queued while the user was driving
    if (this.teamMessaging) {
      try {
        await this.teamMessaging.deliverPendingMessages(agentId);
      } catch (err: any) {
        this.logger.warn(
          `Failed to flush pending messages on release for agent ${agentId}: ${err?.message}`,
        );
      }
    }

    // Resume the remote agent if running on Parallax
    if (this.parallaxClient?.isRuntimeConfigured() && agent.runtimeSessionId) {
      await this.parallaxClient.resumeAgent(agent.runtimeSessionId);
    }

    this.eventEmitter.emit('team.agent_takeover', {
      deploymentId: agent.deploymentId,
      teamAgentId: agentId,
      userTakeover: false,
    });

    this.logger.log(`User released agent ${agentId} (${agent.role})`);
    return { success: true, agentId };
  }

  /**
   * Full team reset — terminates all terminal/runtime sessions, clears all
   * agent state back to clean idle, resets stats, and reactivates the deployment.
   */
  async resetTeam(workspaceId: string, deploymentId: string) {
    const deployment = await this.teamRepo.findById(deploymentId);
    if (!deployment || deployment.workspaceId !== workspaceId) {
      throw new NotFoundException('Deployment not found');
    }

    // Clear all user takeover flags before resetting agents
    await this.teamRepo.clearAllUserTakeovers(deploymentId);

    const agents = await this.teamRepo.getAgentsByDeployment(deploymentId);
    let resetCount = 0;

    for (const agent of agents) {
      if (agent.status === 'paused') continue; // respect explicitly paused agents

      // In thread mode runtimeSessionId is the Parallax thread ID — keep it alive.
      // In PTY mode stop the process and clear the session.
      const isThreadMode = this.isThreadRuntimeAvailable && !!agent.runtimeSessionId;

      if (!isThreadMode) {
        if (agent.runtimeSessionId && this.agentExecution) {
          try {
            await this.agentExecution.stop(agent.runtimeSessionId, workspaceId);
          } catch {
            // best-effort — process may already be dead
          }
        }
        if (agent.terminalSessionId) {
          try {
            await this.terminalSessionService.terminate(agent.terminalSessionId);
          } catch {
            // best-effort cleanup
          }
        }
        await this.teamRepo.updateAgentRuntimeSession(agent.id, {
          runtimeSessionId: null,
          terminalSessionId: null,
        });
      }

      await this.teamRepo.updateAgentStatus(agent.id, 'idle');
      await this.teamRepo.updateAgentCurrentStep(agent.id, null);
      await this.teamRepo.resetAgentStats(agent.id);
      resetCount++;
    }

    // Clean up scratch directories for this deployment
    try {
      cleanupScratchDirs(deploymentId);
    } catch (err: any) {
      this.logger.warn(
        `Failed to clean up scratch dirs for deployment ${deploymentId}: ${err?.message}`,
      );
    }

    // Reactivate deployment if it was paused (e.g. auto-paused on errors)
    if (deployment.status === 'paused') {
      await this.teamRepo.updateStatus(deploymentId, 'active');
    }

    // Reset workflow state back to idle
    const stateRow = await this.teamRepo.getWorkflowState(deploymentId);
    const state =
      typeof stateRow?.workflowState === 'string'
        ? (JSON.parse(stateRow.workflowState) as WorkflowState)
        : ((stateRow?.workflowState || {}) as unknown as WorkflowState);

    if (state.currentPhase && state.currentPhase !== 'idle') {
      state.currentPhase = 'idle';
      // Reset all non-completed step states back to pending
      for (const [, stepState] of Object.entries(state.stepStates || {})) {
        if (stepState.status === 'failed' || stepState.status === 'running' || stepState.status === 'waiting') {
          stepState.status = 'pending';
          delete stepState.error;
          delete stepState.completedAt;
          delete stepState.startedAt;
          delete stepState.assignedAgentId;
        }
      }
      await this.teamRepo.updateWorkflowState(deploymentId, state as any);
    }

    this.logger.log(
      `Reset ${resetCount} agents for deployment ${deploymentId}`,
    );

    return { reset: resetCount, deploymentId };
  }

  /**
   * Auto-pause a deployment if all agents are in error state.
   * Called after an agent enters error state.
   */
  async autoPauseIfAllErrored(deploymentId: string): Promise<boolean> {
    const deployment = await this.teamRepo.findById(deploymentId);
    if (!deployment || deployment.status !== 'active') return false;

    const agents = await this.teamRepo.getAgentsByDeployment(deploymentId);
    if (agents.length === 0) return false;

    const allErrored = agents.every(
      (a) => a.status === 'error' || a.status === 'paused',
    );
    if (!allErrored) return false;

    await this.teamRepo.updateStatus(deploymentId, 'paused');
    this.logger.log(
      `Auto-paused deployment ${deploymentId} — all agents are in error/paused state`,
    );
    return true;
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

    // Clear all user takeover flags before tearing down
    await this.teamRepo.clearAllUserTakeovers(deploymentId);

    const agents = await this.teamRepo.getAgentsByDeployment(deploymentId);

    if (this.isThreadRuntimeAvailable) {
      // Thread mode: stop each agent's Parallax thread individually
      for (const agent of agents) {
        if (agent.runtimeSessionId && this.parallaxClient) {
          try {
            await this.parallaxClient.stopThread(agent.runtimeSessionId, { force: true });
            this.logger.log(`Stopped thread ${agent.runtimeSessionId} for agent ${agent.id}`);
          } catch (err: any) {
            this.logger.warn(`Failed to stop thread for agent ${agent.id}: ${err?.message}`);
          }
        }
      }
    } else {
      // Legacy: cancel whole Parallax execution or stop PTY processes
      const parallaxExecutionId = deploymentConfig.parallaxExecutionId as string | undefined;
      if (parallaxExecutionId && this.parallaxClient) {
        try {
          await this.parallaxClient.cancelExecution(parallaxExecutionId);
          this.logger.log(`Cancelled Parallax execution ${parallaxExecutionId}`);
        } catch (err: any) {
          this.logger.warn(`Failed to cancel Parallax execution: ${err?.message}`);
        }
      }
      for (const agent of agents) {
        if (agent.runtimeSessionId && this.agentExecution) {
          try {
            await this.agentExecution.stop(agent.runtimeSessionId, workspaceId);
          } catch { /* best-effort */ }
        }
        if (agent.terminalSessionId) {
          try {
            await this.terminalSessionService.terminate(agent.terminalSessionId);
          } catch { /* best-effort */ }
        }
      }
    }

    await this.teamRepo.updateStatus(deploymentId, 'torn_down');

    // Clean up scratch directories for this deployment
    try {
      cleanupScratchDirs(deploymentId);
    } catch (err: any) {
      this.logger.warn(
        `Failed to clean up scratch dirs for deployment ${deploymentId}: ${err?.message}`,
      );
    }

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

        // Reset experiment to 'planned' unless it already reached a terminal state
        if (currentStatus !== 'completed' && currentStatus !== 'failed') {
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
    const memoryPolicy = opts?.memoryPolicy || 'none';
    const sourceAgentUsers = opts?.sourceAgentUsers || new Map<string, string>();

    // Extract role definitions from the org pattern structure
    const roles = orgPattern.structure.roles;

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
    });

    const agents = [];
    const agentsByRole: Record<string, any> = {};

    // Create agent instances per role
    for (const [roleId, roleDef] of Object.entries(roles)) {
      const count = roleDef.minInstances || 1;

      const roleName = roleDef.name || roleId;

      for (let i = 1; i <= count; i++) {
        const agentName =
          count > 1
            ? `${orgPattern.name} - ${roleName} #${i}`
            : `${orgPattern.name} - ${roleName}`;

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
          `You are "${roleName}", part of the "${orgPattern.name}" team.`,
          roleDef.description || '',
          `Your capabilities: ${ensurePersistenceCapabilities(roleDef.capabilities).join(', ')}`,
        ]
          .filter(Boolean)
          .join('\n');

        const normalizedCapabilities = ensurePersistenceCapabilities(
          roleDef.capabilities,
        );
        const roleMetadata = roleDef.metadata || {};
        const roleAgentType =
          roleDef.agentType ||
          (roleMetadata as any).agentType ||
          intelligence.defaultTeamAgentType ||
          process.env.TEAM_AGENT_DEFAULT_TYPE ||
          'claude-code';
        const roleWorkdir =
          roleDef.workdir ||
          (roleMetadata as any).workdir ||
          process.env.TEAM_AGENT_DEFAULT_WORKDIR ||
          null;
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
    for (const [roleId, roleDef] of Object.entries(roles)) {
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

    // Spawn Parallax threads eagerly at deploy time (if SDK is available)
    if (this.isThreadRuntimeAvailable) {
      await this.spawnThreadsForDeployment(deployment, agents, workspaceId);
    }

    return { deployment, agents };
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
