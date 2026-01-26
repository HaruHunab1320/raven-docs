import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ParallaxAgentsService } from './parallax-agents.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { AgentAccessRequestDto } from './dto/access-request.dto';
import {
  ApproveAgentDto,
  DenyAgentDto,
  RevokeAgentDto,
  UpdateAgentPermissionsDto,
} from './dto/approve-agent.dto';
import {
  AssignAgentToProjectDto,
  AssignAgentToTaskDto,
} from './dto/assign-agent.dto';
import {
  CreateAgentInviteDto,
  RegisterWithInviteDto,
} from './dto/agent-invite.dto';
import {
  SpawnAgentRequestDto,
  TestRuntimeConnectionDto,
  RuntimeHeartbeatDto,
} from './dto/runtime.dto';
import { User } from '../../database/types/entity.types';
import { Workspace } from '../../database/types/entity.types';
import { ParallaxAgentStatus } from '../../database/repos/parallax-agent/parallax-agent.repo';

@Controller('parallax-agents')
export class ParallaxAgentsController {
  constructor(private readonly agentsService: ParallaxAgentsService) {}

  /**
   * Webhook endpoint for Parallax to request access
   * This endpoint may be called without auth from Parallax control plane
   */
  @Post('access-request')
  @HttpCode(HttpStatus.CREATED)
  async handleAccessRequest(
    @Body() body: AgentAccessRequestDto & { workspaceId: string },
  ) {
    // TODO: Verify webhook signature from Parallax
    const { workspaceId, ...request } = body;
    return this.agentsService.handleAccessRequest(workspaceId, request);
  }

  /**
   * Get pending access requests for the current workspace
   */
  @Get('pending')
  @UseGuards(JwtAuthGuard)
  async getPendingRequests(@AuthWorkspace() workspace: Workspace) {
    return this.agentsService.getPendingRequests(workspace.id);
  }

  /**
   * Get all agents in the workspace
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  async getWorkspaceAgents(
    @AuthWorkspace() workspace: Workspace,
    @Query('status') status?: ParallaxAgentStatus,
    @Query('capabilities') capabilities?: string,
  ) {
    if (capabilities) {
      return this.agentsService.getAvailableAgents(
        workspace.id,
        capabilities.split(','),
      );
    }
    return this.agentsService.getWorkspaceAgents(workspace.id, status);
  }

  /**
   * Get available agents (approved) with optional capability filter
   */
  @Get('available')
  @UseGuards(JwtAuthGuard)
  async getAvailableAgents(
    @AuthWorkspace() workspace: Workspace,
    @Query('capabilities') capabilities?: string,
  ) {
    return this.agentsService.getAvailableAgents(
      workspace.id,
      capabilities?.split(','),
    );
  }

  /**
   * Get single agent details
   */
  @Get(':agentId')
  @UseGuards(JwtAuthGuard)
  async getAgent(
    @Param('agentId') agentId: string,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const agent = await this.agentsService.getAgent(agentId, workspace.id);
    if (!agent) {
      throw new Error('Agent not found');
    }
    return agent;
  }

  /**
   * Approve agent access
   */
  @Post(':agentId/approve')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async approveAccess(
    @Param('agentId') agentId: string,
    @Body() body: ApproveAgentDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.agentsService.approveAccess(
      agentId,
      workspace.id,
      body.grantedPermissions,
      user.id,
    );
  }

  /**
   * Deny agent access
   */
  @Post(':agentId/deny')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async denyAccess(
    @Param('agentId') agentId: string,
    @Body() body: DenyAgentDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.agentsService.denyAccess(
      agentId,
      workspace.id,
      body.reason,
      user.id,
    );
  }

  /**
   * Revoke agent access
   */
  @Post(':agentId/revoke')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async revokeAccess(
    @Param('agentId') agentId: string,
    @Body() body: RevokeAgentDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.agentsService.revokeAccess(
      agentId,
      workspace.id,
      body.reason,
      user.id,
    );
    return { success: true };
  }

  /**
   * Update agent permissions
   */
  @Post(':agentId/permissions')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async updatePermissions(
    @Param('agentId') agentId: string,
    @Body() body: UpdateAgentPermissionsDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.agentsService.updatePermissions(
      agentId,
      workspace.id,
      body.permissions,
      user.id,
    );
  }

  /**
   * Assign agent to a project
   */
  @Post(':agentId/assign/project')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async assignToProject(
    @Param('agentId') agentId: string,
    @Body() body: AssignAgentToProjectDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.agentsService.assignToProject(
      agentId,
      workspace.id,
      body.projectId,
      body.role || 'member',
      user.id,
    );
  }

  /**
   * Assign agent to a task
   */
  @Post(':agentId/assign/task')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async assignToTask(
    @Param('agentId') agentId: string,
    @Body() body: AssignAgentToTaskDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.agentsService.assignToTask(
      agentId,
      workspace.id,
      body.taskId,
      user.id,
    );
  }

  /**
   * Get agent assignments
   */
  @Get(':agentId/assignments')
  @UseGuards(JwtAuthGuard)
  async getAgentAssignments(
    @Param('agentId') agentId: string,
    @AuthWorkspace() workspace: Workspace,
  ) {
    // Verify agent belongs to workspace
    const agent = await this.agentsService.getAgent(agentId, workspace.id);
    if (!agent) {
      throw new Error('Agent not found');
    }
    return this.agentsService.getAgentAssignments(agentId);
  }

  /**
   * Unassign agent
   */
  @Delete('assignments/:assignmentId')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async unassign(@Param('assignmentId') assignmentId: string) {
    await this.agentsService.unassign(assignmentId);
    return { success: true };
  }

  /**
   * Get agent activity log
   */
  @Get(':agentId/activity')
  @UseGuards(JwtAuthGuard)
  async getActivity(
    @Param('agentId') agentId: string,
    @AuthWorkspace() workspace: Workspace,
    @Query('limit') limit?: string,
  ) {
    return this.agentsService.getAgentActivity(
      agentId,
      workspace.id,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  /**
   * Get agents assigned to a project
   */
  @Get('project/:projectId')
  @UseGuards(JwtAuthGuard)
  async getProjectAgents(@Param('projectId') projectId: string) {
    return this.agentsService.getProjectAgents(projectId);
  }

  /**
   * Get agents assigned to a task
   */
  @Get('task/:taskId')
  @UseGuards(JwtAuthGuard)
  async getTaskAgents(@Param('taskId') taskId: string) {
    return this.agentsService.getTaskAgents(taskId);
  }

  /**
   * Get workspace-wide activity
   */
  @Get('activity/workspace')
  @UseGuards(JwtAuthGuard)
  async getWorkspaceActivity(
    @AuthWorkspace() workspace: Workspace,
    @Query('limit') limit?: string,
  ) {
    return this.agentsService.getWorkspaceActivity(
      workspace.id,
      limit ? parseInt(limit, 10) : 100,
    );
  }

  // ========== Invites ==========

  /**
   * Create a new agent invite
   */
  @Post('invites')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async createInvite(
    @Body() body: CreateAgentInviteDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.agentsService.createInvite(
      workspace.id,
      body.name,
      body.permissions,
      user.id,
      {
        description: body.description,
        usesRemaining: body.usesRemaining,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
      },
    );
  }

  /**
   * Get all invites for the workspace
   */
  @Get('invites')
  @UseGuards(JwtAuthGuard)
  async getInvites(@AuthWorkspace() workspace: Workspace) {
    return this.agentsService.getWorkspaceInvites(workspace.id);
  }

  /**
   * Get active invites for the workspace
   */
  @Get('invites/active')
  @UseGuards(JwtAuthGuard)
  async getActiveInvites(@AuthWorkspace() workspace: Workspace) {
    return this.agentsService.getActiveInvites(workspace.id);
  }

  /**
   * Get single invite details
   */
  @Get('invites/:inviteId')
  @UseGuards(JwtAuthGuard)
  async getInvite(
    @Param('inviteId') inviteId: string,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const invite = await this.agentsService.getInvite(inviteId);
    if (!invite || invite.workspaceId !== workspace.id) {
      throw new Error('Invite not found');
    }
    return invite;
  }

  /**
   * Revoke an invite
   */
  @Post('invites/:inviteId/revoke')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async revokeInvite(
    @Param('inviteId') inviteId: string,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const invite = await this.agentsService.getInvite(inviteId);
    if (!invite || invite.workspaceId !== workspace.id) {
      throw new Error('Invite not found');
    }
    return this.agentsService.revokeInvite(inviteId);
  }

  /**
   * Delete an invite
   */
  @Delete('invites/:inviteId')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async deleteInvite(
    @Param('inviteId') inviteId: string,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const invite = await this.agentsService.getInvite(inviteId);
    if (!invite || invite.workspaceId !== workspace.id) {
      throw new Error('Invite not found');
    }
    await this.agentsService.deleteInvite(inviteId);
    return { success: true };
  }

  /**
   * Public endpoint for agents to register with an invite token
   * This endpoint does not require authentication
   */
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async registerWithInvite(@Body() body: RegisterWithInviteDto) {
    return this.agentsService.registerWithInvite(body.inviteToken, {
      agentId: body.agentId,
      agentName: body.agentName,
      description: body.description,
      capabilities: body.capabilities,
      requestedPermissions: body.requestedPermissions || [],
      metadata: body.metadata,
      endpoint: body.endpoint,
    });
  }

  // ========== Agent Runtime & Spawning ==========

  /**
   * Request to spawn new agents via the configured runtime
   */
  @Post('spawn')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async spawnAgents(
    @Body() body: SpawnAgentRequestDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.agentsService.spawnAgents(workspace.id, body, user.id);
  }

  /**
   * Test connection to the runtime endpoint
   */
  @Post('runtime/test')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async testRuntimeConnection(
    @Body() body: TestRuntimeConnectionDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.agentsService.testRuntimeConnection(workspace.id, body.endpoint);
  }

  /**
   * Webhook endpoint for runtime heartbeats
   * Called by the runtime to report its status
   */
  @Post('runtime/heartbeat')
  @HttpCode(HttpStatus.OK)
  async handleRuntimeHeartbeat(
    @Body() body: RuntimeHeartbeatDto & { workspaceId: string },
  ) {
    const { workspaceId, ...heartbeat } = body;
    await this.agentsService.handleRuntimeHeartbeat(workspaceId, heartbeat);
    return { success: true };
  }

  /**
   * Callback endpoint for spawn results
   * Called by the runtime when an agent is ready, failed, or requires login
   */
  @Post('spawn-callback')
  @HttpCode(HttpStatus.OK)
  async handleSpawnCallback(
    @Body()
    body: {
      workspaceId: string;
      agentId: string;
      status: 'ready' | 'failed' | 'requires_login';
      error?: string;
      loginUrl?: string;
      mcpEndpoint?: string;
    },
  ) {
    await this.agentsService.handleSpawnCallback(body.workspaceId, body);
    return { success: true };
  }
}
