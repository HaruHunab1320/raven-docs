import api from "@/lib/api-client";

export type ParallaxAgentStatus = "pending" | "approved" | "denied" | "revoked";

export interface ParallaxAgent {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  capabilities: string[];
  status: ParallaxAgentStatus;
  requestedPermissions: string[];
  grantedPermissions: string[];
  metadata: Record<string, any>;
  endpoint: string | null;
  requestedAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  denialReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ParallaxAgentAssignment {
  id: string;
  agentId: string;
  workspaceId: string;
  assignmentType: "project" | "task";
  projectId: string | null;
  taskId: string | null;
  role: "member" | "lead" | null;
  assignedAt: string;
  assignedBy: string | null;
  unassignedAt: string | null;
}

export interface ParallaxAgentActivity {
  id: string;
  agentId: string;
  workspaceId: string;
  activityType: string;
  description: string | null;
  metadata: Record<string, any>;
  projectId: string | null;
  taskId: string | null;
  pageId: string | null;
  createdAt: string;
}

export interface ApproveAgentDto {
  grantedPermissions: string[];
}

export interface DenyAgentDto {
  reason: string;
}

export interface RevokeAgentDto {
  reason: string;
}

export interface AssignAgentToProjectDto {
  projectId: string;
  role?: "member" | "lead";
}

export interface AssignAgentToTaskDto {
  taskId: string;
}

// Agent Invite types
export interface AgentInvite {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  token: string;
  permissions: string[];
  usesRemaining: number | null;
  usesCount: number;
  expiresAt: string | null;
  revokedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAgentInviteDto {
  name: string;
  description?: string;
  permissions: string[];
  usesRemaining?: number | null;
  expiresAt?: string | null;
}

// Get all agents in workspace
export async function getWorkspaceAgents(status?: ParallaxAgentStatus): Promise<ParallaxAgent[]> {
  const params = status ? { status } : {};
  const response = await api.get<ParallaxAgent[]>("/parallax-agents", { params });
  return response.data;
}

// Get pending access requests
export async function getPendingRequests(): Promise<ParallaxAgent[]> {
  const response = await api.get<ParallaxAgent[]>("/parallax-agents/pending");
  return response.data;
}

// Get available (approved) agents
export async function getAvailableAgents(capabilities?: string[]): Promise<ParallaxAgent[]> {
  const params = capabilities?.length ? { capabilities: capabilities.join(",") } : {};
  const response = await api.get<ParallaxAgent[]>("/parallax-agents/available", { params });
  return response.data;
}

// Get single agent details
export async function getAgent(agentId: string): Promise<ParallaxAgent> {
  const response = await api.get<ParallaxAgent>(`/parallax-agents/${agentId}`);
  return response.data;
}

// Approve agent access
export async function approveAgent(agentId: string, data: ApproveAgentDto): Promise<ParallaxAgent> {
  const response = await api.post<ParallaxAgent>(`/parallax-agents/${agentId}/approve`, data);
  return response.data;
}

// Deny agent access
export async function denyAgent(agentId: string, data: DenyAgentDto): Promise<ParallaxAgent> {
  const response = await api.post<ParallaxAgent>(`/parallax-agents/${agentId}/deny`, data);
  return response.data;
}

// Revoke agent access
export async function revokeAgent(agentId: string, data: RevokeAgentDto): Promise<void> {
  await api.post(`/parallax-agents/${agentId}/revoke`, data);
}

// Update agent permissions
export async function updateAgentPermissions(
  agentId: string,
  permissions: string[]
): Promise<ParallaxAgent> {
  const response = await api.post<ParallaxAgent>(`/parallax-agents/${agentId}/permissions`, {
    permissions,
  });
  return response.data;
}

// Assign agent to project
export async function assignAgentToProject(
  agentId: string,
  data: AssignAgentToProjectDto
): Promise<ParallaxAgentAssignment> {
  const response = await api.post<ParallaxAgentAssignment>(
    `/parallax-agents/${agentId}/assign/project`,
    data
  );
  return response.data;
}

// Assign agent to task
export async function assignAgentToTask(
  agentId: string,
  data: AssignAgentToTaskDto
): Promise<ParallaxAgentAssignment> {
  const response = await api.post<ParallaxAgentAssignment>(
    `/parallax-agents/${agentId}/assign/task`,
    data
  );
  return response.data;
}

// Get agent assignments
export async function getAgentAssignments(agentId: string): Promise<ParallaxAgentAssignment[]> {
  const response = await api.get<ParallaxAgentAssignment[]>(
    `/parallax-agents/${agentId}/assignments`
  );
  return response.data;
}

// Unassign agent
export async function unassignAgent(assignmentId: string): Promise<void> {
  await api.delete(`/parallax-agents/assignments/${assignmentId}`);
}

// Get agent activity
export async function getAgentActivity(
  agentId: string,
  limit?: number
): Promise<ParallaxAgentActivity[]> {
  const params = limit ? { limit: String(limit) } : {};
  const response = await api.get<ParallaxAgentActivity[]>(
    `/parallax-agents/${agentId}/activity`,
    { params }
  );
  return response.data;
}

// Get workspace-wide activity
export async function getWorkspaceActivity(limit?: number): Promise<ParallaxAgentActivity[]> {
  const params = limit ? { limit: String(limit) } : {};
  const response = await api.get<ParallaxAgentActivity[]>(
    `/parallax-agents/activity/workspace`,
    { params }
  );
  return response.data;
}

// Get agents assigned to a project
export async function getProjectAgents(projectId: string): Promise<ParallaxAgent[]> {
  const response = await api.get<ParallaxAgent[]>(`/parallax-agents/project/${projectId}`);
  return response.data;
}

// Get agents assigned to a task
export async function getTaskAgents(taskId: string): Promise<ParallaxAgent[]> {
  const response = await api.get<ParallaxAgent[]>(`/parallax-agents/task/${taskId}`);
  return response.data;
}

// ========== Agent Invites ==========

// Get all invites for workspace
export async function getWorkspaceInvites(): Promise<AgentInvite[]> {
  const response = await api.get<AgentInvite[]>("/parallax-agents/invites");
  return response.data;
}

// Get active invites
export async function getActiveInvites(): Promise<AgentInvite[]> {
  const response = await api.get<AgentInvite[]>("/parallax-agents/invites/active");
  return response.data;
}

// Get single invite
export async function getInvite(inviteId: string): Promise<AgentInvite> {
  const response = await api.get<AgentInvite>(`/parallax-agents/invites/${inviteId}`);
  return response.data;
}

// Create invite
export async function createInvite(data: CreateAgentInviteDto): Promise<AgentInvite> {
  const response = await api.post<AgentInvite>("/parallax-agents/invites", data);
  return response.data;
}

// Revoke invite
export async function revokeInvite(inviteId: string): Promise<AgentInvite> {
  const response = await api.post<AgentInvite>(`/parallax-agents/invites/${inviteId}/revoke`);
  return response.data;
}

// Delete invite
export async function deleteInvite(inviteId: string): Promise<void> {
  await api.delete(`/parallax-agents/invites/${inviteId}`);
}

// ========== Agent Runtime & Spawning ==========

export type AgentType = 'claude-code' | 'codex' | 'gemini-cli' | 'aider' | 'custom';

export interface SpawnAgentRequest {
  agentType: AgentType;
  count: number;
  name?: string;
  capabilities?: string[];
  permissions?: string[];
  projectId?: string;
  taskId?: string;
  config?: Record<string, any>;
}

export interface SpawnResult {
  success: boolean;
  spawnedAgents: Array<{
    id: string;
    name: string;
    type: AgentType;
    status: string;
  }>;
  errors?: string[];
}

export interface RuntimeConnectionResult {
  connected: boolean;
  latency?: number;
  version?: string;
  activeAgents?: number;
  error?: string;
}

// Spawn agents via the configured runtime
export async function spawnAgents(request: SpawnAgentRequest): Promise<SpawnResult> {
  const response = await api.post<SpawnResult>("/parallax-agents/spawn", request);
  return response.data;
}

// Test runtime connection
export async function testRuntimeConnection(endpoint?: string): Promise<RuntimeConnectionResult> {
  const response = await api.post<RuntimeConnectionResult>("/parallax-agents/runtime/test", {
    endpoint,
  });
  return response.data;
}

// ========== Activity Watching ==========

export interface WatchableTarget {
  id: string;
  name: string;
  type: 'agent';
  status: string;
  avatarUrl: string | null;
}

export interface WatchableTargetsResponse {
  agents: WatchableTarget[];
}

export interface ActivityEntry {
  id: string;
  activityType: string;
  description: string | null;
  metadata: Record<string, any>;
  createdAt: string;
}

export interface RecentActivityResponse {
  activities: ActivityEntry[];
}

export interface ToolExecutedEvent {
  type: 'tool_executed';
  resource: 'agent';
  operation: 'execute';
  resourceId: string;
  timestamp: string;
  userId: string;
  workspaceId: string;
  data: {
    tool: string;
    params?: Record<string, any>;
    success: boolean;
    durationMs: number;
    error?: string;
    resultSummary?: string;
    isAgent: boolean;
    agentId?: string;
  };
}

// Get watchable targets (agents that can be watched)
export async function getWatchableTargets(): Promise<WatchableTargetsResponse> {
  const response = await api.get<WatchableTargetsResponse>("/parallax-agents/watchable");
  return response.data;
}

// Get recent activity for a specific agent
export async function getRecentActivity(
  agentId: string,
  limit?: number
): Promise<RecentActivityResponse> {
  const params = limit ? { limit: String(limit) } : {};
  const response = await api.get<RecentActivityResponse>(
    `/parallax-agents/${agentId}/recent-activity`,
    { params }
  );
  return response.data;
}
