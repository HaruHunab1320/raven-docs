import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import {
  getWorkspaceAgents,
  getPendingRequests,
  getAvailableAgents,
  getAgent,
  approveAgent,
  denyAgent,
  revokeAgent,
  updateAgentPermissions,
  assignAgentToProject,
  assignAgentToTask,
  getAgentAssignments,
  unassignAgent,
  getAgentActivity,
  getWorkspaceActivity,
  getProjectAgents,
  getTaskAgents,
  getWorkspaceInvites,
  getActiveInvites,
  getInvite,
  createInvite,
  revokeInvite,
  deleteInvite,
  type ParallaxAgentStatus,
  type ApproveAgentDto,
  type DenyAgentDto,
  type RevokeAgentDto,
  type AssignAgentToProjectDto,
  type AssignAgentToTaskDto,
  type CreateAgentInviteDto,
} from "../services/parallax-agent-service";

// Query keys
export const PARALLAX_AGENTS_KEY = ["parallax-agents"];
export const PARALLAX_AGENTS_PENDING_KEY = ["parallax-agents", "pending"];
export const PARALLAX_AGENTS_AVAILABLE_KEY = ["parallax-agents", "available"];
export const PARALLAX_AGENT_KEY = (id: string) => ["parallax-agents", id];
export const PARALLAX_AGENT_ASSIGNMENTS_KEY = (id: string) => ["parallax-agents", id, "assignments"];
export const PARALLAX_AGENT_ACTIVITY_KEY = (id: string) => ["parallax-agents", id, "activity"];
export const PARALLAX_WORKSPACE_ACTIVITY_KEY = ["parallax-agents", "workspace-activity"];
export const PARALLAX_PROJECT_AGENTS_KEY = (id: string) => ["parallax-agents", "project", id];
export const PARALLAX_TASK_AGENTS_KEY = (id: string) => ["parallax-agents", "task", id];
export const AGENT_INVITES_KEY = ["agent-invites"];
export const AGENT_INVITES_ACTIVE_KEY = ["agent-invites", "active"];
export const AGENT_INVITE_KEY = (id: string) => ["agent-invites", id];

// Fetch all workspace agents
export function useWorkspaceAgents(status?: ParallaxAgentStatus) {
  return useQuery({
    queryKey: status ? [...PARALLAX_AGENTS_KEY, { status }] : PARALLAX_AGENTS_KEY,
    queryFn: () => getWorkspaceAgents(status),
    staleTime: 1000 * 60, // 1 minute
  });
}

// Fetch pending access requests
export function usePendingRequests() {
  return useQuery({
    queryKey: PARALLAX_AGENTS_PENDING_KEY,
    queryFn: getPendingRequests,
    staleTime: 1000 * 30, // 30 seconds - check frequently for new requests
  });
}

// Fetch available (approved) agents
export function useAvailableAgents(capabilities?: string[]) {
  return useQuery({
    queryKey: capabilities?.length
      ? [...PARALLAX_AGENTS_AVAILABLE_KEY, { capabilities }]
      : PARALLAX_AGENTS_AVAILABLE_KEY,
    queryFn: () => getAvailableAgents(capabilities),
    staleTime: 1000 * 60,
  });
}

// Fetch single agent
export function useAgent(agentId: string) {
  return useQuery({
    queryKey: PARALLAX_AGENT_KEY(agentId),
    queryFn: () => getAgent(agentId),
    enabled: !!agentId,
  });
}

// Approve agent mutation
export function useApproveAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ agentId, data }: { agentId: string; data: ApproveAgentDto }) =>
      approveAgent(agentId, data),
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: PARALLAX_AGENTS_KEY });
      queryClient.invalidateQueries({ queryKey: PARALLAX_AGENTS_PENDING_KEY });
      queryClient.invalidateQueries({ queryKey: PARALLAX_AGENT_KEY(agentId) });
      notifications.show({
        title: "Agent Approved",
        message: "Agent access has been granted",
        color: "green",
      });
    },
    onError: (error: any) => {
      notifications.show({
        title: "Error",
        message: error.response?.data?.message || "Failed to approve agent",
        color: "red",
      });
    },
  });
}

// Deny agent mutation
export function useDenyAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ agentId, data }: { agentId: string; data: DenyAgentDto }) =>
      denyAgent(agentId, data),
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: PARALLAX_AGENTS_KEY });
      queryClient.invalidateQueries({ queryKey: PARALLAX_AGENTS_PENDING_KEY });
      queryClient.invalidateQueries({ queryKey: PARALLAX_AGENT_KEY(agentId) });
      notifications.show({
        title: "Agent Denied",
        message: "Agent access has been denied",
        color: "orange",
      });
    },
    onError: (error: any) => {
      notifications.show({
        title: "Error",
        message: error.response?.data?.message || "Failed to deny agent",
        color: "red",
      });
    },
  });
}

// Revoke agent mutation
export function useRevokeAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ agentId, data }: { agentId: string; data: RevokeAgentDto }) =>
      revokeAgent(agentId, data),
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: PARALLAX_AGENTS_KEY });
      queryClient.invalidateQueries({ queryKey: PARALLAX_AGENT_KEY(agentId) });
      notifications.show({
        title: "Agent Revoked",
        message: "Agent access has been revoked",
        color: "orange",
      });
    },
    onError: (error: any) => {
      notifications.show({
        title: "Error",
        message: error.response?.data?.message || "Failed to revoke agent",
        color: "red",
      });
    },
  });
}

// Update permissions mutation
export function useUpdateAgentPermissions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ agentId, permissions }: { agentId: string; permissions: string[] }) =>
      updateAgentPermissions(agentId, permissions),
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: PARALLAX_AGENT_KEY(agentId) });
      notifications.show({
        title: "Permissions Updated",
        message: "Agent permissions have been updated",
        color: "green",
      });
    },
    onError: (error: any) => {
      notifications.show({
        title: "Error",
        message: error.response?.data?.message || "Failed to update permissions",
        color: "red",
      });
    },
  });
}

// Assign to project mutation
export function useAssignAgentToProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ agentId, data }: { agentId: string; data: AssignAgentToProjectDto }) =>
      assignAgentToProject(agentId, data),
    onSuccess: (_, { agentId, data }) => {
      queryClient.invalidateQueries({ queryKey: PARALLAX_AGENT_ASSIGNMENTS_KEY(agentId) });
      queryClient.invalidateQueries({ queryKey: PARALLAX_PROJECT_AGENTS_KEY(data.projectId) });
      notifications.show({
        title: "Agent Assigned",
        message: "Agent has been assigned to the project",
        color: "green",
      });
    },
    onError: (error: any) => {
      notifications.show({
        title: "Error",
        message: error.response?.data?.message || "Failed to assign agent",
        color: "red",
      });
    },
  });
}

// Assign to task mutation
export function useAssignAgentToTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ agentId, data }: { agentId: string; data: AssignAgentToTaskDto }) =>
      assignAgentToTask(agentId, data),
    onSuccess: (_, { agentId, data }) => {
      queryClient.invalidateQueries({ queryKey: PARALLAX_AGENT_ASSIGNMENTS_KEY(agentId) });
      queryClient.invalidateQueries({ queryKey: PARALLAX_TASK_AGENTS_KEY(data.taskId) });
      notifications.show({
        title: "Agent Assigned",
        message: "Agent has been assigned to the task",
        color: "green",
      });
    },
    onError: (error: any) => {
      notifications.show({
        title: "Error",
        message: error.response?.data?.message || "Failed to assign agent",
        color: "red",
      });
    },
  });
}

// Get agent assignments
export function useAgentAssignments(agentId: string) {
  return useQuery({
    queryKey: PARALLAX_AGENT_ASSIGNMENTS_KEY(agentId),
    queryFn: () => getAgentAssignments(agentId),
    enabled: !!agentId,
  });
}

// Unassign mutation
export function useUnassignAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (assignmentId: string) => unassignAgent(assignmentId),
    onSuccess: () => {
      // Invalidate all assignment-related queries
      queryClient.invalidateQueries({ queryKey: PARALLAX_AGENTS_KEY });
      notifications.show({
        title: "Agent Unassigned",
        message: "Agent has been unassigned",
        color: "green",
      });
    },
    onError: (error: any) => {
      notifications.show({
        title: "Error",
        message: error.response?.data?.message || "Failed to unassign agent",
        color: "red",
      });
    },
  });
}

// Get agent activity
export function useAgentActivity(agentId: string, limit?: number) {
  return useQuery({
    queryKey: [...PARALLAX_AGENT_ACTIVITY_KEY(agentId), { limit }],
    queryFn: () => getAgentActivity(agentId, limit),
    enabled: !!agentId,
    staleTime: 1000 * 30, // 30 seconds
  });
}

// Get workspace activity
export function useWorkspaceActivity(limit?: number) {
  return useQuery({
    queryKey: [...PARALLAX_WORKSPACE_ACTIVITY_KEY, { limit }],
    queryFn: () => getWorkspaceActivity(limit),
    staleTime: 1000 * 30,
  });
}

// Get project agents
export function useProjectAgents(projectId: string) {
  return useQuery({
    queryKey: PARALLAX_PROJECT_AGENTS_KEY(projectId),
    queryFn: () => getProjectAgents(projectId),
    enabled: !!projectId,
  });
}

// Get task agents
export function useTaskAgents(taskId: string) {
  return useQuery({
    queryKey: PARALLAX_TASK_AGENTS_KEY(taskId),
    queryFn: () => getTaskAgents(taskId),
    enabled: !!taskId,
  });
}

// ========== Agent Invites ==========

// Get all invites
export function useWorkspaceInvites() {
  return useQuery({
    queryKey: AGENT_INVITES_KEY,
    queryFn: getWorkspaceInvites,
    staleTime: 1000 * 60,
  });
}

// Get active invites
export function useActiveInvites() {
  return useQuery({
    queryKey: AGENT_INVITES_ACTIVE_KEY,
    queryFn: getActiveInvites,
    staleTime: 1000 * 60,
  });
}

// Get single invite
export function useInvite(inviteId: string) {
  return useQuery({
    queryKey: AGENT_INVITE_KEY(inviteId),
    queryFn: () => getInvite(inviteId),
    enabled: !!inviteId,
  });
}

// Create invite mutation
export function useCreateInvite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateAgentInviteDto) => createInvite(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AGENT_INVITES_KEY });
      queryClient.invalidateQueries({ queryKey: AGENT_INVITES_ACTIVE_KEY });
      notifications.show({
        title: "Invite Created",
        message: "Agent invite has been created",
        color: "green",
      });
    },
    onError: (error: any) => {
      notifications.show({
        title: "Error",
        message: error.response?.data?.message || "Failed to create invite",
        color: "red",
      });
    },
  });
}

// Revoke invite mutation
export function useRevokeInvite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (inviteId: string) => revokeInvite(inviteId),
    onSuccess: (_, inviteId) => {
      queryClient.invalidateQueries({ queryKey: AGENT_INVITES_KEY });
      queryClient.invalidateQueries({ queryKey: AGENT_INVITES_ACTIVE_KEY });
      queryClient.invalidateQueries({ queryKey: AGENT_INVITE_KEY(inviteId) });
      notifications.show({
        title: "Invite Revoked",
        message: "Agent invite has been revoked",
        color: "orange",
      });
    },
    onError: (error: any) => {
      notifications.show({
        title: "Error",
        message: error.response?.data?.message || "Failed to revoke invite",
        color: "red",
      });
    },
  });
}

// Delete invite mutation
export function useDeleteInvite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (inviteId: string) => deleteInvite(inviteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AGENT_INVITES_KEY });
      queryClient.invalidateQueries({ queryKey: AGENT_INVITES_ACTIVE_KEY });
      notifications.show({
        title: "Invite Deleted",
        message: "Agent invite has been deleted",
        color: "green",
      });
    },
    onError: (error: any) => {
      notifications.show({
        title: "Error",
        message: error.response?.data?.message || "Failed to delete invite",
        color: "red",
      });
    },
  });
}
