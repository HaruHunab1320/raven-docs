# Raven Docs + Parallax Integration

## Overview

This document describes what Raven Docs needs to implement to integrate with Parallax for multi-agent orchestration. Parallax agents will register, request workspace access, and execute tasks with human oversight.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           RAVEN DOCS                                 │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                    NEW: Agent Management                        │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │ │
│  │  │   Agent      │  │    Agent     │  │    Agent     │         │ │
│  │  │  Registry    │  │  Assignments │  │   Activity   │         │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘         │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                    EXISTING SYSTEMS                             │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │ │
│  │  │  MCP Standard│  │  WebSocket   │  │   Approval   │         │ │
│  │  │  (extended)  │  │   Events     │  │   System     │         │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘         │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                │                                     │
└────────────────────────────────┼─────────────────────────────────────┘
                                 │
                    HTTP/WebSocket/Webhooks
                                 │
┌────────────────────────────────┼─────────────────────────────────────┐
│                    PARALLAX CONTROL PLANE                            │
│                                │                                     │
│  ┌─────────────┐    ┌─────────┴─────────┐    ┌─────────────┐       │
│  │   Agent     │    │      Pattern      │    │   Event     │       │
│  │  Registry   │    │      Engine       │    │  Subscriber │       │
│  └─────────────┘    └───────────────────┘    └─────────────┘       │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Part 1: Agent Management Module

### 1.1 Database Schema

```sql
-- migrations/add_parallax_agents.sql

-- External agents from Parallax
CREATE TABLE parallax_agents (
  id VARCHAR(255) PRIMARY KEY,                    -- Matches Parallax agent ID
  workspace_id UUID REFERENCES workspaces(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  capabilities TEXT[] NOT NULL,

  -- Access control
  status VARCHAR(50) DEFAULT 'pending',           -- pending, approved, denied, revoked
  requested_permissions TEXT[] NOT NULL,
  granted_permissions TEXT[] DEFAULT '{}',
  mcp_api_key_id UUID REFERENCES api_keys(id),    -- Links to existing API key system

  -- Metadata from Parallax
  metadata JSONB DEFAULT '{}',
  endpoint VARCHAR(500),

  -- Audit
  requested_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP,
  resolved_by UUID REFERENCES users(id),
  denial_reason TEXT,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Agent assignments to projects and tasks
CREATE TABLE parallax_agent_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id VARCHAR(255) REFERENCES parallax_agents(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id),

  -- What they're assigned to
  assignment_type VARCHAR(50) NOT NULL,           -- 'project' or 'task'
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,

  role VARCHAR(50) DEFAULT 'member',              -- member, lead

  -- Audit
  assigned_at TIMESTAMP DEFAULT NOW(),
  assigned_by UUID REFERENCES users(id),
  unassigned_at TIMESTAMP,

  CONSTRAINT valid_assignment CHECK (
    (assignment_type = 'project' AND project_id IS NOT NULL AND task_id IS NULL) OR
    (assignment_type = 'task' AND task_id IS NOT NULL)
  )
);

-- Agent activity log
CREATE TABLE parallax_agent_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id VARCHAR(255) REFERENCES parallax_agents(id),
  workspace_id UUID REFERENCES workspaces(id),

  activity_type VARCHAR(100) NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',

  -- Related entities
  project_id UUID REFERENCES projects(id),
  task_id UUID REFERENCES tasks(id),
  page_id UUID REFERENCES pages(id),

  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_parallax_agents_workspace ON parallax_agents(workspace_id);
CREATE INDEX idx_parallax_agents_status ON parallax_agents(status);
CREATE INDEX idx_parallax_agents_capabilities ON parallax_agents USING GIN(capabilities);
CREATE INDEX idx_parallax_assignments_agent ON parallax_agent_assignments(agent_id);
CREATE INDEX idx_parallax_assignments_project ON parallax_agent_assignments(project_id);
CREATE INDEX idx_parallax_assignments_task ON parallax_agent_assignments(task_id);
CREATE INDEX idx_parallax_activity_agent ON parallax_agent_activity(agent_id);
CREATE INDEX idx_parallax_activity_created ON parallax_agent_activity(created_at);
```

### 1.2 Agent Service

```typescript
// apps/server/src/core/parallax-agents/parallax-agents.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiKeysService } from '../api-keys/api-keys.service';
import { ParallaxAgent, AgentAssignment, AgentActivity } from './entities';

export interface AgentAccessRequest {
  agentId: string;
  agentName: string;
  capabilities: string[];
  requestedPermissions: string[];
  metadata?: Record<string, any>;
  justification?: string;
}

@Injectable()
export class ParallaxAgentsService {
  private readonly logger = new Logger(ParallaxAgentsService.name);

  constructor(
    @InjectRepository(ParallaxAgent)
    private agentRepo: Repository<ParallaxAgent>,
    @InjectRepository(AgentAssignment)
    private assignmentRepo: Repository<AgentAssignment>,
    @InjectRepository(AgentActivity)
    private activityRepo: Repository<AgentActivity>,
    private apiKeysService: ApiKeysService,
  ) {}

  /**
   * Handle incoming access request from Parallax
   */
  async handleAccessRequest(
    workspaceId: string,
    request: AgentAccessRequest,
  ): Promise<ParallaxAgent> {
    // Check if agent already exists in this workspace
    let agent = await this.agentRepo.findOne({
      where: { id: request.agentId, workspaceId },
    });

    if (agent) {
      if (agent.status === 'approved') {
        throw new Error('Agent already has access to this workspace');
      }
      // Update existing pending request
      agent.requestedPermissions = request.requestedPermissions;
      agent.metadata = request.metadata || {};
    } else {
      // Create new access request
      agent = this.agentRepo.create({
        id: request.agentId,
        workspaceId,
        name: request.agentName,
        capabilities: request.capabilities,
        requestedPermissions: request.requestedPermissions,
        metadata: request.metadata || {},
        status: 'pending',
      });
    }

    await this.agentRepo.save(agent);

    this.logger.log(
      `Agent access request: ${request.agentId} -> workspace ${workspaceId}`,
    );

    return agent;
  }

  /**
   * Approve agent access (called from settings UI)
   */
  async approveAccess(
    agentId: string,
    workspaceId: string,
    grantedPermissions: string[],
    approvedBy: string,
  ): Promise<{ agent: ParallaxAgent; mcpApiKey: string }> {
    const agent = await this.agentRepo.findOne({
      where: { id: agentId, workspaceId },
    });

    if (!agent) {
      throw new Error('Agent not found');
    }

    if (agent.status !== 'pending') {
      throw new Error(`Cannot approve agent with status: ${agent.status}`);
    }

    // Create MCP API key for this agent
    const apiKey = await this.apiKeysService.createForAgent({
      workspaceId,
      agentId,
      agentName: agent.name,
      permissions: grantedPermissions,
    });

    // Update agent record
    agent.status = 'approved';
    agent.grantedPermissions = grantedPermissions;
    agent.mcpApiKeyId = apiKey.id;
    agent.resolvedAt = new Date();
    agent.resolvedBy = approvedBy;

    await this.agentRepo.save(agent);

    // Log activity
    await this.logActivity(agent, 'access_approved', {
      approvedBy,
      grantedPermissions,
    });

    // Notify Parallax of approval
    await this.notifyParallax(agentId, workspaceId, 'approved', {
      grantedPermissions,
      mcpApiKey: apiKey.key,  // Send the actual key
    });

    return { agent, mcpApiKey: apiKey.key };
  }

  /**
   * Deny agent access
   */
  async denyAccess(
    agentId: string,
    workspaceId: string,
    reason: string,
    deniedBy: string,
  ): Promise<ParallaxAgent> {
    const agent = await this.agentRepo.findOne({
      where: { id: agentId, workspaceId },
    });

    if (!agent) {
      throw new Error('Agent not found');
    }

    agent.status = 'denied';
    agent.denialReason = reason;
    agent.resolvedAt = new Date();
    agent.resolvedBy = deniedBy;

    await this.agentRepo.save(agent);

    await this.logActivity(agent, 'access_denied', { deniedBy, reason });

    await this.notifyParallax(agentId, workspaceId, 'denied', { reason });

    return agent;
  }

  /**
   * Revoke agent access
   */
  async revokeAccess(
    agentId: string,
    workspaceId: string,
    reason: string,
    revokedBy: string,
  ): Promise<void> {
    const agent = await this.agentRepo.findOne({
      where: { id: agentId, workspaceId },
    });

    if (!agent) {
      throw new Error('Agent not found');
    }

    // Revoke the MCP API key
    if (agent.mcpApiKeyId) {
      await this.apiKeysService.revoke(agent.mcpApiKeyId);
    }

    // Remove all assignments
    await this.assignmentRepo.delete({ agentId, workspaceId });

    // Update status
    agent.status = 'revoked';
    agent.resolvedAt = new Date();
    agent.resolvedBy = revokedBy;

    await this.agentRepo.save(agent);

    await this.logActivity(agent, 'access_revoked', { revokedBy, reason });

    await this.notifyParallax(agentId, workspaceId, 'revoked', { reason });
  }

  /**
   * Assign agent to a project
   */
  async assignToProject(
    agentId: string,
    workspaceId: string,
    projectId: string,
    role: 'member' | 'lead',
    assignedBy: string,
  ): Promise<AgentAssignment> {
    const agent = await this.getApprovedAgent(agentId, workspaceId);

    const assignment = this.assignmentRepo.create({
      agentId,
      workspaceId,
      assignmentType: 'project',
      projectId,
      role,
      assignedBy,
    });

    await this.assignmentRepo.save(assignment);

    await this.logActivity(agent, 'assigned_to_project', {
      projectId,
      role,
      assignedBy,
    });

    // Emit WebSocket event for Parallax to pick up
    this.emitAgentEvent(workspaceId, 'agent.project_assigned', {
      agentId,
      projectId,
      role,
    });

    return assignment;
  }

  /**
   * Assign agent to a task
   */
  async assignToTask(
    agentId: string,
    workspaceId: string,
    taskId: string,
    assignedBy: string,
  ): Promise<AgentAssignment> {
    const agent = await this.getApprovedAgent(agentId, workspaceId);

    const assignment = this.assignmentRepo.create({
      agentId,
      workspaceId,
      assignmentType: 'task',
      taskId,
      assignedBy,
    });

    await this.assignmentRepo.save(assignment);

    await this.logActivity(agent, 'assigned_to_task', {
      taskId,
      assignedBy,
    });

    // Emit WebSocket event
    this.emitAgentEvent(workspaceId, 'agent.task_assigned', {
      agentId,
      taskId,
    });

    return assignment;
  }

  /**
   * Unassign agent
   */
  async unassign(assignmentId: string): Promise<void> {
    const assignment = await this.assignmentRepo.findOne({
      where: { id: assignmentId },
    });

    if (assignment) {
      assignment.unassignedAt = new Date();
      await this.assignmentRepo.save(assignment);

      this.emitAgentEvent(assignment.workspaceId, 'agent.unassigned', {
        agentId: assignment.agentId,
        assignmentType: assignment.assignmentType,
        targetId: assignment.projectId || assignment.taskId,
      });
    }
  }

  /**
   * Get agents available for assignment
   */
  async getAvailableAgents(
    workspaceId: string,
    capabilities?: string[],
  ): Promise<ParallaxAgent[]> {
    let query = this.agentRepo
      .createQueryBuilder('agent')
      .where('agent.workspaceId = :workspaceId', { workspaceId })
      .andWhere('agent.status = :status', { status: 'approved' });

    if (capabilities && capabilities.length > 0) {
      query = query.andWhere('agent.capabilities && :caps', {
        caps: capabilities,
      });
    }

    return query.getMany();
  }

  /**
   * Get agents assigned to a project
   */
  async getProjectAgents(projectId: string): Promise<ParallaxAgent[]> {
    const assignments = await this.assignmentRepo.find({
      where: { projectId, unassignedAt: null },
      relations: ['agent'],
    });

    return assignments.map((a) => a.agent);
  }

  /**
   * Get agent activity log
   */
  async getAgentActivity(
    agentId: string,
    workspaceId: string,
    limit = 50,
  ): Promise<AgentActivity[]> {
    return this.activityRepo.find({
      where: { agentId, workspaceId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Log agent activity
   */
  async logActivity(
    agent: ParallaxAgent,
    type: string,
    metadata: Record<string, any>,
  ): Promise<void> {
    const activity = this.activityRepo.create({
      agentId: agent.id,
      workspaceId: agent.workspaceId,
      activityType: type,
      metadata,
    });

    await this.activityRepo.save(activity);
  }

  /**
   * Notify Parallax control plane
   */
  private async notifyParallax(
    agentId: string,
    workspaceId: string,
    status: string,
    data: Record<string, any>,
  ): Promise<void> {
    const parallaxEndpoint = process.env.PARALLAX_CONTROL_PLANE_URL;
    if (!parallaxEndpoint) {
      this.logger.warn('PARALLAX_CONTROL_PLANE_URL not configured');
      return;
    }

    try {
      await fetch(`${parallaxEndpoint}/api/agents/${agentId}/workspaces/${workspaceId}/${status}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    } catch (error) {
      this.logger.error(`Failed to notify Parallax: ${error.message}`);
    }
  }

  /**
   * Emit WebSocket event
   */
  private emitAgentEvent(
    workspaceId: string,
    type: string,
    data: Record<string, any>,
  ): void {
    // Use existing MCP event system
    this.mcpEventService.emit(workspaceId, {
      type,
      data,
      timestamp: new Date(),
    });
  }

  private async getApprovedAgent(
    agentId: string,
    workspaceId: string,
  ): Promise<ParallaxAgent> {
    const agent = await this.agentRepo.findOne({
      where: { id: agentId, workspaceId, status: 'approved' },
    });

    if (!agent) {
      throw new Error('Agent not found or not approved');
    }

    return agent;
  }
}
```

### 1.3 Agent Controller (REST API)

```typescript
// apps/server/src/core/parallax-agents/parallax-agents.controller.ts

import { Controller, Get, Post, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceGuard } from '../workspace/guards/workspace.guard';
import { ParallaxAgentsService } from './parallax-agents.service';

@Controller('api/parallax-agents')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class ParallaxAgentsController {
  constructor(private readonly agentsService: ParallaxAgentsService) {}

  /**
   * Webhook endpoint for Parallax to request access
   * (Also called via Parallax control plane)
   */
  @Post('access-request')
  async handleAccessRequest(
    @Body() body: {
      workspaceId: string;
      agentId: string;
      agentName: string;
      capabilities: string[];
      requestedPermissions: string[];
      metadata?: Record<string, any>;
      justification?: string;
    },
  ) {
    return this.agentsService.handleAccessRequest(body.workspaceId, {
      agentId: body.agentId,
      agentName: body.agentName,
      capabilities: body.capabilities,
      requestedPermissions: body.requestedPermissions,
      metadata: body.metadata,
      justification: body.justification,
    });
  }

  /**
   * Get pending access requests for a workspace
   */
  @Get('pending')
  async getPendingRequests(@Query('workspaceId') workspaceId: string) {
    return this.agentsService.getPendingRequests(workspaceId);
  }

  /**
   * Get all agents in a workspace
   */
  @Get()
  async getWorkspaceAgents(
    @Query('workspaceId') workspaceId: string,
    @Query('status') status?: string,
    @Query('capabilities') capabilities?: string,
  ) {
    return this.agentsService.getWorkspaceAgents(
      workspaceId,
      status,
      capabilities?.split(','),
    );
  }

  /**
   * Get single agent details
   */
  @Get(':agentId')
  async getAgent(
    @Param('agentId') agentId: string,
    @Query('workspaceId') workspaceId: string,
  ) {
    return this.agentsService.getAgent(agentId, workspaceId);
  }

  /**
   * Approve agent access
   */
  @Post(':agentId/approve')
  async approveAccess(
    @Param('agentId') agentId: string,
    @Body() body: {
      workspaceId: string;
      grantedPermissions: string[];
      approvedBy: string;
    },
  ) {
    return this.agentsService.approveAccess(
      agentId,
      body.workspaceId,
      body.grantedPermissions,
      body.approvedBy,
    );
  }

  /**
   * Deny agent access
   */
  @Post(':agentId/deny')
  async denyAccess(
    @Param('agentId') agentId: string,
    @Body() body: {
      workspaceId: string;
      reason: string;
      deniedBy: string;
    },
  ) {
    return this.agentsService.denyAccess(
      agentId,
      body.workspaceId,
      body.reason,
      body.deniedBy,
    );
  }

  /**
   * Revoke agent access
   */
  @Post(':agentId/revoke')
  async revokeAccess(
    @Param('agentId') agentId: string,
    @Body() body: {
      workspaceId: string;
      reason: string;
      revokedBy: string;
    },
  ) {
    return this.agentsService.revokeAccess(
      agentId,
      body.workspaceId,
      body.reason,
      body.revokedBy,
    );
  }

  /**
   * Update agent permissions
   */
  @Post(':agentId/permissions')
  async updatePermissions(
    @Param('agentId') agentId: string,
    @Body() body: {
      workspaceId: string;
      permissions: string[];
      updatedBy: string;
    },
  ) {
    return this.agentsService.updatePermissions(
      agentId,
      body.workspaceId,
      body.permissions,
      body.updatedBy,
    );
  }

  /**
   * Assign agent to project
   */
  @Post(':agentId/assign/project')
  async assignToProject(
    @Param('agentId') agentId: string,
    @Body() body: {
      workspaceId: string;
      projectId: string;
      role: 'member' | 'lead';
      assignedBy: string;
    },
  ) {
    return this.agentsService.assignToProject(
      agentId,
      body.workspaceId,
      body.projectId,
      body.role,
      body.assignedBy,
    );
  }

  /**
   * Assign agent to task
   */
  @Post(':agentId/assign/task')
  async assignToTask(
    @Param('agentId') agentId: string,
    @Body() body: {
      workspaceId: string;
      taskId: string;
      assignedBy: string;
    },
  ) {
    return this.agentsService.assignToTask(
      agentId,
      body.workspaceId,
      body.taskId,
      body.assignedBy,
    );
  }

  /**
   * Unassign agent
   */
  @Delete('assignments/:assignmentId')
  async unassign(@Param('assignmentId') assignmentId: string) {
    return this.agentsService.unassign(assignmentId);
  }

  /**
   * Get agent activity log
   */
  @Get(':agentId/activity')
  async getActivity(
    @Param('agentId') agentId: string,
    @Query('workspaceId') workspaceId: string,
    @Query('limit') limit?: number,
  ) {
    return this.agentsService.getAgentActivity(
      agentId,
      workspaceId,
      limit || 50,
    );
  }

  /**
   * Get available agents with specific capabilities
   */
  @Get('available')
  async getAvailableAgents(
    @Query('workspaceId') workspaceId: string,
    @Query('capabilities') capabilities?: string,
  ) {
    return this.agentsService.getAvailableAgents(
      workspaceId,
      capabilities?.split(','),
    );
  }
}
```

---

## Part 2: UI Components

### 2.1 Agent Settings Page

```typescript
// apps/client/src/features/workspace/pages/AgentSettings.tsx

import React from 'react';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useQuery, useMutation } from '@tanstack/react-query';
import { agentsApi } from '@/api/agents';
import {
  AgentRequestCard,
  AgentCard,
  PermissionsEditor,
  CapabilitiesBadges,
} from '../components/agents';

export function AgentSettings() {
  const { workspaceId } = useWorkspace();

  const { data: pendingRequests } = useQuery({
    queryKey: ['agents', 'pending', workspaceId],
    queryFn: () => agentsApi.getPending(workspaceId),
  });

  const { data: activeAgents } = useQuery({
    queryKey: ['agents', 'active', workspaceId],
    queryFn: () => agentsApi.getActive(workspaceId),
  });

  const approveMutation = useMutation({
    mutationFn: agentsApi.approve,
    onSuccess: () => {
      queryClient.invalidateQueries(['agents']);
    },
  });

  const denyMutation = useMutation({
    mutationFn: agentsApi.deny,
  });

  const revokeMutation = useMutation({
    mutationFn: agentsApi.revoke,
  });

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold mb-4">Agent Settings</h2>
        <p className="text-gray-600">
          Manage Parallax agents that can work in this workspace.
        </p>
      </div>

      {/* Pending Requests */}
      {pendingRequests && pendingRequests.length > 0 && (
        <section>
          <h3 className="text-lg font-medium mb-3">
            Pending Requests ({pendingRequests.length})
          </h3>
          <div className="space-y-4">
            {pendingRequests.map((agent) => (
              <AgentRequestCard
                key={agent.id}
                agent={agent}
                onApprove={(permissions) =>
                  approveMutation.mutate({
                    agentId: agent.id,
                    workspaceId,
                    grantedPermissions: permissions,
                  })
                }
                onDeny={(reason) =>
                  denyMutation.mutate({
                    agentId: agent.id,
                    workspaceId,
                    reason,
                  })
                }
              />
            ))}
          </div>
        </section>
      )}

      {/* Active Agents */}
      <section>
        <h3 className="text-lg font-medium mb-3">
          Active Agents ({activeAgents?.length || 0})
        </h3>
        {activeAgents && activeAgents.length > 0 ? (
          <div className="space-y-4">
            {activeAgents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                onEditPermissions={(permissions) =>
                  updatePermissionsMutation.mutate({
                    agentId: agent.id,
                    workspaceId,
                    permissions,
                  })
                }
                onRevoke={(reason) =>
                  revokeMutation.mutate({
                    agentId: agent.id,
                    workspaceId,
                    reason,
                  })
                }
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 bg-gray-50 rounded-lg">
            <p className="text-gray-500">No active agents</p>
            <p className="text-sm text-gray-400 mt-1">
              Agents will appear here when they request access to this workspace
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
```

### 2.2 Agent Request Card Component

```typescript
// apps/client/src/features/workspace/components/agents/AgentRequestCard.tsx

import React, { useState } from 'react';
import { ParallaxAgent, PERMISSIONS } from '@/types/agents';
import { Button, Checkbox, Badge, Card } from '@/components/ui';

interface AgentRequestCardProps {
  agent: ParallaxAgent;
  onApprove: (permissions: string[]) => void;
  onDeny: (reason: string) => void;
}

export function AgentRequestCard({ agent, onApprove, onDeny }: AgentRequestCardProps) {
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>(
    agent.requestedPermissions
  );
  const [denyReason, setDenyReason] = useState('');
  const [showDenyDialog, setShowDenyDialog] = useState(false);

  const togglePermission = (permission: string) => {
    setSelectedPermissions((prev) =>
      prev.includes(permission)
        ? prev.filter((p) => p !== permission)
        : [...prev, permission]
    );
  };

  return (
    <Card className="p-4 border-l-4 border-l-yellow-400">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg">🤖</span>
            <h4 className="font-medium">{agent.name}</h4>
            <Badge variant="warning">Pending</Badge>
          </div>

          {agent.metadata?.description && (
            <p className="text-sm text-gray-600 mt-1">
              {agent.metadata.description}
            </p>
          )}

          <div className="flex flex-wrap gap-1 mt-2">
            {agent.capabilities.map((cap) => (
              <Badge key={cap} variant="outline" size="sm">
                {cap}
              </Badge>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDenyDialog(true)}
          >
            Deny
          </Button>
          <Button
            size="sm"
            onClick={() => onApprove(selectedPermissions)}
            disabled={selectedPermissions.length === 0}
          >
            Approve
          </Button>
        </div>
      </div>

      {/* Permissions Selection */}
      <div className="mt-4 pt-4 border-t">
        <h5 className="text-sm font-medium mb-2">
          Requested Permissions (select which to grant):
        </h5>
        <div className="grid grid-cols-2 gap-2">
          {agent.requestedPermissions.map((permission) => (
            <label
              key={permission}
              className="flex items-center gap-2 text-sm"
            >
              <Checkbox
                checked={selectedPermissions.includes(permission)}
                onCheckedChange={() => togglePermission(permission)}
              />
              <span>{permission}</span>
              <span className="text-gray-400 text-xs">
                {PERMISSIONS[permission]}
              </span>
            </label>
          ))}
        </div>
      </div>

      {agent.metadata?.justification && (
        <div className="mt-3 p-2 bg-gray-50 rounded text-sm">
          <span className="font-medium">Justification: </span>
          {agent.metadata.justification}
        </div>
      )}

      {/* Deny Dialog */}
      {showDenyDialog && (
        <DenyDialog
          onConfirm={(reason) => {
            onDeny(reason);
            setShowDenyDialog(false);
          }}
          onCancel={() => setShowDenyDialog(false)}
        />
      )}
    </Card>
  );
}
```

### 2.3 Agent Assignment in Task Drawer

```typescript
// apps/client/src/features/task/components/TaskAssigneeSection.tsx

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { agentsApi, usersApi } from '@/api';
import { Avatar, Select, Badge } from '@/components/ui';

interface TaskAssigneeSectionProps {
  taskId: string;
  workspaceId: string;
  currentAssignees: Array<{ id: string; type: 'user' | 'agent' }>;
  requiredCapabilities?: string[];
  onAssigneeChange: (assignees: Array<{ id: string; type: 'user' | 'agent' }>) => void;
}

export function TaskAssigneeSection({
  taskId,
  workspaceId,
  currentAssignees,
  requiredCapabilities,
  onAssigneeChange,
}: TaskAssigneeSectionProps) {
  const { data: users } = useQuery({
    queryKey: ['users', workspaceId],
    queryFn: () => usersApi.getWorkspaceUsers(workspaceId),
  });

  const { data: agents } = useQuery({
    queryKey: ['agents', 'available', workspaceId, requiredCapabilities],
    queryFn: () =>
      agentsApi.getAvailable(workspaceId, requiredCapabilities),
  });

  const assigneeOptions = [
    ...(users || []).map((u) => ({
      value: `user:${u.id}`,
      label: u.name,
      type: 'user' as const,
      avatar: u.avatarUrl,
    })),
    ...(agents || []).map((a) => ({
      value: `agent:${a.id}`,
      label: `🤖 ${a.name}`,
      type: 'agent' as const,
      capabilities: a.capabilities,
    })),
  ];

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Assignees</label>

      <Select
        isMulti
        options={assigneeOptions}
        value={currentAssignees.map((a) => `${a.type}:${a.id}`)}
        onChange={(values) => {
          const assignees = values.map((v) => {
            const [type, id] = v.split(':');
            return { id, type: type as 'user' | 'agent' };
          });
          onAssigneeChange(assignees);
        }}
        formatOptionLabel={(option) => (
          <div className="flex items-center gap-2">
            {option.type === 'user' ? (
              <Avatar src={option.avatar} size="sm" />
            ) : (
              <span>🤖</span>
            )}
            <span>{option.label}</span>
            {option.type === 'agent' && option.capabilities && (
              <div className="flex gap-1 ml-2">
                {option.capabilities.slice(0, 2).map((cap) => (
                  <Badge key={cap} variant="outline" size="xs">
                    {cap}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}
      />

      {requiredCapabilities && requiredCapabilities.length > 0 && (
        <p className="text-xs text-gray-500">
          Showing agents with: {requiredCapabilities.join(', ')}
        </p>
      )}
    </div>
  );
}
```

### 2.4 Agent Activity Panel

```typescript
// apps/client/src/features/workspace/components/agents/AgentActivityPanel.tsx

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { agentsApi } from '@/api/agents';
import { formatDistanceToNow } from 'date-fns';
import { Badge, Timeline } from '@/components/ui';

interface AgentActivityPanelProps {
  agentId: string;
  workspaceId: string;
}

export function AgentActivityPanel({ agentId, workspaceId }: AgentActivityPanelProps) {
  const { data: activity } = useQuery({
    queryKey: ['agent-activity', agentId, workspaceId],
    queryFn: () => agentsApi.getActivity(agentId, workspaceId),
    refetchInterval: 30000, // Refresh every 30s
  });

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'task_started':
        return '▶️';
      case 'task_completed':
        return '✅';
      case 'page_created':
        return '📄';
      case 'page_updated':
        return '✏️';
      case 'error':
        return '❌';
      default:
        return '📌';
    }
  };

  return (
    <div className="space-y-4">
      <h4 className="font-medium">Recent Activity</h4>

      {activity && activity.length > 0 ? (
        <Timeline>
          {activity.map((item) => (
            <Timeline.Item key={item.id}>
              <div className="flex items-start gap-2">
                <span>{getActivityIcon(item.activityType)}</span>
                <div className="flex-1">
                  <p className="text-sm">{item.description}</p>
                  <p className="text-xs text-gray-400">
                    {formatDistanceToNow(new Date(item.createdAt), {
                      addSuffix: true,
                    })}
                  </p>
                </div>
              </div>
            </Timeline.Item>
          ))}
        </Timeline>
      ) : (
        <p className="text-sm text-gray-500">No activity yet</p>
      )}
    </div>
  );
}
```

---

## Part 3: MCP Extensions

### 3.1 Agent-Specific MCP Tools

Add these tools to the existing MCP Standard implementation:

```typescript
// apps/server/src/integrations/mcp-standard/tools/agent-tools.ts

export const agentTools = {
  /**
   * Get current agent's assignments
   */
  agent_my_assignments: {
    description: 'Get tasks and projects assigned to the current agent',
    parameters: {
      status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] },
    },
    handler: async (args, context) => {
      const agentId = context.agentId; // From MCP API key
      return context.agentsService.getAgentAssignments(agentId, args.status);
    },
  },

  /**
   * Update agent status
   */
  agent_update_status: {
    description: 'Update the agent\'s current status',
    parameters: {
      status: { type: 'string', enum: ['idle', 'working', 'error'], required: true },
      currentTask: { type: 'string' },
      message: { type: 'string' },
    },
    handler: async (args, context) => {
      const agentId = context.agentId;
      return context.agentsService.updateAgentStatus(agentId, args);
    },
  },

  /**
   * Log agent activity
   */
  agent_log_activity: {
    description: 'Log an activity or event for audit purposes',
    parameters: {
      activityType: { type: 'string', required: true },
      description: { type: 'string', required: true },
      relatedTaskId: { type: 'string' },
      relatedPageId: { type: 'string' },
      metadata: { type: 'object' },
    },
    handler: async (args, context) => {
      const agentId = context.agentId;
      return context.agentsService.logActivity(agentId, context.workspaceId, args);
    },
  },

  /**
   * Get workspace agents
   */
  agent_list_workspace: {
    description: 'List other agents in the workspace',
    parameters: {
      capabilities: { type: 'array', items: { type: 'string' } },
      status: { type: 'string', enum: ['idle', 'working'] },
    },
    handler: async (args, context) => {
      return context.agentsService.getAvailableAgents(
        context.workspaceId,
        args.capabilities,
        args.status,
      );
    },
  },

  /**
   * Request task assignment to another agent
   */
  agent_delegate_task: {
    description: 'Request to delegate a task to another agent',
    parameters: {
      taskId: { type: 'string', required: true },
      targetAgentId: { type: 'string', required: true },
      reason: { type: 'string' },
    },
    requiresApproval: true,
    handler: async (args, context) => {
      return context.agentsService.requestDelegation(
        context.agentId,
        args.targetAgentId,
        args.taskId,
        args.reason,
      );
    },
  },
};
```

### 3.2 Extend API Keys for Agents

```typescript
// apps/server/src/core/api-keys/api-keys.service.ts (additions)

/**
 * Create API key specifically for a Parallax agent
 */
async createForAgent(params: {
  workspaceId: string;
  agentId: string;
  agentName: string;
  permissions: string[];
}): Promise<ApiKey> {
  const key = this.generateApiKey('mcp_agent_');

  const apiKey = this.apiKeyRepo.create({
    workspaceId: params.workspaceId,
    keyHash: await this.hashKey(key),
    keyPrefix: key.substring(0, 12),
    name: `Agent: ${params.agentName}`,
    type: 'agent',
    metadata: {
      agentId: params.agentId,
      agentName: params.agentName,
      permissions: params.permissions,
    },
  });

  await this.apiKeyRepo.save(apiKey);

  return {
    ...apiKey,
    key, // Return actual key only on creation
  };
}

/**
 * Get agent ID from API key context
 */
async getAgentFromKey(keyId: string): Promise<string | null> {
  const apiKey = await this.apiKeyRepo.findOne({ where: { id: keyId } });
  return apiKey?.metadata?.agentId || null;
}
```

---

## Part 4: WebSocket Events for Agents

### 4.1 Agent Event Types

```typescript
// apps/server/src/integrations/mcp/types/agent-events.ts

export interface AgentEvent {
  type: AgentEventType;
  workspaceId: string;
  agentId?: string;
  timestamp: Date;
  data: any;
}

export type AgentEventType =
  // Agent lifecycle
  | 'agent.access_requested'
  | 'agent.access_approved'
  | 'agent.access_denied'
  | 'agent.access_revoked'
  | 'agent.status_changed'

  // Assignments
  | 'agent.project_assigned'
  | 'agent.task_assigned'
  | 'agent.unassigned'

  // Activity
  | 'agent.task_started'
  | 'agent.task_completed'
  | 'agent.task_failed'
  | 'agent.page_created'
  | 'agent.page_updated'
  | 'agent.error';
```

### 4.2 WebSocket Gateway Extensions

```typescript
// apps/server/src/integrations/mcp/mcp-websocket.gateway.ts (additions)

@SubscribeMessage('agent:subscribe')
async handleAgentSubscribe(
  @ConnectedSocket() client: Socket,
  @MessageBody() data: { agentId: string; eventTypes?: string[] },
) {
  const room = `agent:${data.agentId}`;
  await client.join(room);

  this.logger.log(`Client subscribed to agent events: ${data.agentId}`);

  return { subscribed: true, room };
}

@SubscribeMessage('agent:unsubscribe')
async handleAgentUnsubscribe(
  @ConnectedSocket() client: Socket,
  @MessageBody() data: { agentId: string },
) {
  const room = `agent:${data.agentId}`;
  await client.leave(room);

  return { unsubscribed: true };
}

// Emit agent events
emitAgentEvent(event: AgentEvent) {
  // Emit to workspace room
  this.server.to(`workspace:${event.workspaceId}`).emit('agent:event', event);

  // Also emit to agent-specific room if applicable
  if (event.agentId) {
    this.server.to(`agent:${event.agentId}`).emit('agent:event', event);
  }
}
```

---

## Part 5: Configuration

### 5.1 Environment Variables

```bash
# .env additions

# Parallax Integration
PARALLAX_CONTROL_PLANE_URL=http://localhost:8080
PARALLAX_WEBHOOK_SECRET=your-webhook-secret

# Agent Settings
PARALLAX_MAX_AGENTS_PER_WORKSPACE=20
PARALLAX_AGENT_KEY_PREFIX=mcp_agent_
```

### 5.2 Workspace Settings Schema

```typescript
// apps/server/src/core/workspace/types/workspace-settings.ts (additions)

export interface ParallaxSettings {
  enabled: boolean;
  controlPlaneUrl?: string;

  // Auto-approval rules
  autoApproveCapabilities?: string[];  // Auto-approve agents with these caps
  autoApprovePermissions?: string[];   // Permissions to auto-grant

  // Limits
  maxAgents: number;
  maxAgentsPerProject: number;

  // Default permissions for new agents
  defaultPermissions: string[];
}
```

---

## Implementation Phases

### Phase 1: Database & Core Service (Week 1)
- [ ] Database migrations for agent tables
- [ ] ParallaxAgentsService implementation
- [ ] Basic REST API endpoints
- [ ] API key extensions for agents

### Phase 2: UI Components (Week 2)
- [ ] Agent Settings page in workspace settings
- [ ] Agent request approval flow
- [ ] Agent assignment in task/project UI
- [ ] Agent activity panel

### Phase 3: MCP Extensions (Week 2-3)
- [ ] Agent-specific MCP tools
- [ ] Permission checking in MCP handlers
- [ ] Agent context in MCP requests

### Phase 4: WebSocket Events (Week 3)
- [ ] Agent event types
- [ ] WebSocket subscription for agents
- [ ] Real-time activity updates

### Phase 5: Testing & Integration (Week 4)
- [ ] Integration tests with Parallax
- [ ] E2E tests for approval flow
- [ ] Load testing with multiple agents
- [ ] Documentation

---

## Security Considerations

1. **API Key Scoping**: Agent API keys are scoped to specific permissions, not full access
2. **Approval Required**: All agent access requires human approval
3. **Activity Logging**: All agent actions are logged for audit
4. **Permission Enforcement**: MCP handlers check permissions before executing
5. **Rate Limiting**: Agent requests are rate-limited separately from user requests
6. **Revocation**: Instant revocation of agent access when needed
