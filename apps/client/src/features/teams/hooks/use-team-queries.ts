import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import * as teamService from "../services/team-service";
import type { OrgPattern } from "../types/team.types";

// ─── Query Keys ─────────────────────────────────────────────────────────────

export const TEAM_KEYS = {
  templates: ["team-templates"] as const,
  template: (id: string) => ["team-templates", id] as const,
  deployments: (workspaceId: string) =>
    ["team-deployments", workspaceId] as const,
  spaceDeployments: (spaceId: string) =>
    ["team-deployments", "space", spaceId] as const,
  deploymentStatus: (id: string) => ["team-deployment-status", id] as const,
};

// ─── Template Queries ───────────────────────────────────────────────────────

export function useTeamTemplates() {
  return useQuery({
    queryKey: TEAM_KEYS.templates,
    queryFn: () => teamService.listTemplates(),
    staleTime: 60_000,
  });
}

export function useTeamTemplate(id: string) {
  return useQuery({
    queryKey: TEAM_KEYS.template(id),
    queryFn: () => teamService.getTemplate(id),
    enabled: !!id,
  });
}

// ─── Deployment Queries ─────────────────────────────────────────────────────

export function useTeamDeployments(
  workspaceId: string,
  opts?: { includeTornDown?: boolean },
) {
  return useQuery({
    queryKey: [
      ...TEAM_KEYS.deployments(workspaceId),
      opts?.includeTornDown ? "with-torn-down" : "active-only",
    ],
    queryFn: () =>
      teamService.listDeployments({
        includeTornDown: opts?.includeTornDown,
      }),
    enabled: !!workspaceId,
    staleTime: 15_000,
    refetchInterval: 5_000,
  });
}

export function useSpaceDeployments(
  spaceId: string,
  opts?: { includeTornDown?: boolean },
) {
  return useQuery({
    queryKey: [
      ...TEAM_KEYS.spaceDeployments(spaceId),
      opts?.includeTornDown ? "with-torn-down" : "active-only",
    ],
    queryFn: () =>
      teamService.listDeployments({
        spaceId,
        includeTornDown: opts?.includeTornDown,
      }),
    enabled: !!spaceId,
    staleTime: 15_000,
    refetchInterval: 5_000,
  });
}

export function useDeploymentStatus(deploymentId: string | undefined) {
  return useQuery({
    queryKey: TEAM_KEYS.deploymentStatus(deploymentId!),
    queryFn: () => teamService.getDeploymentStatus(deploymentId!),
    enabled: !!deploymentId,
    refetchInterval: (query) => {
      const status = query.state.data?.deployment?.status;
      if (status === "torn_down" || status === "completed") {
        return false;
      }
      return 5_000;
    },
  });
}

// ─── Template Mutations ─────────────────────────────────────────────────────

export function useCreateTemplateMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      name: string;
      description?: string;
      version?: string;
      orgPattern: OrgPattern;
      metadata?: Record<string, any>;
    }) => teamService.createTemplate(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TEAM_KEYS.templates });
      notifications.show({
        title: "Template Created",
        message: "Team template has been created",
        color: "green",
      });
    },
    onError: (error: any) => {
      notifications.show({
        title: "Error",
        message:
          error.response?.data?.message || "Failed to create template",
        color: "red",
      });
    },
  });
}

export function useUpdateTemplateMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      templateId: string;
      name?: string;
      description?: string;
      version?: string;
      orgPattern?: OrgPattern;
      metadata?: Record<string, any>;
    }) => teamService.updateTemplate(params),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: TEAM_KEYS.templates });
      queryClient.invalidateQueries({
        queryKey: TEAM_KEYS.template(vars.templateId),
      });
      notifications.show({
        title: "Template Updated",
        message: "Team template has been updated",
        color: "green",
      });
    },
    onError: (error: any) => {
      notifications.show({
        title: "Error",
        message:
          error.response?.data?.message || "Failed to update template",
        color: "red",
      });
    },
  });
}

export function useDuplicateTemplateMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (templateId: string) =>
      teamService.duplicateTemplate(templateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TEAM_KEYS.templates });
      notifications.show({
        title: "Template Duplicated",
        message: "A copy of the template has been created",
        color: "green",
      });
    },
    onError: (error: any) => {
      notifications.show({
        title: "Error",
        message:
          error.response?.data?.message || "Failed to duplicate template",
        color: "red",
      });
    },
  });
}

export function useDeleteTemplateMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (templateId: string) =>
      teamService.deleteTemplate(templateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TEAM_KEYS.templates });
      notifications.show({
        title: "Template Deleted",
        message: "Team template has been deleted",
        color: "orange",
      });
    },
    onError: (error: any) => {
      notifications.show({
        title: "Error",
        message:
          error.response?.data?.message || "Failed to delete template",
        color: "red",
      });
    },
  });
}

// ─── Deployment Mutations ───────────────────────────────────────────────────

export function useDeployTeamMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      templateId: string;
      spaceId: string;
      projectId?: string;
      teamName?: string;
    }) => teamService.deployTeam(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-deployments"] });
      notifications.show({
        title: "Team Deployed",
        message: "Team has been deployed successfully",
        color: "green",
      });
    },
    onError: (error: any) => {
      notifications.show({
        title: "Error",
        message: error.response?.data?.message || "Failed to deploy team",
        color: "red",
      });
    },
  });
}

export function usePauseDeploymentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (deploymentId: string) =>
      teamService.pauseDeployment(deploymentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-deployments"] });
      queryClient.invalidateQueries({
        queryKey: ["team-deployment-status"],
      });
      notifications.show({
        title: "Deployment Paused",
        message: "Team deployment has been paused",
        color: "yellow",
      });
    },
    onError: (error: any) => {
      notifications.show({
        title: "Error",
        message:
          error.response?.data?.message || "Failed to pause deployment",
        color: "red",
      });
    },
  });
}

export function useResumeDeploymentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (deploymentId: string) =>
      teamService.resumeDeployment(deploymentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-deployments"] });
      queryClient.invalidateQueries({
        queryKey: ["team-deployment-status"],
      });
      notifications.show({
        title: "Deployment Resumed",
        message: "Team deployment has been resumed",
        color: "green",
      });
    },
    onError: (error: any) => {
      notifications.show({
        title: "Error",
        message:
          error.response?.data?.message || "Failed to resume deployment",
        color: "red",
      });
    },
  });
}

export function useTeardownDeploymentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (deploymentId: string) =>
      teamService.teardownDeployment(deploymentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-deployments"] });
      queryClient.invalidateQueries({
        queryKey: ["team-deployment-status"],
      });
      notifications.show({
        title: "Deployment Torn Down",
        message: "Team deployment has been torn down",
        color: "orange",
      });
    },
    onError: (error: any) => {
      notifications.show({
        title: "Error",
        message:
          error.response?.data?.message ||
          "Failed to teardown deployment",
        color: "red",
      });
    },
  });
}

export function useStartWorkflowMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (deploymentId: string) =>
      teamService.startWorkflow(deploymentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-deployments"] });
      queryClient.invalidateQueries({
        queryKey: ["team-deployment-status"],
      });
      notifications.show({
        title: "Workflow Started",
        message: "Team workflow has been started",
        color: "green",
      });
    },
    onError: (error: any) => {
      notifications.show({
        title: "Error",
        message:
          error.response?.data?.message || "Failed to start workflow",
        color: "red",
      });
    },
  });
}

export function useRedeployTeamMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      sourceDeploymentId: string;
      spaceId?: string;
      projectId?: string;
      memoryPolicy?: "none" | "carry_all";
      teamName?: string;
    }) => teamService.redeployTeam(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-deployments"] });
      notifications.show({
        title: "Team Redeployed",
        message: "A new deployment has been created",
        color: "green",
      });
    },
    onError: (error: any) => {
      notifications.show({
        title: "Error",
        message: error.response?.data?.message || "Failed to redeploy team",
        color: "red",
      });
    },
  });
}

export function useRenameDeploymentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { deploymentId: string; teamName: string }) =>
      teamService.renameDeployment(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-deployments"] });
      queryClient.invalidateQueries({ queryKey: ["team-deployment-status"] });
      notifications.show({
        title: "Team Renamed",
        message: "Deployment name updated",
        color: "green",
      });
    },
    onError: (error: any) => {
      notifications.show({
        title: "Error",
        message: error.response?.data?.message || "Failed to rename team",
        color: "red",
      });
    },
  });
}

export function useAssignDeploymentTaskMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      deploymentId: string;
      taskId?: string;
      experimentId?: string;
    }) =>
      teamService.assignDeploymentTask(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-deployments"] });
      queryClient.invalidateQueries({ queryKey: ["team-deployment-status"] });
      notifications.show({
        title: "Task Assignment Updated",
        message: "Target assignment updated for this team",
        color: "green",
      });
    },
    onError: (error: any) => {
      notifications.show({
        title: "Error",
        message:
          error.response?.data?.message || "Failed to update target assignment",
        color: "red",
      });
    },
  });
}
