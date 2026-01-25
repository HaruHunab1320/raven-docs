# Parallax Integration - Implementation Plan

## Overview

This document outlines the concrete implementation strategy for integrating Parallax multi-agent orchestration with Raven Docs, based on the architecture defined in `ParallaxIntegration.md` and the existing codebase patterns.

## Current Architecture Summary

| Component | Technology | Location |
|-----------|------------|----------|
| Database | Kysely + PostgreSQL | `src/database/` |
| Services | NestJS @Injectable | `src/core/*/services/` |
| MCP Handlers | Resource-based routing | `src/integrations/mcp/handlers/` |
| WebSocket | Socket.io + Redis | `src/integrations/mcp/mcp-websocket.gateway.ts` |
| API Keys | SHA256 + mcp_ prefix | `src/integrations/mcp/services/mcp-api-key.service.ts` |

---

## Phase 1: Database & Core Infrastructure

### 1.1 Database Migration

**File**: `apps/server/src/database/migrations/YYYYMMDDTHHMMSS-add_parallax_agents.ts`

```typescript
import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Table 1: Parallax Agents
  await db.schema
    .createTable('parallax_agents')
    .addColumn('id', 'varchar', (col) => col.primaryKey()) // Matches Parallax agent ID
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('name', 'varchar', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('capabilities', sql`text[]`, (col) => col.notNull())
    .addColumn('status', 'varchar', (col) => col.defaultTo('pending').notNull())
    .addColumn('requested_permissions', sql`text[]`, (col) => col.notNull())
    .addColumn('granted_permissions', sql`text[]`, (col) => col.defaultTo(sql`'{}'::text[]`))
    .addColumn('mcp_api_key_id', 'varchar', (col) =>
      col.references('mcp_api_keys.id').onDelete('set null'),
    )
    .addColumn('metadata', 'jsonb', (col) => col.defaultTo(sql`'{}'::jsonb`))
    .addColumn('endpoint', 'varchar')
    .addColumn('requested_at', 'timestamptz', (col) => col.defaultTo(sql`now()`))
    .addColumn('resolved_at', 'timestamptz')
    .addColumn('resolved_by', 'uuid', (col) => col.references('users.id'))
    .addColumn('denial_reason', 'text')
    .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.defaultTo(sql`now()`))
    .execute();

  // Table 2: Agent Assignments
  await db.schema
    .createTable('parallax_agent_assignments')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_uuid_v7()`))
    .addColumn('agent_id', 'varchar', (col) =>
      col.notNull().references('parallax_agents.id').onDelete('cascade'),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('assignment_type', 'varchar', (col) => col.notNull())
    .addColumn('project_id', 'uuid', (col) =>
      col.references('projects.id').onDelete('cascade'),
    )
    .addColumn('task_id', 'uuid', (col) =>
      col.references('tasks.id').onDelete('cascade'),
    )
    .addColumn('role', 'varchar', (col) => col.defaultTo('member'))
    .addColumn('assigned_at', 'timestamptz', (col) => col.defaultTo(sql`now()`))
    .addColumn('assigned_by', 'uuid', (col) => col.references('users.id'))
    .addColumn('unassigned_at', 'timestamptz')
    .execute();

  // Table 3: Agent Activity Log
  await db.schema
    .createTable('parallax_agent_activity')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_uuid_v7()`))
    .addColumn('agent_id', 'varchar', (col) =>
      col.references('parallax_agents.id').onDelete('cascade'),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('activity_type', 'varchar', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('metadata', 'jsonb', (col) => col.defaultTo(sql`'{}'::jsonb`))
    .addColumn('project_id', 'uuid', (col) => col.references('projects.id'))
    .addColumn('task_id', 'uuid', (col) => col.references('tasks.id'))
    .addColumn('page_id', 'uuid', (col) => col.references('pages.id'))
    .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`now()`))
    .execute();

  // Indexes
  await db.schema.createIndex('idx_parallax_agents_workspace').on('parallax_agents').column('workspace_id').execute();
  await db.schema.createIndex('idx_parallax_agents_status').on('parallax_agents').column('status').execute();
  await db.schema.createIndex('idx_parallax_assignments_agent').on('parallax_agent_assignments').column('agent_id').execute();
  await db.schema.createIndex('idx_parallax_assignments_project').on('parallax_agent_assignments').column('project_id').execute();
  await db.schema.createIndex('idx_parallax_assignments_task').on('parallax_agent_assignments').column('task_id').execute();
  await db.schema.createIndex('idx_parallax_activity_agent').on('parallax_agent_activity').column('agent_id').execute();
  await db.schema.createIndex('idx_parallax_activity_created').on('parallax_agent_activity').column('created_at').execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('parallax_agent_activity').execute();
  await db.schema.dropTable('parallax_agent_assignments').execute();
  await db.schema.dropTable('parallax_agents').execute();
}
```

### 1.2 Database Types

**File**: `apps/server/src/database/types/parallax.types.ts`

```typescript
import { Generated, Insertable, Selectable, Updateable } from 'kysely';

export interface ParallaxAgentTable {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  capabilities: string[];
  status: 'pending' | 'approved' | 'denied' | 'revoked';
  requestedPermissions: string[];
  grantedPermissions: string[];
  mcpApiKeyId: string | null;
  metadata: Record<string, any>;
  endpoint: string | null;
  requestedAt: Generated<Date>;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  denialReason: string | null;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface ParallaxAgentAssignmentTable {
  id: Generated<string>;
  agentId: string;
  workspaceId: string;
  assignmentType: 'project' | 'task';
  projectId: string | null;
  taskId: string | null;
  role: 'member' | 'lead';
  assignedAt: Generated<Date>;
  assignedBy: string | null;
  unassignedAt: Date | null;
}

export interface ParallaxAgentActivityTable {
  id: Generated<string>;
  agentId: string;
  workspaceId: string;
  activityType: string;
  description: string | null;
  metadata: Record<string, any>;
  projectId: string | null;
  taskId: string | null;
  pageId: string | null;
  createdAt: Generated<Date>;
}

export type ParallaxAgent = Selectable<ParallaxAgentTable>;
export type InsertableParallaxAgent = Insertable<ParallaxAgentTable>;
export type UpdateableParallaxAgent = Updateable<ParallaxAgentTable>;

export type ParallaxAgentAssignment = Selectable<ParallaxAgentAssignmentTable>;
export type ParallaxAgentActivity = Selectable<ParallaxAgentActivityTable>;
```

### 1.3 Repository Layer

**Files to create**:
- `apps/server/src/database/repos/parallax-agent/parallax-agent.repo.ts`
- `apps/server/src/database/repos/parallax-agent/parallax-agent-assignment.repo.ts`
- `apps/server/src/database/repos/parallax-agent/parallax-agent-activity.repo.ts`

---

## Phase 2: Service Layer

### 2.1 Module Structure

```
apps/server/src/core/parallax-agents/
├── parallax-agents.module.ts
├── parallax-agents.service.ts
├── parallax-agents.controller.ts
├── dto/
│   ├── access-request.dto.ts
│   ├── approve-agent.dto.ts
│   ├── assign-agent.dto.ts
│   └── update-permissions.dto.ts
├── interfaces/
│   └── parallax-agent.interface.ts
└── constants/
    └── permissions.constants.ts
```

### 2.2 Service Implementation

Key methods to implement (following existing patterns):

```typescript
@Injectable()
export class ParallaxAgentsService {
  constructor(
    private readonly parallaxAgentRepo: ParallaxAgentRepo,
    private readonly assignmentRepo: ParallaxAgentAssignmentRepo,
    private readonly activityRepo: ParallaxAgentActivityRepo,
    private readonly mcpApiKeyService: MCPApiKeyService,
    private readonly mcpEventService: MCPEventService,
    @InjectKysely() private readonly db: KyselyDB,
  ) {}

  // Access Management
  async handleAccessRequest(workspaceId: string, request: AgentAccessRequest): Promise<ParallaxAgent>;
  async approveAccess(agentId: string, workspaceId: string, params: ApproveParams): Promise<ApprovalResult>;
  async denyAccess(agentId: string, workspaceId: string, reason: string, deniedBy: string): Promise<ParallaxAgent>;
  async revokeAccess(agentId: string, workspaceId: string, reason: string, revokedBy: string): Promise<void>;
  async updatePermissions(agentId: string, workspaceId: string, permissions: string[]): Promise<ParallaxAgent>;

  // Assignments
  async assignToProject(agentId: string, workspaceId: string, projectId: string, role: string, assignedBy: string): Promise<ParallaxAgentAssignment>;
  async assignToTask(agentId: string, workspaceId: string, taskId: string, assignedBy: string): Promise<ParallaxAgentAssignment>;
  async unassign(assignmentId: string): Promise<void>;

  // Queries
  async getAgent(agentId: string, workspaceId: string): Promise<ParallaxAgent | null>;
  async getPendingRequests(workspaceId: string): Promise<ParallaxAgent[]>;
  async getWorkspaceAgents(workspaceId: string, status?: string, capabilities?: string[]): Promise<ParallaxAgent[]>;
  async getAvailableAgents(workspaceId: string, capabilities?: string[]): Promise<ParallaxAgent[]>;
  async getProjectAgents(projectId: string): Promise<ParallaxAgent[]>;
  async getAgentAssignments(agentId: string, status?: string): Promise<ParallaxAgentAssignment[]>;

  // Activity
  async logActivity(agent: ParallaxAgent, type: string, metadata: Record<string, any>): Promise<void>;
  async getAgentActivity(agentId: string, workspaceId: string, limit?: number): Promise<ParallaxAgentActivity[]>;

  // Parallax Communication
  private async notifyParallax(agentId: string, workspaceId: string, status: string, data: any): Promise<void>;
}
```

---

## Phase 3: MCP Extensions

### 3.1 New MCP Handler

**File**: `apps/server/src/integrations/mcp/handlers/parallax-agent.handler.ts`

```typescript
@Injectable()
export class ParallaxAgentHandler {
  constructor(
    private readonly parallaxAgentsService: ParallaxAgentsService,
  ) {}

  // Tool: agent_my_assignments
  async getMyAssignments(params: any, context: MCPContext): Promise<any>;

  // Tool: agent_update_status
  async updateStatus(params: any, context: MCPContext): Promise<any>;

  // Tool: agent_log_activity
  async logActivity(params: any, context: MCPContext): Promise<any>;

  // Tool: agent_list_workspace
  async listWorkspaceAgents(params: any, context: MCPContext): Promise<any>;

  // Tool: agent_delegate_task (requires approval)
  async delegateTask(params: any, context: MCPContext): Promise<any>;
}
```

### 3.2 Tool Registration

Add to `mcp-schema.service.ts` or create new tool definitions:

```typescript
export const parallaxAgentTools = [
  {
    name: 'agent_my_assignments',
    description: 'Get tasks and projects assigned to the current agent',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] },
      },
    },
  },
  {
    name: 'agent_update_status',
    description: "Update the agent's current working status",
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['idle', 'working', 'error'] },
        currentTask: { type: 'string' },
        message: { type: 'string' },
      },
      required: ['status'],
    },
  },
  // ... more tools
];
```

### 3.3 API Key Extension

Extend `MCPApiKeyService` to support agent-specific keys:

```typescript
async createForAgent(params: {
  workspaceId: string;
  agentId: string;
  agentName: string;
  permissions: string[];
}): Promise<{ id: string; key: string }> {
  const apiKey = `mcp_agent_${randomBytes(32).toString('hex')}`;
  const hashedKey = this.hashApiKey(apiKey);

  const result = await this.mcpApiKeyRepo.createApiKey({
    userId: null, // Agent keys don't have a user
    workspaceId: params.workspaceId,
    name: `Agent: ${params.agentName}`,
    hashedKey,
    metadata: {
      type: 'agent',
      agentId: params.agentId,
      agentName: params.agentName,
      permissions: params.permissions,
    },
  });

  return { id: result.id, key: apiKey };
}

async getAgentFromKey(hashedKey: string): Promise<string | null> {
  const apiKey = await this.mcpApiKeyRepo.getApiKeyByHashedKey(hashedKey);
  return apiKey?.metadata?.agentId || null;
}
```

---

## Phase 4: WebSocket Events

### 4.1 Event Types

**File**: `apps/server/src/integrations/mcp/interfaces/parallax-events.ts`

```typescript
export enum ParallaxEventType {
  // Access lifecycle
  ACCESS_REQUESTED = 'agent.access_requested',
  ACCESS_APPROVED = 'agent.access_approved',
  ACCESS_DENIED = 'agent.access_denied',
  ACCESS_REVOKED = 'agent.access_revoked',
  STATUS_CHANGED = 'agent.status_changed',

  // Assignments
  PROJECT_ASSIGNED = 'agent.project_assigned',
  TASK_ASSIGNED = 'agent.task_assigned',
  UNASSIGNED = 'agent.unassigned',

  // Activity
  TASK_STARTED = 'agent.task_started',
  TASK_COMPLETED = 'agent.task_completed',
  TASK_FAILED = 'agent.task_failed',
  PAGE_CREATED = 'agent.page_created',
  PAGE_UPDATED = 'agent.page_updated',
  ERROR = 'agent.error',
}

export interface ParallaxEvent {
  type: ParallaxEventType;
  workspaceId: string;
  agentId?: string;
  timestamp: Date;
  data: Record<string, any>;
}
```

### 4.2 Gateway Extensions

Add to `MCPWebSocketGateway`:

```typescript
@SubscribeMessage('agent:subscribe')
async handleAgentSubscribe(
  @ConnectedSocket() client: Socket,
  @MessageBody() data: { agentId: string; eventTypes?: string[] },
): Promise<{ subscribed: boolean; room: string }> {
  const room = `agent:${data.agentId}`;
  await client.join(room);
  return { subscribed: true, room };
}

@SubscribeMessage('agent:unsubscribe')
async handleAgentUnsubscribe(
  @ConnectedSocket() client: Socket,
  @MessageBody() data: { agentId: string },
): Promise<{ unsubscribed: boolean }> {
  const room = `agent:${data.agentId}`;
  await client.leave(room);
  return { unsubscribed: true };
}

emitParallaxEvent(event: ParallaxEvent): void {
  // Emit to workspace room
  this.server.to(`workspace:${event.workspaceId}`).emit('agent:event', event);

  // Also emit to agent-specific room if applicable
  if (event.agentId) {
    this.server.to(`agent:${event.agentId}`).emit('agent:event', event);
  }
}
```

---

## Phase 5: Frontend Components

### 5.1 Files to Create

```
apps/client/src/features/parallax-agents/
├── api/
│   └── parallax-agents-api.ts
├── components/
│   ├── agent-request-card.tsx
│   ├── agent-card.tsx
│   ├── agent-activity-panel.tsx
│   ├── agent-permissions-editor.tsx
│   └── agent-assignee-picker.tsx
├── hooks/
│   ├── use-parallax-agents.ts
│   └── use-agent-activity.ts
├── pages/
│   └── agent-settings-page.tsx
└── types/
    └── parallax-agent.types.ts
```

### 5.2 Integration Points

1. **Workspace Settings** - Add "Agents" tab
2. **Task Drawer** - Extend assignee picker to include agents
3. **Project Settings** - Add agent assignment section
4. **Notifications** - Show agent access requests

---

## Phase 6: Configuration

### 6.1 Environment Variables

```bash
# .env additions
PARALLAX_CONTROL_PLANE_URL=http://localhost:8080
PARALLAX_WEBHOOK_SECRET=your-webhook-secret
PARALLAX_MAX_AGENTS_PER_WORKSPACE=20
```

### 6.2 Workspace Settings Extension

Add to workspace settings schema:

```typescript
interface ParallaxSettings {
  enabled: boolean;
  controlPlaneUrl?: string;
  autoApproveCapabilities?: string[];
  autoApprovePermissions?: string[];
  maxAgents: number;
  maxAgentsPerProject: number;
  defaultPermissions: string[];
}
```

---

## Implementation Order

### Week 1: Foundation
- [ ] Create database migration
- [ ] Add database types to schema
- [ ] Implement repository classes
- [ ] Register repos in DatabaseModule
- [ ] Run migration and verify tables

### Week 2: Core Service
- [ ] Create ParallaxAgentsModule
- [ ] Implement ParallaxAgentsService
- [ ] Implement ParallaxAgentsController
- [ ] Add DTOs and validation
- [ ] Extend MCPApiKeyService for agents
- [ ] Write unit tests

### Week 3: MCP & Events
- [ ] Create ParallaxAgentHandler
- [ ] Register new MCP tools
- [ ] Add agent context to MCP requests
- [ ] Implement WebSocket event types
- [ ] Add gateway subscriptions
- [ ] Emit events from service

### Week 4: Frontend
- [ ] Create API client
- [ ] Build agent settings page
- [ ] Create agent request card
- [ ] Create agent card component
- [ ] Add activity panel
- [ ] Extend task assignee picker

### Week 5: Integration & Polish
- [ ] Add to workspace settings UI
- [ ] Add notifications for requests
- [ ] Write E2E tests
- [ ] Add documentation
- [ ] Integration testing with Parallax

---

## Testing Strategy

### Unit Tests
- Service methods with mocked repos
- Handler methods with mocked services
- Permission checking logic

### Integration Tests
- API endpoints with test database
- WebSocket event publishing
- MCP tool execution

### E2E Tests
- Full approval flow
- Agent assignment workflow
- Activity logging

---

## Security Checklist

- [ ] API keys scoped to specific permissions
- [ ] All agent access requires human approval
- [ ] Activity logging for audit trail
- [ ] Permission checking in MCP handlers
- [ ] Rate limiting for agent requests
- [ ] Instant revocation capability
- [ ] Webhook signature verification
- [ ] No direct database access from agents

---

## Files to Create Summary

| Phase | Files |
|-------|-------|
| Database | 1 migration, 1 types file, 3 repos |
| Service | 1 module, 1 service, 1 controller, 4 DTOs |
| MCP | 1 handler, tool definitions |
| WebSocket | 1 events file, gateway extensions |
| Frontend | ~10 component files |
| Config | Environment variables, settings schema |

Total estimated: ~25 new files
