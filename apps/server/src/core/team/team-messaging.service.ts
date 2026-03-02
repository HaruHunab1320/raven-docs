import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'crypto';
import { TeamDeploymentRepo } from '../../database/repos/team/team-deployment.repo';
import { AgentExecutionService } from '../coding-swarm/agent-execution.service';
import { WorkspacePreparationService } from '../coding-swarm/workspace-preparation.service';
import { TerminalSessionService } from '../terminal/terminal-session.service';
import { WorkspaceRepo } from '@raven-docs/db/repos/workspace/workspace.repo';
import { UserService } from '../user/user.service';
import { resolveAgentSettings } from '../agent/agent-settings';
import { mapSwarmPermissionToApprovalPreset } from '../coding-swarm/swarm-permission-level';
import { ensureScratchDir } from './team-scratch-dir';
import { ensurePersistenceCapabilities } from './capability-guards';
import { buildCapabilityInstructions } from './team-agent-instructions';
import type { RoutingRule } from './org-chart.types';
import type { TeamMessage, SendResult, AgentInfo } from './team-messaging.types';

@Injectable()
export class TeamMessagingService {
  private readonly logger = new Logger(TeamMessagingService.name);
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
    private readonly workspacePreparationService: WorkspacePreparationService,
    private readonly terminalSessionService: TerminalSessionService,
    private readonly workspaceRepo: WorkspaceRepo,
    private readonly userService: UserService,
  ) {}

  /**
   * Resolve the calling agent from the MCP user (pseudo-user).
   * Returns the team agent record, or null if the user is not a team agent.
   */
  async resolveCallerAgent(userId: string): Promise<any | null> {
    // Look up the team agent by userId across active deployments
    const agent = await this.teamRepo.findAgentByUserId(userId);
    return agent || null;
  }

  /**
   * Send a message from one agent to another.
   * `to` can be an agent ID or a role name (resolves to first available agent of that role).
   * `fromAgentId` can be an agent ID or 'system' for system-initiated messages.
   */
  async sendMessage(
    fromAgentId: string,
    to: string,
    message: string,
  ): Promise<SendResult> {
    // Resolve the sender
    let fromAgent: any = null;
    let deploymentId: string;

    if (fromAgentId === 'system') {
      // System messages need the `to` to be an agent ID
      const toAgent = await this.teamRepo.findAgentById(to);
      if (!toAgent) {
        throw new Error(`Target agent not found: ${to}`);
      }
      deploymentId = toAgent.deploymentId;
      fromAgent = { id: 'system', role: 'system', deploymentId };
    } else {
      fromAgent = await this.teamRepo.findAgentById(fromAgentId);
      if (!fromAgent) {
        throw new Error(`Sender agent not found: ${fromAgentId}`);
      }
      deploymentId = fromAgent.deploymentId;
    }

    // Resolve the target agent
    const agents = await this.teamRepo.getAgentsByDeployment(deploymentId);
    let toAgent = agents.find((a) => a.id === to);

    if (!toAgent) {
      // Try resolving by role name
      toAgent = agents.find((a) => a.role === to);
    }

    if (!toAgent) {
      throw new Error(
        `Target agent not found: "${to}". Available agents: ${agents.map((a) => `${a.role} (${a.id.slice(0, 8)})`).join(', ')}`,
      );
    }

    // Validate routing (skip for system messages)
    if (fromAgentId !== 'system') {
      const deployment = await this.teamRepo.findById(deploymentId);
      const orgPattern = this.parseOrgPattern(deployment);
      const routing = orgPattern?.structure?.routing || [];

      if (!this.validateRouting(fromAgent, toAgent, routing, agents)) {
        throw new Error(
          `Routing not allowed: ${fromAgent.role} cannot message ${toAgent.role}. ` +
          `You can message your supervisor or direct reports.`,
        );
      }
    }

    // Store the message
    const msg: TeamMessage = {
      id: randomUUID(),
      deploymentId,
      fromAgentId: fromAgent.id,
      fromRole: fromAgent.role,
      toAgentId: toAgent.id,
      toRole: toAgent.role,
      message,
      delivered: false,
      readByRecipient: false,
      createdAt: new Date().toISOString(),
    };

    await this.appendMessage(deploymentId, msg);

    // Spawn target agent if not running
    let agentSpawned = false;
    if (toAgent.status === 'idle' && !toAgent.runtimeSessionId) {
      try {
        await this.ensureAgentRunning(toAgent, deploymentId, message);
        agentSpawned = true;
      } catch (err: any) {
        this.logger.error(
          `Failed to spawn agent ${toAgent.id} (${toAgent.role}): ${err?.message}`,
        );
      }
    } else if (toAgent.runtimeSessionId) {
      // If agent is running and at a blocking prompt, deliver immediately
      await this.deliverPendingMessages(toAgent.id);
    }

    // Emit event for UI
    this.eventEmitter.emit('team.message_sent', {
      deploymentId,
      messageId: msg.id,
      fromAgentId: fromAgent.id,
      fromRole: fromAgent.role,
      toAgentId: toAgent.id,
      toRole: toAgent.role,
      agentSpawned,
    });

    this.logger.log(
      `Message sent: ${fromAgent.role} -> ${toAgent.role} (spawned=${agentSpawned})`,
    );

    return {
      messageId: msg.id,
      delivered: agentSpawned, // Will be delivered as initial prompt
      agentSpawned,
      toAgentId: toAgent.id,
      toRole: toAgent.role,
    };
  }

  /**
   * Read messages for an agent. Marks messages as read.
   */
  async readMessages(
    agentId: string,
    opts?: { unreadOnly?: boolean },
  ): Promise<TeamMessage[]> {
    const agent = await this.teamRepo.findAgentById(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const messages = await this.getMessages(agent.deploymentId);
    const agentMessages = messages.filter((m) => m.toAgentId === agentId);

    const result = opts?.unreadOnly
      ? agentMessages.filter((m) => !m.readByRecipient)
      : agentMessages;

    // Mark as read
    if (result.length > 0) {
      const unreadIds = new Set(result.filter((m) => !m.readByRecipient).map((m) => m.id));
      if (unreadIds.size > 0) {
        const allMessages = await this.getMessages(agent.deploymentId);
        for (const m of allMessages) {
          if (unreadIds.has(m.id)) {
            m.readByRecipient = true;
          }
        }
        await this.setMessages(agent.deploymentId, allMessages);
      }
    }

    return result;
  }

  /**
   * Get the team roster visible to an agent (respects org chart).
   */
  async getTeamRoster(agentId: string): Promise<AgentInfo[]> {
    const agent = await this.teamRepo.findAgentById(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const agents = await this.teamRepo.getAgentsByDeployment(agent.deploymentId);
    const deployment = await this.teamRepo.findById(agent.deploymentId);
    const orgPattern = this.parseOrgPattern(deployment);
    const routing = orgPattern?.structure?.routing || [];

    return agents
      .filter((a) => a.id !== agentId) // exclude self
      .map((a) => ({
        agentId: a.id,
        role: a.role,
        instanceNumber: a.instanceNumber,
        status: a.status,
        canMessage: this.validateRouting(agent, a, routing, agents),
        reportsToAgentId: a.reportsToAgentId,
      }));
  }

  /**
   * Validate that fromAgent can message toAgent based on org chart.
   */
  validateRouting(
    fromAgent: { id: string; role: string; reportsToAgentId?: string | null },
    toAgent: { id: string; role: string; reportsToAgentId?: string | null },
    routing: RoutingRule[],
    allAgents: Array<{ id: string; role: string; reportsToAgentId?: string | null }>,
  ): boolean {
    // Can always message your supervisor
    if (fromAgent.reportsToAgentId === toAgent.id) return true;

    // Can always message your direct reports
    if (toAgent.reportsToAgentId === fromAgent.id) return true;

    // Check explicit routing rules
    for (const rule of routing) {
      const fromRoles = Array.isArray(rule.from) ? rule.from : [rule.from];
      const toRoles = Array.isArray(rule.to) ? rule.to : [rule.to];

      if (
        fromRoles.includes(fromAgent.role) &&
        toRoles.includes(toAgent.role)
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get pending (unread) messages for an agent.
   */
  async getPendingMessages(agentId: string): Promise<TeamMessage[]> {
    const agent = await this.teamRepo.findAgentById(agentId);
    if (!agent) return [];

    const messages = await this.getMessages(agent.deploymentId);
    return messages.filter(
      (m) => m.toAgentId === agentId && !m.readByRecipient,
    );
  }

  /**
   * Deliver pending messages to an agent's PTY session.
   * Called when a running agent hits a blocking_prompt and has pending messages.
   * Returns the number of messages delivered.
   */
  async deliverPendingMessages(agentId: string): Promise<number> {
    const agent = await this.teamRepo.findAgentById(agentId);
    if (!agent || !agent.runtimeSessionId) return 0;

    const pending = await this.getPendingMessages(agentId);
    if (pending.length === 0) return 0;

    const formatted = this.formatMessagesForDelivery(pending);

    try {
      await this.agentExecution.send(
        agent.runtimeSessionId,
        formatted,
        agent.workspaceId,
      );

      // Mark as delivered and read
      const allMessages = await this.getMessages(agent.deploymentId);
      const pendingIds = new Set(pending.map((m) => m.id));
      for (const m of allMessages) {
        if (pendingIds.has(m.id)) {
          m.delivered = true;
          m.deliveredAt = new Date().toISOString();
          m.readByRecipient = true;
        }
      }
      await this.setMessages(agent.deploymentId, allMessages);

      this.logger.log(
        `Delivered ${pending.length} pending messages to agent ${agentId}`,
      );
      return pending.length;
    } catch (err: any) {
      this.logger.warn(
        `Failed to deliver messages to agent ${agentId}: ${err?.message}`,
      );
      return 0;
    }
  }

  /**
   * Ensure an agent has a running PTY session. Spawns one if needed.
   * Extracted from team-agent-loop.processor.ts.
   */
  async ensureAgentRunning(
    agent: any,
    deploymentId: string,
    initialMessage?: string,
  ): Promise<string> {
    if (agent.runtimeSessionId) return agent.runtimeSessionId;

    const deployment = await this.teamRepo.findById(deploymentId);
    if (!deployment) throw new Error(`Deployment not found: ${deploymentId}`);

    const deploymentConfig =
      typeof deployment.config === 'string'
        ? JSON.parse(deployment.config)
        : (deployment.config as Record<string, any> | undefined);

    const roleDef = Array.isArray(deploymentConfig?.roles)
      ? deploymentConfig.roles.find((r: any) => r?.role === agent.role)
      : null;

    const triggerUserId = agent.userId || deployment.deployedBy;
    const workspace = await this.workspaceRepo.findById(deployment.workspaceId);
    const agentSettings = resolveAgentSettings(workspace?.settings);
    const workspacePreset = agentSettings.swarmPermissionLevel;
    const defaultApprovalPreset =
      workspacePreset && workspacePreset !== 'standard'
        ? mapSwarmPermissionToApprovalPreset(workspacePreset)
        : ('permissive' as const);

    const agentType = this.normalizeAgentType(
      agent.agentType ||
        roleDef?.agentType ||
        deploymentConfig?.defaultAgentType ||
        process.env.TEAM_AGENT_DEFAULT_TYPE ||
        'claude',
    );
    const configuredWorkdir =
      agent.workdir ||
        roleDef?.workdir ||
        deploymentConfig?.workdir ||
        process.env.TEAM_AGENT_DEFAULT_WORKDIR ||
        null;

    const workdir =
      configuredWorkdir || ensureScratchDir(deploymentId, agent.id);
    const enableSandbox = !configuredWorkdir;

    const workspaceCredentials = await this.resolveAgentCredentials(
      deployment.workspaceId,
      agent.userId || undefined,
      deployment.deployedBy || undefined,
    );

    const prepExecutionId = agent.id;
    const explicitApprovalPreset = this.resolveApprovalPreset(
      (roleDef as any)?.approvalPreset ||
        (deploymentConfig as any)?.approvalPreset,
    );

    await this.workspacePreparationService.cleanupApiKey(
      prepExecutionId,
      triggerUserId || 'system',
    );

    const taskDescription = this.buildTeamTaskDescription(agent, deployment, initialMessage);
    const targetExperimentId = deploymentConfig?.targetExperimentId;
    const targetTaskId = deploymentConfig?.targetTaskId;

    const prepResult = await this.workspacePreparationService.prepareWorkspace({
      workspacePath: workdir,
      workspaceId: deployment.workspaceId,
      executionId: prepExecutionId,
      agentType,
      triggeredBy: triggerUserId || 'system',
      taskDescription,
      taskContext: {
        role: agent.role,
        capabilities: agent.capabilities || [],
        targetTaskId,
        targetExperimentId,
      },
      approvalPreset: explicitApprovalPreset || defaultApprovalPreset,
      enableSandbox,
    });

    const spawned = await this.agentExecution.spawn(
      deployment.workspaceId,
      {
        type: agentType,
        name: `team-${deploymentId.slice(0, 8)}-${agent.role}-${agent.instanceNumber}`,
        workdir,
        env: {
          ...workspaceCredentials,
          ...prepResult.env,
        },
        adapterConfig: prepResult.adapterConfig,
        // Claude Code's TUI (status bar, shortcuts, update banner) keeps
        // emitting output for several seconds.  A longer readySettleMs
        // ensures waitForReady() only resolves after the input prompt is
        // truly accepting input, so the subsequent send() actually submits.
        readySettleMs: 2000,
        inheritProcessEnv: !enableSandbox,
      },
      triggerUserId || undefined,
    );

    // Auto-accept the MCP server trust prompt that appears when Claude Code
    // finds `.mcp.json` in the workspace.  Option 1 ("Use this and all future
    // MCP servers in this project") is already pre-selected — just press Enter.
    this.agentExecution.addAutoResponseRule(spawned.id, {
      pattern: /New MCP server found|MCP servers? in \.mcp\.json|Use this and all future MCP servers/i,
      type: 'permission',
      response: '',
      responseType: 'keys',
      keys: ['enter'],
      description: 'Accept MCP server trust prompt for .mcp.json',
      safe: true,
      once: true,
    });

    const terminalSession = await this.terminalSessionService.createSession(
      agent.id,
      deployment.workspaceId,
      spawned.id,
      {
        title: `Team ${agent.role} #${agent.instanceNumber}`,
      },
    );

    await this.teamRepo.updateAgentRuntimeSession(agent.id, {
      agentType,
      workdir,
      runtimeSessionId: spawned.id,
      terminalSessionId: terminalSession.id,
    });
    await this.teamRepo.updateAgentStatus(agent.id, 'running');

    this.eventEmitter.emit('team.agent_loop.started', {
      deploymentId,
      teamAgentId: agent.id,
      role: agent.role,
    });

    this.logger.log(
      `Spawned agent ${agent.id} (${agent.role}): runtime=${spawned.id}`,
    );

    // Wait for ready, then deliver the initial message
    try {
      await this.agentExecution.waitForReady(spawned.id, 30_000);
    } catch (waitError: any) {
      this.logger.warn(
        `Session ${spawned.id} did not become ready: ${waitError.message}; delivering anyway`,
      );
    }

    // Small buffer after ready — readySettleMs (2s) already waits for output
    // silence, so this just accounts for any final rendering after the quiet period.
    const settleMs = Number(process.env.TEAM_AGENT_READY_SETTLE_MS) || 500;
    await new Promise((r) => setTimeout(r, settleMs));

    // Deliver all pending messages (including the one that triggered the spawn)
    if (initialMessage) {
      const pending = await this.getPendingMessages(agent.id);
      if (pending.length > 0) {
        const formatted = this.formatMessagesForDelivery(pending);
        try {
          await this.agentExecution.send(spawned.id, formatted, deployment.workspaceId);

          // Mark as delivered
          const allMessages = await this.getMessages(deploymentId);
          const pendingIds = new Set(pending.map((m) => m.id));
          for (const m of allMessages) {
            if (pendingIds.has(m.id)) {
              m.delivered = true;
              m.deliveredAt = new Date().toISOString();
              m.readByRecipient = true;
            }
          }
          await this.setMessages(deploymentId, allMessages);
        } catch (sendErr: any) {
          this.logger.warn(
            `Failed to deliver initial messages to ${spawned.id}: ${sendErr?.message}`,
          );
        }
      }
    }

    return spawned.id;
  }

  /**
   * Build the initial task message for the coordinator agent.
   */
  buildInitialTaskMessage(
    deployment: any,
    agents: any[],
  ): string {
    const config =
      typeof deployment.config === 'string'
        ? JSON.parse(deployment.config)
        : (deployment.config || {});

    const targetExperimentId = config.targetExperimentId;
    const targetTaskId = config.targetTaskId;
    const teamName = config.teamName || deployment.templateName;

    const agentList = agents
      .filter((a) => a.reportsToAgentId) // workers only
      .map((a) => `- **${a.role}** (agent ID: ${a.id.slice(0, 8)})`)
      .join('\n');

    const targetLine = targetExperimentId
      ? `Your target experiment ID is **${targetExperimentId}**. Start by reading it with \`experiment_get\`.`
      : targetTaskId
        ? `Your target task ID is **${targetTaskId}**. Start by reading it with \`task_get\`.`
        : 'No explicit target assigned.';

    return [
      `You are the coordinator of the "${teamName}" team. Your job is to plan the work, assign tasks to your team members via \`team_send_message\`, and synthesize results.`,
      '',
      targetLine,
      '',
      '## Your Team',
      agentList || '(No workers assigned yet)',
      '',
      '## Workflow',
      '1. Read and understand the target experiment/task',
      '2. Create a plan and decompose into subtasks',
      '3. Assign work to team members using `team_send_message`',
      '4. Continue doing your own work or periodically check `team_read_messages` for replies',
      '5. Once all workers have reported back, synthesize results and complete the target',
      '',
      'Use `team_list_team` to see team member statuses at any time.',
    ].join('\n');
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private formatMessagesForDelivery(messages: TeamMessage[]): string {
    if (messages.length === 1) {
      return `[Message from ${messages[0].fromRole}]: ${messages[0].message}`;
    }

    return messages
      .map((m) => `[Message from ${m.fromRole}]: ${m.message}`)
      .join('\n\n');
  }

  private async getMessages(deploymentId: string): Promise<TeamMessage[]> {
    const deployment = await this.teamRepo.findById(deploymentId);
    if (!deployment) return [];

    const raw = (deployment as any).messages;
    if (!raw) return [];
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw);
      } catch {
        return [];
      }
    }
    return Array.isArray(raw) ? raw : [];
  }

  private async setMessages(
    deploymentId: string,
    messages: TeamMessage[],
  ): Promise<void> {
    await this.teamRepo.updateMessages(deploymentId, messages);
  }

  private async appendMessage(
    deploymentId: string,
    message: TeamMessage,
  ): Promise<void> {
    const messages = await this.getMessages(deploymentId);
    messages.push(message);
    // Keep last 500 messages to prevent unbounded growth
    const trimmed = messages.slice(-500);
    await this.setMessages(deploymentId, trimmed);
  }

  private parseOrgPattern(deployment: any): any {
    const raw = deployment?.orgPattern || deployment?.config;
    if (!raw) return null;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!parsed?.structure) return null;
    return parsed;
  }

  private normalizeAgentType(value: string): string {
    const raw = (value || '').trim();
    if (!raw) return 'claude';
    const normalized = raw.toLowerCase();
    return this.agentTypeAliases[normalized] || normalized;
  }

  private resolveApprovalPreset(
    value: unknown,
  ): 'readonly' | 'standard' | 'permissive' | 'autonomous' | undefined {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return undefined;
    if (['readonly', 'standard', 'permissive', 'autonomous'].includes(normalized)) {
      return normalized as any;
    }
    if (normalized === 'yolo') return 'autonomous';
    return mapSwarmPermissionToApprovalPreset(normalized);
  }

  private async resolveAgentCredentials(
    workspaceId: string,
    agentUserId?: string,
    deployerUserId?: string,
  ): Promise<Record<string, string>> {
    if (agentUserId) {
      try {
        const creds = this.userService.resolveAgentProviderEnv(agentUserId, workspaceId);
        if (Object.keys(creds).length > 0) return creds;
      } catch { /* fall through */ }
    }
    if (deployerUserId) {
      try {
        return this.userService.resolveAgentProviderEnv(deployerUserId, workspaceId);
      } catch { /* return empty */ }
    }
    return {};
  }

  private buildTeamTaskDescription(
    agent: any,
    deployment: any,
    initialMessage?: string,
  ): string {
    const config =
      typeof deployment.config === 'string'
        ? JSON.parse(deployment.config)
        : (deployment.config || {});

    const capabilities = ensurePersistenceCapabilities(agent.capabilities as string[] || []);
    const caps = capabilities.join(', ') || 'none';
    const targetExperimentId = config.targetExperimentId;
    const targetTaskId = config.targetTaskId;
    const targetText = targetExperimentId
      ? `Target experiment: ${targetExperimentId}`
      : targetTaskId
        ? `Target task: ${targetTaskId}`
        : 'No explicit target constraint.';

    const capabilityGuide = buildCapabilityInstructions(capabilities, {
      role: agent.role,
      targetExperimentId,
      targetTaskId,
      workspaceId: deployment.workspaceId,
      spaceId: deployment.spaceId,
    });

    return [
      `Role: ${agent.role}`,
      `Task: ${initialMessage ? 'Await instructions via team messaging' : 'Continue assigned team workflow.'}`,
      targetText,
      '',
      'System instructions:',
      agent.systemPrompt || 'No explicit system prompt.',
      '',
      `MCP tools allowed for this role: ${caps}`,
      'Important: call Raven MCP tools directly (they are native tools, not HTTP endpoints). Your tools are already loaded — start with the workflow guide below. Persist all findings and artifacts to Raven Docs.',
      capabilityGuide,
    ].join('\n');
  }
}
