import { useEffect, useMemo, useState } from "react";
import {
  Stack,
  Card,
  Group,
  Text,
  Badge,
  Button,
  Divider,
  Loader,
  Select,
  Alert,
  Anchor,
} from "@mantine/core";
import {
  IconPlayerPause,
  IconBolt,
  IconArrowLeft,
  IconRefresh,
  IconAlertTriangle,
  IconPlayerPlay,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useDeploymentStatus,
  usePauseDeploymentMutation,
  useResumeDeploymentMutation,
  useRedeployTeamMutation,
  useAssignDeploymentTaskMutation,
  useResetTeamMutation,
} from "../hooks/use-team-queries";
import { useTeamLiveUpdates } from "../hooks/use-team-live-updates";
import { useAgentActivity } from "../hooks/use-agent-activity";
import { useActiveExperiments } from "@/features/intelligence/hooks/use-intelligence-queries";
import { useDisclosure } from "@mantine/hooks";
import { WorkflowTerminalReactFlow } from "./workflow-terminal-reactflow";
import { RenameTeamModal } from "./rename-team-modal";
import type { OrgPattern } from "../types/team.types";
import {
  getTerminalSessions,
  terminateSession,
} from "@/features/terminal/services/terminal-service";

interface Props {
  deploymentId: string;
  onBack?: () => void;
  compact?: boolean;
}

function statusColor(status: string) {
  switch (status) {
    case "active":
    case "idle":
      return "green";
    case "running":
      return "blue";
    case "paused":
      return "yellow";
    case "completed":
      return "teal";
    case "error":
    case "failed":
      return "red";
    case "torn_down":
      return "gray";
    default:
      return "gray";
  }
}

function getTeamName(config: unknown, templateName: string): string {
  try {
    const cfg =
      typeof config === "string"
        ? JSON.parse(config)
        : (config as Record<string, any> | null);
    return cfg?.teamName || templateName;
  } catch {
    return templateName;
  }
}

function getTargetTaskId(config: unknown): string {
  try {
    const cfg =
      typeof config === "string"
        ? JSON.parse(config)
        : (config as Record<string, any> | null);
    return cfg?.targetTaskId || "";
  } catch {
    return "";
  }
}

function getTargetExperimentId(config: unknown): string {
  try {
    const cfg =
      typeof config === "string"
        ? JSON.parse(config)
        : (config as Record<string, any> | null);
    return cfg?.targetExperimentId || "";
  } catch {
    return "";
  }
}

function parseOrgPattern(value: unknown): OrgPattern | null {
  if (!value) return null;
  try {
    const parsed =
      typeof value === "string"
        ? JSON.parse(value)
        : (value as Record<string, any>);
    if (parsed?.structure && parsed?.workflow) {
      return parsed as OrgPattern;
    }
    return null;
  } catch {
    return null;
  }
}

function orgPatternFromExecutionPlan(value: unknown): OrgPattern | null {
  if (!value) return null;
  try {
    const parsed =
      typeof value === "string"
        ? JSON.parse(value)
        : (value as Record<string, any>);
    const roles = parsed?.roles as Record<string, any> | undefined;
    if (!roles || Object.keys(roles).length === 0) return null;

    const mappedRoles = Object.fromEntries(
      Object.entries(roles).map(([roleId, role]) => [
        roleId,
        {
          id: roleId,
          name: role?.name || roleId,
          capabilities: Array.isArray(role?.capabilities)
            ? role.capabilities
            : [],
          reportsTo: role?.reportsTo,
          minInstances: role?.minInstances || 1,
          maxInstances: role?.maxInstances || role?.minInstances || 1,
          singleton: !!role?.singleton,
        },
      ]),
    );

    return {
      name: parsed?.patternName || "Team",
      version: parsed?.version || "1.0.0",
      structure: {
        name: parsed?.patternName || "Team",
        roles: mappedRoles,
      },
      workflow: {
        name: "Workflow",
        steps: [],
      },
    };
  } catch {
    return null;
  }
}

function orgPatternFromLegacyConfig(value: unknown): OrgPattern | null {
  if (!value) return null;
  try {
    const parsed =
      typeof value === "string"
        ? JSON.parse(value)
        : (value as Record<string, any>);
    const roles = parsed?.roles as Array<Record<string, any>> | undefined;
    if (!Array.isArray(roles) || roles.length === 0) return null;

    const mappedRoles = Object.fromEntries(
      roles.map((roleDef) => [
        roleDef.role,
        {
          id: roleDef.role,
          name: roleDef.role,
          capabilities: Array.isArray(roleDef.capabilities)
            ? roleDef.capabilities
            : [],
          minInstances: roleDef.count || 1,
          maxInstances: roleDef.count || 1,
          singleton: (roleDef.count || 1) === 1,
        },
      ]),
    );

    return {
      name: parsed?.name || "Team",
      version: "legacy",
      structure: {
        name: parsed?.name || "Team",
        roles: mappedRoles,
      },
      workflow: {
        name: "Legacy Workflow",
        steps: [],
      },
    };
  } catch {
    return null;
  }
}

function orgPatternFromAgents(agents: Array<Record<string, any>>): OrgPattern | null {
  if (!Array.isArray(agents) || agents.length === 0) return null;

  const byId = new Map(agents.map((a) => [a.id, a]));
  const roleCounts = new Map<string, number>();
  const roleCaps = new Map<string, string[]>();
  const roleReportsTo = new Map<string, string>();

  for (const agent of agents) {
    const role = (agent.role as string) || "agent";
    roleCounts.set(role, (roleCounts.get(role) || 0) + 1);
    if (!roleCaps.has(role)) {
      roleCaps.set(role, Array.isArray(agent.capabilities) ? agent.capabilities : []);
    }

    if (agent.reportsToAgentId) {
      const parent = byId.get(agent.reportsToAgentId);
      if (parent?.role && parent.role !== role && !roleReportsTo.has(role)) {
        roleReportsTo.set(role, parent.role);
      }
    }
  }

  const roles = Object.fromEntries(
    Array.from(roleCounts.entries()).map(([role, count]) => [
      role,
      {
        id: role,
        name: role,
        capabilities: roleCaps.get(role) || [],
        reportsTo: roleReportsTo.get(role),
        minInstances: count,
        maxInstances: count,
        singleton: count === 1,
      },
    ]),
  );

  return {
    name: "Live Team Structure",
    version: "runtime",
    structure: {
      name: "Live Team Structure",
      roles,
    },
    workflow: {
      name: "Runtime Workflow",
      steps: [],
    },
  };
}

export function DeploymentDetailView({
  deploymentId,
  onBack,
  compact = false,
}: Props) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useDeploymentStatus(deploymentId);
  const pauseMutation = usePauseDeploymentMutation();
  const resumeMutation = useResumeDeploymentMutation();
  const redeployMutation = useRedeployTeamMutation();
  const assignTaskMutation = useAssignDeploymentTaskMutation();
  const resetMutation = useResetTeamMutation();
  const [renameOpened, { open: openRename, close: closeRename }] =
    useDisclosure(false);
  const [targetExperimentId, setTargetExperimentId] = useState<string | null>(
    "",
  );
  const deployment = data?.deployment;
  useTeamLiveUpdates(deployment?.spaceId || "", deploymentId);
  const agentActivity = useAgentActivity(deploymentId);
  const { data: experiments } = useActiveExperiments(deployment?.spaceId || "");
  const { data: terminalSessions = [] } = useQuery({
    queryKey: ["terminal-sessions", "workspace", deployment?.workspaceId],
    queryFn: () => getTerminalSessions(false),
    enabled: !!deployment?.workspaceId,
    refetchInterval: 5_000,
  });
  const terminateTerminalMutation = useMutation({
    mutationFn: (sessionId: string) => terminateSession(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["terminal-sessions", "workspace", deployment?.workspaceId],
      });
    },
  });
  const currentTargetTaskId = deployment
    ? getTargetTaskId(deployment.config)
    : "";
  const currentTargetExperimentId = deployment
    ? getTargetExperimentId(deployment.config)
    : "";

  useEffect(() => {
    setTargetExperimentId(currentTargetExperimentId);
  }, [currentTargetExperimentId]);

  const terminalSessionByAgentId = useMemo(() => {
    const byAgent = new Map<string, (typeof terminalSessions)[number]>();
    for (const session of terminalSessions) {
      if (session.status === "terminated") continue;
      if (!byAgent.has(session.agentId)) {
        byAgent.set(session.agentId, session);
      }
    }
    return byAgent;
  }, [terminalSessions]);

  const plannedExperimentOptions = (experiments || [])
    .filter((e) => e.metadata?.status === "planned")
    .map((e) => ({
      value: e.id,
      label: e.title || "Untitled experiment",
    }));

  const allExperimentNameById = new Map(
    (experiments || []).map((e) => [e.id, e.title || "Untitled experiment"]),
  );
  const currentTargetExperimentLabel = currentTargetExperimentId
    ? allExperimentNameById.get(currentTargetExperimentId) ||
      "Untitled experiment"
    : "";

  if (isLoading || !data) {
    return (
      <Group justify="center" py="xl">
        <Loader size="sm" />
      </Group>
    );
  }

  const { agents } = data;
  const orgPattern =
    parseOrgPattern((deployment as any).orgPattern) ||
    parseOrgPattern(deployment.config) ||
    orgPatternFromExecutionPlan((deployment as any).executionPlan) ||
    orgPatternFromLegacyConfig(deployment.config) ||
    orgPatternFromAgents(agents as Array<Record<string, any>>);

  return (
    <Stack gap="md" onClick={(e) => e.stopPropagation()}>
      {!compact && onBack && (
        <Group>
          <Button
            variant="subtle"
            size="xs"
            leftSection={<IconArrowLeft size={14} />}
            onClick={onBack}
          >
            Back
          </Button>
        </Group>
      )}

      <Card withBorder radius="md" p="md">
        <Stack gap="sm">
          <Group justify="space-between">
            <Group gap="sm">
              <Text fw={600}>
                {getTeamName(deployment.config, deployment.templateName)}
              </Text>
              <Badge color={statusColor(deployment.status)} variant="light">
                {deployment.status}
              </Badge>
            </Group>
            <Group gap="xs">
              <Button size="xs" variant="subtle" onClick={openRename}>
                Rename
              </Button>
              {(() => {
                const hasErrors = agents.some((a) => a.status === "error");
                const anyRunning = agents.some(
                  (a) => a.status === "running",
                );
                return (
                  <>
                    <Button
                      size="xs"
                      variant="light"
                      color="blue"
                      leftSection={<IconRefresh size={14} />}
                      onClick={() => resetMutation.mutate(deploymentId)}
                      loading={resetMutation.isPending}
                    >
                      Reset Team
                    </Button>
                    {deployment.status === "active" && (
                      <>
                        <Button
                          size="xs"
                          variant="light"
                          leftSection={<IconBolt size={14} />}
                          onClick={() =>
                            import("../services/team-service").then((s) =>
                              s.triggerTeamRun(deploymentId),
                            )
                          }
                        >
                          Trigger Run
                        </Button>
                        {anyRunning && (
                          <Button
                            size="xs"
                            variant="light"
                            color="yellow"
                            leftSection={<IconPlayerPause size={14} />}
                            onClick={() =>
                              pauseMutation.mutate(deploymentId)
                            }
                            loading={pauseMutation.isPending}
                          >
                            Pause
                          </Button>
                        )}
                      </>
                    )}
                    {deployment.status === "paused" && !hasErrors && (
                      <Button
                        size="xs"
                        variant="light"
                        color="green"
                        leftSection={<IconPlayerPlay size={14} />}
                        onClick={() =>
                          resumeMutation.mutate(deploymentId)
                        }
                        loading={resumeMutation.isPending}
                      >
                        Resume
                      </Button>
                    )}
                  </>
                );
              })()}
              {deployment.status === "torn_down" && (
                <>
                  <Button
                    size="xs"
                    variant="light"
                    onClick={() =>
                      redeployMutation.mutate({
                        sourceDeploymentId: deployment.id,
                        spaceId: deployment.spaceId,
                        projectId: deployment.projectId || undefined,
                        memoryPolicy: "none",
                      })
                    }
                    loading={redeployMutation.isPending}
                  >
                    Redeploy Fresh
                  </Button>
                  <Button
                    size="xs"
                    variant="light"
                    onClick={() =>
                      redeployMutation.mutate({
                        sourceDeploymentId: deployment.id,
                        spaceId: deployment.spaceId,
                        projectId: deployment.projectId || undefined,
                        memoryPolicy: "carry_all",
                      })
                    }
                    loading={redeployMutation.isPending}
                  >
                    Redeploy With Memory
                  </Button>
                </>
              )}
            </Group>
          </Group>

          <Divider />
          <Select
            label="Target Experiment"
            placeholder="Select planned experiment (optional)"
            data={plannedExperimentOptions}
            searchable
            clearable
            value={targetExperimentId}
            onChange={(value) => {
              setTargetExperimentId(value);
              assignTaskMutation.mutate({
                deploymentId: deployment.id,
                experimentId: value || undefined,
              });
            }}
          />
          {currentTargetExperimentId && (
            <Text size="xs" c="dimmed">
              Team is currently constrained to experiment{" "}
              {currentTargetExperimentLabel} ({currentTargetExperimentId}).
            </Text>
          )}
          {!currentTargetExperimentId && currentTargetTaskId && (
            <Text size="xs" c="dimmed">
              Team is currently constrained to task `{currentTargetTaskId}`.
            </Text>
          )}
        </Stack>
      </Card>

      {(Object.values(agentActivity).some((a) => a.type === "login_required") ||
        agents.some(
          (a) =>
            a.status === "error" &&
            a.lastRunSummary &&
            /auth|login|logged in|not logged/i.test(a.lastRunSummary),
        )) && (
        <Alert
          variant="light"
          color="red"
          icon={<IconAlertTriangle size={16} />}
          title="Authentication required"
        >
          <Text size="sm">
            One or more agents require authentication.{" "}
            {(() => {
              const loginUrl = Object.values(agentActivity).find(
                (a) => a.loginUrl,
              )?.loginUrl;
              return loginUrl ? (
                <>
                  <Anchor href={loginUrl} target="_blank" size="sm">
                    Sign in with your Claude account
                  </Anchor>{" "}
                  to authenticate. The team will restart automatically after sign-in.
                </>
              ) : (
                <>
                  <Anchor href="/settings/workspace" size="sm">
                    Connect your provider credentials
                  </Anchor>{" "}
                  in workspace settings, then reset the team to retry.
                </>
              );
            })()}
          </Text>
        </Alert>
      )}

      <WorkflowTerminalReactFlow
        agents={agents}
        orgPattern={orgPattern}
        agentActivity={agentActivity}
        terminalSessionByAgentId={terminalSessionByAgentId}
        onTerminateSession={(sid) => terminateTerminalMutation.mutate(sid)}
        height={compact ? 620 : 760}
      />

      <RenameTeamModal
        opened={renameOpened}
        onClose={closeRename}
        deploymentId={deployment.id}
        currentName={getTeamName(deployment.config, deployment.templateName)}
      />
    </Stack>
  );
}
