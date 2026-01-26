import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ParallaxAgentRepo,
  ParallaxAgent,
  ParallaxAgentStatus,
} from '../../database/repos/parallax-agent/parallax-agent.repo';
import {
  ParallaxAgentAssignmentRepo,
  ParallaxAgentAssignment,
} from '../../database/repos/parallax-agent/parallax-agent-assignment.repo';
import {
  ParallaxAgentActivityRepo,
  ParallaxAgentActivity,
} from '../../database/repos/parallax-agent/parallax-agent-activity.repo';
import {
  AgentInviteRepo,
  AgentInvite,
  CreateAgentInviteInput,
} from '../../database/repos/parallax-agent/agent-invite.repo';
import { MCPApiKeyService } from '../../integrations/mcp/services/mcp-api-key.service';
import { TerminalSessionService } from '../terminal/terminal-session.service';
import { AgentAccessRequestDto } from './dto/access-request.dto';
import {
  AGENT_LIMITS,
  AGENT_PERMISSIONS,
  AgentPermission,
} from './constants/permissions.constants';

export interface ApprovalResult {
  agent: ParallaxAgent;
  mcpApiKey: string;
}

@Injectable()
export class ParallaxAgentsService {
  private readonly logger = new Logger(ParallaxAgentsService.name);

  constructor(
    private readonly agentRepo: ParallaxAgentRepo,
    private readonly assignmentRepo: ParallaxAgentAssignmentRepo,
    private readonly activityRepo: ParallaxAgentActivityRepo,
    private readonly inviteRepo: AgentInviteRepo,
    private readonly mcpApiKeyService: MCPApiKeyService,
    private readonly eventEmitter: EventEmitter2,
    @Inject(forwardRef(() => TerminalSessionService))
    private readonly terminalSessionService: TerminalSessionService,
  ) {}

  // ========== Access Management ==========

  async handleAccessRequest(
    workspaceId: string,
    request: AgentAccessRequestDto,
  ): Promise<ParallaxAgent> {
    // Check if agent already exists in this workspace
    const existing = await this.agentRepo.findByIdAndWorkspace(
      request.agentId,
      workspaceId,
    );

    if (existing) {
      if (existing.status === 'approved') {
        throw new Error('Agent already has access to this workspace');
      }

      // Update existing pending request
      const updated = await this.agentRepo.update(request.agentId, workspaceId, {
        name: request.agentName,
        description: request.description,
        capabilities: request.capabilities,
        requestedPermissions: request.requestedPermissions,
        metadata: request.metadata || {},
        endpoint: request.endpoint,
      });

      this.logger.log(
        `Updated access request: ${request.agentId} -> workspace ${workspaceId}`,
      );

      return updated;
    }

    // Check workspace agent limit
    const agentCount = await this.agentRepo.countByWorkspace(workspaceId);
    if (agentCount >= AGENT_LIMITS.maxAgentsPerWorkspace) {
      throw new Error(
        `Workspace has reached maximum agent limit (${AGENT_LIMITS.maxAgentsPerWorkspace})`,
      );
    }

    // Validate requested permissions
    const invalidPermissions = request.requestedPermissions.filter(
      (p) => !(p in AGENT_PERMISSIONS),
    );
    if (invalidPermissions.length > 0) {
      throw new Error(`Invalid permissions: ${invalidPermissions.join(', ')}`);
    }

    // Create new access request
    const agent = await this.agentRepo.create({
      id: request.agentId,
      workspaceId,
      name: request.agentName,
      description: request.description,
      capabilities: request.capabilities,
      requestedPermissions: request.requestedPermissions,
      metadata: request.metadata || {},
      endpoint: request.endpoint,
    });

    await this.logActivity(agent.id, workspaceId, 'access_requested', {
      capabilities: request.capabilities,
      requestedPermissions: request.requestedPermissions,
      justification: request.justification,
    });

    // Emit event for UI notifications
    this.eventEmitter.emit('parallax.access_requested', {
      agent,
      workspaceId,
    });

    this.logger.log(
      `New agent access request: ${request.agentId} -> workspace ${workspaceId}`,
    );

    return agent;
  }

  async approveAccess(
    agentId: string,
    workspaceId: string,
    grantedPermissions: string[],
    approvedBy: string,
  ): Promise<ApprovalResult> {
    const agent = await this.agentRepo.findByIdAndWorkspace(
      agentId,
      workspaceId,
    );

    if (!agent) {
      throw new Error('Agent not found');
    }

    if (agent.status !== 'pending') {
      throw new Error(`Cannot approve agent with status: ${agent.status}`);
    }

    // Validate granted permissions
    const invalidPermissions = grantedPermissions.filter(
      (p) => !(p in AGENT_PERMISSIONS),
    );
    if (invalidPermissions.length > 0) {
      throw new Error(`Invalid permissions: ${invalidPermissions.join(', ')}`);
    }

    // Create MCP API key for this agent
    const apiKey = await this.mcpApiKeyService.generateApiKey(
      `agent:${agentId}`, // Use agent ID as pseudo-user
      workspaceId,
      `Agent: ${agent.name}`,
    );

    // Update agent record
    const updatedAgent = await this.agentRepo.update(agentId, workspaceId, {
      status: 'approved',
      grantedPermissions,
      resolvedAt: new Date(),
      resolvedBy: approvedBy,
    });

    await this.logActivity(agentId, workspaceId, 'access_approved', {
      approvedBy,
      grantedPermissions,
    });

    // Emit event
    this.eventEmitter.emit('parallax.access_approved', {
      agent: updatedAgent,
      workspaceId,
      grantedPermissions,
    });

    // Notify Parallax control plane
    await this.notifyParallax(agentId, workspaceId, 'approved', {
      grantedPermissions,
      mcpApiKey: apiKey,
    });

    this.logger.log(`Agent access approved: ${agentId} in workspace ${workspaceId}`);

    return { agent: updatedAgent, mcpApiKey: apiKey };
  }

  async denyAccess(
    agentId: string,
    workspaceId: string,
    reason: string,
    deniedBy: string,
  ): Promise<ParallaxAgent> {
    const agent = await this.agentRepo.findByIdAndWorkspace(
      agentId,
      workspaceId,
    );

    if (!agent) {
      throw new Error('Agent not found');
    }

    if (agent.status !== 'pending') {
      throw new Error(`Cannot deny agent with status: ${agent.status}`);
    }

    const updatedAgent = await this.agentRepo.update(agentId, workspaceId, {
      status: 'denied',
      denialReason: reason,
      resolvedAt: new Date(),
      resolvedBy: deniedBy,
    });

    await this.logActivity(agentId, workspaceId, 'access_denied', {
      deniedBy,
      reason,
    });

    this.eventEmitter.emit('parallax.access_denied', {
      agent: updatedAgent,
      workspaceId,
      reason,
    });

    await this.notifyParallax(agentId, workspaceId, 'denied', { reason });

    this.logger.log(`Agent access denied: ${agentId} - ${reason}`);

    return updatedAgent;
  }

  async revokeAccess(
    agentId: string,
    workspaceId: string,
    reason: string,
    revokedBy: string,
  ): Promise<void> {
    const agent = await this.agentRepo.findByIdAndWorkspace(
      agentId,
      workspaceId,
    );

    if (!agent) {
      throw new Error('Agent not found');
    }

    if (agent.status !== 'approved') {
      throw new Error(`Cannot revoke agent with status: ${agent.status}`);
    }

    // Revoke the MCP API key
    // Note: This would need the API key service to support revoking by metadata
    // For now, we'll mark the agent as revoked

    // Terminate any active terminal sessions
    try {
      await this.terminalSessionService.terminateByAgent(agentId);
      this.logger.log(`Terminated terminal sessions for agent ${agentId}`);
    } catch (error: any) {
      this.logger.warn(`Failed to terminate terminal sessions: ${error.message}`);
    }

    // Remove all active assignments
    await this.assignmentRepo.unassignAllByAgent(agentId);

    // Update agent status
    await this.agentRepo.update(agentId, workspaceId, {
      status: 'revoked',
      resolvedAt: new Date(),
      resolvedBy: revokedBy,
    });

    await this.logActivity(agentId, workspaceId, 'access_revoked', {
      revokedBy,
      reason,
    });

    this.eventEmitter.emit('parallax.access_revoked', {
      agentId,
      workspaceId,
      reason,
    });

    await this.notifyParallax(agentId, workspaceId, 'revoked', { reason });

    this.logger.log(`Agent access revoked: ${agentId} - ${reason}`);
  }

  async updatePermissions(
    agentId: string,
    workspaceId: string,
    permissions: string[],
    updatedBy: string,
  ): Promise<ParallaxAgent> {
    const agent = await this.agentRepo.findByIdAndWorkspace(
      agentId,
      workspaceId,
    );

    if (!agent) {
      throw new Error('Agent not found');
    }

    if (agent.status !== 'approved') {
      throw new Error('Can only update permissions for approved agents');
    }

    // Validate permissions
    const invalidPermissions = permissions.filter(
      (p) => !(p in AGENT_PERMISSIONS),
    );
    if (invalidPermissions.length > 0) {
      throw new Error(`Invalid permissions: ${invalidPermissions.join(', ')}`);
    }

    const updatedAgent = await this.agentRepo.update(agentId, workspaceId, {
      grantedPermissions: permissions,
    });

    await this.logActivity(agentId, workspaceId, 'permissions_updated', {
      updatedBy,
      oldPermissions: agent.grantedPermissions,
      newPermissions: permissions,
    });

    this.logger.log(`Agent permissions updated: ${agentId}`);

    return updatedAgent;
  }

  // ========== Assignments ==========

  async assignToProject(
    agentId: string,
    workspaceId: string,
    projectId: string,
    role: 'member' | 'lead' = 'member',
    assignedBy: string,
  ): Promise<ParallaxAgentAssignment> {
    const agent = await this.getApprovedAgent(agentId, workspaceId);

    // Check for existing assignment
    const existing = await this.assignmentRepo.findExistingAssignment(
      agentId,
      projectId,
    );
    if (existing) {
      throw new Error('Agent is already assigned to this project');
    }

    const assignment = await this.assignmentRepo.create({
      agentId,
      workspaceId,
      assignmentType: 'project',
      projectId,
      role,
      assignedBy,
    });

    await this.logActivity(agentId, workspaceId, 'assigned_to_project', {
      projectId,
      role,
      assignedBy,
    });

    this.eventEmitter.emit('parallax.project_assigned', {
      agentId,
      projectId,
      role,
      workspaceId,
    });

    this.logger.log(`Agent ${agentId} assigned to project ${projectId}`);

    return assignment;
  }

  async assignToTask(
    agentId: string,
    workspaceId: string,
    taskId: string,
    assignedBy: string,
  ): Promise<ParallaxAgentAssignment> {
    const agent = await this.getApprovedAgent(agentId, workspaceId);

    // Check for existing assignment
    const existing = await this.assignmentRepo.findExistingAssignment(
      agentId,
      undefined,
      taskId,
    );
    if (existing) {
      throw new Error('Agent is already assigned to this task');
    }

    const assignment = await this.assignmentRepo.create({
      agentId,
      workspaceId,
      assignmentType: 'task',
      taskId,
      assignedBy,
    });

    await this.logActivity(agentId, workspaceId, 'assigned_to_task', {
      taskId,
      assignedBy,
    });

    this.eventEmitter.emit('parallax.task_assigned', {
      agentId,
      taskId,
      workspaceId,
    });

    this.logger.log(`Agent ${agentId} assigned to task ${taskId}`);

    return assignment;
  }

  async unassign(assignmentId: string): Promise<void> {
    const assignment = await this.assignmentRepo.findById(assignmentId);

    if (!assignment) {
      throw new Error('Assignment not found');
    }

    if (assignment.unassignedAt) {
      throw new Error('Assignment is already inactive');
    }

    await this.assignmentRepo.unassign(assignmentId);

    await this.logActivity(
      assignment.agentId,
      assignment.workspaceId,
      'unassigned',
      {
        assignmentType: assignment.assignmentType,
        targetId: assignment.projectId || assignment.taskId,
      },
    );

    this.eventEmitter.emit('parallax.unassigned', {
      agentId: assignment.agentId,
      assignmentType: assignment.assignmentType,
      targetId: assignment.projectId || assignment.taskId,
      workspaceId: assignment.workspaceId,
    });

    this.logger.log(`Agent ${assignment.agentId} unassigned from ${assignmentId}`);
  }

  // ========== Queries ==========

  async getAgent(
    agentId: string,
    workspaceId: string,
  ): Promise<ParallaxAgent | null> {
    return (
      (await this.agentRepo.findByIdAndWorkspace(agentId, workspaceId)) || null
    );
  }

  async updateAgent(
    agentId: string,
    workspaceId: string,
    updates: Partial<{
      name: string;
      description: string;
      capabilities: string[];
      metadata: Record<string, any>;
      endpoint: string;
    }>,
  ): Promise<ParallaxAgent> {
    const agent = await this.agentRepo.findByIdAndWorkspace(
      agentId,
      workspaceId,
    );

    if (!agent) {
      throw new Error('Agent not found');
    }

    const updatedAgent = await this.agentRepo.update(agentId, workspaceId, updates);

    this.logger.log(`Agent ${agentId} updated`);

    return updatedAgent;
  }

  async getPendingRequests(workspaceId: string): Promise<ParallaxAgent[]> {
    return this.agentRepo.findPendingByWorkspace(workspaceId);
  }

  async getWorkspaceAgents(
    workspaceId: string,
    status?: ParallaxAgentStatus,
  ): Promise<ParallaxAgent[]> {
    return this.agentRepo.findByWorkspace(workspaceId, status);
  }

  async getAvailableAgents(
    workspaceId: string,
    capabilities?: string[],
  ): Promise<ParallaxAgent[]> {
    if (capabilities && capabilities.length > 0) {
      return this.agentRepo.findByCapabilities(workspaceId, capabilities);
    }
    return this.agentRepo.findApprovedByWorkspace(workspaceId);
  }

  async getProjectAgents(projectId: string): Promise<ParallaxAgent[]> {
    const assignments = await this.assignmentRepo.findByProject(projectId);
    const agents: ParallaxAgent[] = [];

    for (const assignment of assignments) {
      const agent = await this.agentRepo.findById(assignment.agentId);
      if (agent && agent.status === 'approved') {
        agents.push(agent);
      }
    }

    return agents;
  }

  async getTaskAgents(taskId: string): Promise<ParallaxAgent[]> {
    const assignments = await this.assignmentRepo.findByTask(taskId);
    const agents: ParallaxAgent[] = [];

    for (const assignment of assignments) {
      const agent = await this.agentRepo.findById(assignment.agentId);
      if (agent && agent.status === 'approved') {
        agents.push(agent);
      }
    }

    return agents;
  }

  async getAgentAssignments(
    agentId: string,
  ): Promise<ParallaxAgentAssignment[]> {
    return this.assignmentRepo.findActiveByAgent(agentId);
  }

  // ========== Activity ==========

  async logActivity(
    agentId: string,
    workspaceId: string,
    activityType: string,
    metadata: Record<string, any> = {},
    projectId?: string,
    taskId?: string,
    pageId?: string,
  ): Promise<ParallaxAgentActivity> {
    return this.activityRepo.create({
      agentId,
      workspaceId,
      activityType,
      metadata,
      projectId,
      taskId,
      pageId,
    });
  }

  async getAgentActivity(
    agentId: string,
    workspaceId: string,
    limit = 50,
  ): Promise<ParallaxAgentActivity[]> {
    return this.activityRepo.findByAgent(agentId, workspaceId, limit);
  }

  async getWorkspaceActivity(
    workspaceId: string,
    limit = 100,
  ): Promise<ParallaxAgentActivity[]> {
    return this.activityRepo.findByWorkspace(workspaceId, limit);
  }

  async getProjectActivity(
    projectId: string,
    limit = 50,
  ): Promise<ParallaxAgentActivity[]> {
    return this.activityRepo.findByProject(projectId, limit);
  }

  // ========== Invites ==========

  async createInvite(
    workspaceId: string,
    name: string,
    permissions: string[],
    createdBy: string,
    options?: {
      description?: string;
      usesRemaining?: number | null;
      expiresAt?: Date | null;
    },
  ): Promise<AgentInvite> {
    // Validate permissions
    const invalidPermissions = permissions.filter(
      (p) => !(p in AGENT_PERMISSIONS),
    );
    if (invalidPermissions.length > 0) {
      throw new Error(`Invalid permissions: ${invalidPermissions.join(', ')}`);
    }

    const invite = await this.inviteRepo.create({
      workspaceId,
      name,
      permissions,
      createdBy,
      description: options?.description,
      usesRemaining: options?.usesRemaining,
      expiresAt: options?.expiresAt,
    });

    this.logger.log(`Agent invite created: ${invite.id} for workspace ${workspaceId}`);

    return invite;
  }

  async getWorkspaceInvites(workspaceId: string): Promise<AgentInvite[]> {
    return this.inviteRepo.findByWorkspace(workspaceId);
  }

  async getActiveInvites(workspaceId: string): Promise<AgentInvite[]> {
    return this.inviteRepo.findActiveByWorkspace(workspaceId);
  }

  async getInvite(inviteId: string): Promise<AgentInvite | undefined> {
    return this.inviteRepo.findById(inviteId);
  }

  async revokeInvite(inviteId: string): Promise<AgentInvite> {
    const invite = await this.inviteRepo.revoke(inviteId);
    this.logger.log(`Agent invite revoked: ${inviteId}`);
    return invite;
  }

  async deleteInvite(inviteId: string): Promise<void> {
    await this.inviteRepo.delete(inviteId);
    this.logger.log(`Agent invite deleted: ${inviteId}`);
  }

  async registerWithInvite(
    inviteToken: string,
    request: AgentAccessRequestDto,
  ): Promise<ApprovalResult> {
    // Validate the invite
    const { valid, invite, reason } = await this.inviteRepo.isValidInvite(inviteToken);

    if (!valid || !invite) {
      throw new Error(reason || 'Invalid invite');
    }

    // Check if agent already exists
    const existing = await this.agentRepo.findByIdAndWorkspace(
      request.agentId,
      invite.workspaceId,
    );

    if (existing) {
      if (existing.status === 'approved') {
        throw new Error('Agent already has access to this workspace');
      }
      // If pending/denied/revoked, we'll update and approve
    }

    // Check workspace agent limit
    const agentCount = await this.agentRepo.countByWorkspace(invite.workspaceId);
    if (agentCount >= AGENT_LIMITS.maxAgentsPerWorkspace) {
      throw new Error(
        `Workspace has reached maximum agent limit (${AGENT_LIMITS.maxAgentsPerWorkspace})`,
      );
    }

    // Create or update the agent record
    let agent: ParallaxAgent;
    if (existing) {
      agent = await this.agentRepo.update(request.agentId, invite.workspaceId, {
        name: request.agentName,
        description: request.description,
        capabilities: request.capabilities,
        requestedPermissions: request.requestedPermissions,
        metadata: request.metadata || {},
        endpoint: request.endpoint,
        inviteId: invite.id,
      });
    } else {
      agent = await this.agentRepo.create({
        id: request.agentId,
        workspaceId: invite.workspaceId,
        name: request.agentName,
        description: request.description,
        capabilities: request.capabilities,
        requestedPermissions: request.requestedPermissions,
        metadata: request.metadata || {},
        endpoint: request.endpoint,
        inviteId: invite.id,
      });
    }

    // Increment invite usage
    await this.inviteRepo.incrementUsage(invite.id);

    // Create MCP API key for this agent
    const apiKey = await this.mcpApiKeyService.generateApiKey(
      `agent:${request.agentId}`,
      invite.workspaceId,
      `Agent: ${request.agentName}`,
    );

    // Auto-approve with invite permissions
    const updatedAgent = await this.agentRepo.update(request.agentId, invite.workspaceId, {
      status: 'approved',
      grantedPermissions: invite.permissions,
      resolvedAt: new Date(),
      // resolvedBy is null for invite-based registration
    });

    await this.logActivity(agent.id, invite.workspaceId, 'access_approved', {
      via: 'invite',
      inviteId: invite.id,
      inviteName: invite.name,
      grantedPermissions: invite.permissions,
    });

    this.eventEmitter.emit('parallax.access_approved', {
      agent: updatedAgent,
      workspaceId: invite.workspaceId,
      grantedPermissions: invite.permissions,
      via: 'invite',
    });

    // Notify Parallax control plane
    await this.notifyParallax(request.agentId, invite.workspaceId, 'approved', {
      grantedPermissions: invite.permissions,
      mcpApiKey: apiKey,
    });

    this.logger.log(
      `Agent ${request.agentId} registered via invite ${invite.id} in workspace ${invite.workspaceId}`,
    );

    return { agent: updatedAgent, mcpApiKey: apiKey };
  }

  // ========== Agent Runtime & Spawning ==========

  async spawnAgents(
    workspaceId: string,
    request: {
      agentType: string;
      count: number;
      name?: string;
      capabilities?: string[];
      permissions?: string[];
      projectId?: string;
      taskId?: string;
      config?: Record<string, any>;
    },
    userId: string,
  ): Promise<{
    success: boolean;
    spawnedAgents: Array<{ id: string; name: string; type: string; status: string }>;
    errors?: string[];
  }> {
    this.logger.log(`Spawn request: ${request.count} ${request.agentType} agents for workspace ${workspaceId}`);

    // Get workspace settings to determine runtime endpoint
    const runtimeEndpoint = await this.getRuntimeEndpoint(workspaceId);

    if (!runtimeEndpoint) {
      throw new Error('Runtime endpoint not configured. Please configure hosting settings.');
    }

    const spawnedAgents: Array<{ id: string; name: string; type: string; status: string }> = [];
    const errors: string[] = [];

    try {
      // Send spawn request to runtime
      const response = await fetch(`${runtimeEndpoint}/api/spawn`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Workspace-Id': workspaceId,
          'X-Request-Id': crypto.randomUUID(),
        },
        body: JSON.stringify({
          agentType: request.agentType,
          count: request.count,
          name: request.name,
          capabilities: request.capabilities,
          permissions: request.permissions,
          config: request.config,
          workspaceId,
          callbackUrl: `${process.env.APP_URL}/api/parallax-agents/spawn-callback`,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Runtime returned ${response.status}: ${errorText}`);
      }

      const result = await response.json();

      // Process spawned agents from runtime response
      for (const agent of result.agents || []) {
        // If the runtime provides a session ID, create terminal session immediately
        if (agent.runtimeSessionId) {
          try {
            const session = await this.terminalSessionService.createSession(
              agent.id,
              workspaceId,
              agent.runtimeSessionId,
              {
                title: agent.name || `Terminal: ${request.agentType}`,
                runtimeEndpoint: agent.runtimeEndpoint,
              },
            );
            this.logger.log(`Terminal session ${session.id} created for spawned agent ${agent.id}`);
          } catch (error: any) {
            this.logger.warn(`Failed to create terminal session: ${error.message}`);
          }
        }

        spawnedAgents.push({
          id: agent.id,
          name: agent.name || `${request.agentType}-${agent.id.slice(0, 8)}`,
          type: request.agentType,
          status: agent.status || 'spawning',
        });
      }

      // Log the spawn activity
      await this.logActivity('system', workspaceId, 'agents_spawned', {
        agentType: request.agentType,
        count: request.count,
        spawnedAgents,
        requestedBy: userId,
      });

      this.eventEmitter.emit('parallax.agents_spawned', {
        workspaceId,
        agentType: request.agentType,
        count: spawnedAgents.length,
        spawnedAgents,
      });

    } catch (error: any) {
      this.logger.error(`Spawn failed: ${error.message}`);
      errors.push(error.message);
    }

    return {
      success: errors.length === 0,
      spawnedAgents,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  async testRuntimeConnection(
    workspaceId: string,
    endpoint?: string,
  ): Promise<{
    connected: boolean;
    latency?: number;
    version?: string;
    activeAgents?: number;
    error?: string;
  }> {
    const runtimeEndpoint = endpoint || await this.getRuntimeEndpoint(workspaceId);

    if (!runtimeEndpoint) {
      return { connected: false, error: 'Runtime endpoint not configured' };
    }

    const startTime = Date.now();

    try {
      const response = await fetch(`${runtimeEndpoint}/api/health`, {
        method: 'GET',
        headers: {
          'X-Workspace-Id': workspaceId,
        },
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      const latency = Date.now() - startTime;

      if (!response.ok) {
        return {
          connected: false,
          latency,
          error: `Runtime returned ${response.status}: ${response.statusText}`,
        };
      }

      const data = await response.json();

      return {
        connected: true,
        latency,
        version: data.version,
        activeAgents: data.activeAgents,
      };
    } catch (error: any) {
      return {
        connected: false,
        latency: Date.now() - startTime,
        error: error.message,
      };
    }
  }

  async handleRuntimeHeartbeat(
    workspaceId: string,
    heartbeat: {
      runtimeId: string;
      activeAgents?: number;
      version?: string;
      metadata?: Record<string, any>;
    },
  ): Promise<void> {
    this.logger.debug(`Runtime heartbeat from ${heartbeat.runtimeId} for workspace ${workspaceId}`);

    // Update runtime status in workspace settings
    // This would typically be done through a workspace service
    this.eventEmitter.emit('workspace.runtime_heartbeat', {
      workspaceId,
      runtimeId: heartbeat.runtimeId,
      activeAgents: heartbeat.activeAgents,
      version: heartbeat.version,
      timestamp: new Date().toISOString(),
    });
  }

  async handleSpawnCallback(
    workspaceId: string,
    callback: {
      agentId: string;
      status: 'ready' | 'failed' | 'requires_login';
      error?: string;
      loginUrl?: string;
      mcpEndpoint?: string;
      runtimeSessionId?: string;
      runtimeEndpoint?: string;
    },
  ): Promise<void> {
    this.logger.log(`Spawn callback: ${callback.agentId} is ${callback.status}`);

    if (callback.status === 'ready') {
      // Agent is ready, create terminal session if runtime session ID is provided
      if (callback.runtimeSessionId) {
        try {
          const agent = await this.agentRepo.findById(callback.agentId);
          const session = await this.terminalSessionService.createSession(
            callback.agentId,
            workspaceId,
            callback.runtimeSessionId,
            {
              title: agent ? `Terminal: ${agent.name}` : `Terminal: ${callback.agentId}`,
              runtimeEndpoint: callback.runtimeEndpoint,
            },
          );

          this.logger.log(`Terminal session ${session.id} created for agent ${callback.agentId}`);

          // Update session status to active
          await this.terminalSessionService.updateStatus(session.id, 'active');
        } catch (error: any) {
          this.logger.error(`Failed to create terminal session: ${error.message}`);
        }
      }

      this.eventEmitter.emit('parallax.agent_ready', {
        workspaceId,
        agentId: callback.agentId,
        mcpEndpoint: callback.mcpEndpoint,
        runtimeSessionId: callback.runtimeSessionId,
      });
    } else if (callback.status === 'requires_login') {
      // Agent needs user login (e.g., device code flow)
      // Create terminal session in login_required state
      if (callback.runtimeSessionId) {
        try {
          const agent = await this.agentRepo.findById(callback.agentId);
          const session = await this.terminalSessionService.createSession(
            callback.agentId,
            workspaceId,
            callback.runtimeSessionId,
            {
              title: agent ? `Terminal: ${agent.name}` : `Terminal: ${callback.agentId}`,
              runtimeEndpoint: callback.runtimeEndpoint,
            },
          );

          // Set session to login_required state
          await this.terminalSessionService.updateStatus(session.id, 'login_required');

          this.logger.log(`Terminal session ${session.id} waiting for login`);
        } catch (error: any) {
          this.logger.error(`Failed to create terminal session: ${error.message}`);
        }
      }

      this.eventEmitter.emit('parallax.login_required', {
        workspaceId,
        agentId: callback.agentId,
        loginUrl: callback.loginUrl,
        runtimeSessionId: callback.runtimeSessionId,
      });
    } else if (callback.status === 'failed') {
      this.eventEmitter.emit('parallax.spawn_failed', {
        workspaceId,
        agentId: callback.agentId,
        error: callback.error,
      });
    }

    await this.logActivity(callback.agentId, workspaceId, `spawn_${callback.status}`, {
      error: callback.error,
      loginUrl: callback.loginUrl,
      runtimeSessionId: callback.runtimeSessionId,
    });
  }

  private async getRuntimeEndpoint(workspaceId: string): Promise<string | null> {
    // This would typically fetch from workspace settings
    // For now, check environment variable as fallback
    const envEndpoint = process.env.AGENT_RUNTIME_ENDPOINT;
    if (envEndpoint) {
      return envEndpoint;
    }

    // Would need to inject workspace service to get settings
    // For MVP, return null if not configured
    return null;
  }

  // ========== Private Helpers ==========

  private async getApprovedAgent(
    agentId: string,
    workspaceId: string,
  ): Promise<ParallaxAgent> {
    const agent = await this.agentRepo.findByIdAndWorkspace(
      agentId,
      workspaceId,
    );

    if (!agent) {
      throw new Error('Agent not found');
    }

    if (agent.status !== 'approved') {
      throw new Error('Agent is not approved');
    }

    return agent;
  }

  private async notifyParallax(
    agentId: string,
    workspaceId: string,
    status: string,
    data: Record<string, any>,
  ): Promise<void> {
    const parallaxEndpoint = process.env.PARALLAX_CONTROL_PLANE_URL;
    if (!parallaxEndpoint) {
      this.logger.debug('PARALLAX_CONTROL_PLANE_URL not configured, skipping notification');
      return;
    }

    try {
      const response = await fetch(
        `${parallaxEndpoint}/api/agents/${agentId}/workspaces/${workspaceId}/${status}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Secret': process.env.PARALLAX_WEBHOOK_SECRET || '',
          },
          body: JSON.stringify(data),
        },
      );

      if (!response.ok) {
        this.logger.warn(
          `Failed to notify Parallax: ${response.status} ${response.statusText}`,
        );
      }
    } catch (error: any) {
      this.logger.error(`Failed to notify Parallax: ${error.message}`);
    }
  }
}
