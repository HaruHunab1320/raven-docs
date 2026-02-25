import { useEffect, useMemo, useState } from "react";
import {
  Stack,
  Card,
  Group,
  Text,
  Badge,
  Button,
  Table,
  Divider,
  Loader,
  Select,
} from "@mantine/core";
import {
  IconPlayerPlay,
  IconPlayerPause,
  IconBolt,
  IconArrowLeft,
  IconTerminal2,
  IconPlayerStop,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useDeploymentStatus,
  usePauseDeploymentMutation,
  useResumeDeploymentMutation,
  useStartWorkflowMutation,
  useRedeployTeamMutation,
  useAssignDeploymentTaskMutation,
} from "../hooks/use-team-queries";
import { useTeamLiveUpdates } from "../hooks/use-team-live-updates";
import { useActiveExperiments } from "@/features/intelligence/hooks/use-intelligence-queries";
import { useDisclosure } from "@mantine/hooks";
import { WorkflowProgressBar } from "./workflow-progress-bar";
import { OrgChartMermaidPreview } from "./org-chart-mermaid-preview";
import { WorkflowExecutionGraph } from "./workflow-execution-graph";
import { RenameTeamModal } from "./rename-team-modal";
import type { WorkflowState, OrgPattern } from "../types/team.types";
import { WebTerminal } from "@/features/terminal";
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

function formatCurrentStep(stepId: string | null): string {
  if (!stepId) return "-";
  if (stepId === "manual_run") return "manual run";
  return stepId;
}

function parseExecutionPlan(value: unknown): Record<string, any> | null {
  if (!value) return null;
  try {
    return typeof value === "string"
      ? (JSON.parse(value) as Record<string, any>)
      : (value as Record<string, any>);
  } catch {
    return null;
  }
}

function parseWorkflowState(value: unknown): WorkflowState | null {
  if (!value) return null;
  try {
    const parsed =
      typeof value === "string"
        ? JSON.parse(value)
        : (value as Record<string, any>);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as WorkflowState;
  } catch {
    return null;
  }
}

function getStepLabel(step: Record<string, any>): string {
  const kind = step?.operation?.kind;
  switch (kind) {
    case "dispatch_agent_loop":
      return `assign ${step?.operation?.role || "agent"}${
        step?.operation?.task ? `: ${step.operation.task}` : ""
      }`;
    case "invoke_coordinator":
      return `coordinator: ${step?.operation?.reason || "decision"}`;
    case "aggregate_results":
      return `aggregate (${step?.operation?.method || "merge"})`;
    case "await_event":
      return `wait for event (${step?.operation?.eventPattern || "*"})`;
    case "evaluate_condition":
      return `condition: ${step?.operation?.check || "evaluate"}`;
    default:
      return step?.type || "step";
  }
}

function collectStepRows(
  steps: Array<Record<string, any>>,
  rows: Array<{ stepId: string; label: string }>,
) {
  for (const step of steps || []) {
    if (step?.stepId) {
      rows.push({ stepId: step.stepId, label: getStepLabel(step) });
    }
    if (Array.isArray(step?.children) && step.children.length > 0) {
      collectStepRows(step.children, rows);
    }
    if (step?.thenBranch) {
      collectStepRows([step.thenBranch], rows);
    }
    if (step?.elseBranch) {
      collectStepRows([step.elseBranch], rows);
    }
  }
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
  const startMutation = useStartWorkflowMutation();
  const redeployMutation = useRedeployTeamMutation();
  const assignTaskMutation = useAssignDeploymentTaskMutation();
  const [renameOpened, { open: openRename, close: closeRename }] =
    useDisclosure(false);
  const [targetExperimentId, setTargetExperimentId] = useState<string | null>(
    "",
  );
  const [openTerminalAgentId, setOpenTerminalAgentId] = useState<string | null>(
    null,
  );
  const deployment = data?.deployment;
  useTeamLiveUpdates(deployment?.spaceId || "", deploymentId);
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

  useEffect(() => {
    if (
      openTerminalAgentId &&
      !terminalSessionByAgentId.has(openTerminalAgentId)
    ) {
      setOpenTerminalAgentId(null);
    }
  }, [openTerminalAgentId, terminalSessionByAgentId]);

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
  const roleTotals = agents.reduce<Record<string, number>>((acc, agent) => {
    acc[agent.role] = (acc[agent.role] || 0) + 1;
    return acc;
  }, {});
  const executionPlan = parseExecutionPlan((deployment as any).executionPlan);
  const stepRows: Array<{ stepId: string; label: string }> = [];
  if (Array.isArray(executionPlan?.steps)) {
    collectStepRows(executionPlan.steps as Array<Record<string, any>>, stepRows);
  }
  const stepLabelMap = new Map(stepRows.map((s) => [s.stepId, s.label]));
  const workflowState = parseWorkflowState(deployment.workflowState);
  const runLogs = Array.isArray(workflowState?.runLogs)
    ? workflowState!.runLogs.slice().reverse()
    : [];
  const orgPattern =
    parseOrgPattern((deployment as any).orgPattern) ||
    parseOrgPattern(deployment.config) ||
    orgPatternFromExecutionPlan((deployment as any).executionPlan) ||
    orgPatternFromLegacyConfig(deployment.config) ||
    orgPatternFromAgents(agents as Array<Record<string, any>>);
  const phase = workflowState?.currentPhase || "idle";

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
              <Badge color={statusColor(phase)} variant="outline">
                {phase}
              </Badge>
            </Group>
            <Group gap="xs">
              {phase === "idle" && deployment.status === "active" && (
                <Button
                  size="xs"
                  leftSection={<IconPlayerPlay size={14} />}
                  onClick={() => startMutation.mutate(deploymentId)}
                  loading={startMutation.isPending}
                >
                  Start Workflow
                </Button>
              )}
              <Button size="xs" variant="subtle" onClick={openRename}>
                Rename
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
                  <Button
                    size="xs"
                    variant="light"
                    color="yellow"
                    leftSection={<IconPlayerPause size={14} />}
                    onClick={() => pauseMutation.mutate(deploymentId)}
                    loading={pauseMutation.isPending}
                  >
                    Pause
                  </Button>
                </>
              )}
              {deployment.status === "paused" && (
                <Button
                  size="xs"
                  variant="light"
                  color="green"
                  leftSection={<IconPlayerPlay size={14} />}
                  onClick={() => resumeMutation.mutate(deploymentId)}
                  loading={resumeMutation.isPending}
                >
                  Resume
                </Button>
              )}
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
          <Group align="flex-end">
            <Select
              label="Target Experiment"
              placeholder="Select planned experiment (optional)"
              data={plannedExperimentOptions}
              searchable
              clearable
              value={targetExperimentId}
              onChange={setTargetExperimentId}
              style={{ flex: 1 }}
            />
            <Button
              size="xs"
              variant="light"
              onClick={() =>
                assignTaskMutation.mutate({
                  deploymentId: deployment.id,
                  experimentId: targetExperimentId || undefined,
                })
              }
              loading={assignTaskMutation.isPending}
            >
              Save Target
            </Button>
            <Button
              size="xs"
              variant="subtle"
              color="gray"
              disabled={!currentTargetTaskId && !currentTargetExperimentId}
              onClick={() =>
                assignTaskMutation.mutate({
                  deploymentId: deployment.id,
                  taskId: undefined,
                  experimentId: undefined,
                })
              }
              loading={assignTaskMutation.isPending}
            >
              Clear
            </Button>
          </Group>
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

          {workflowState && Object.keys(workflowState.stepStates).length > 0 && (
            <>
              <Divider />
              <Text size="sm" fw={500}>
                Workflow Progress
              </Text>
              <WorkflowProgressBar stepStates={workflowState.stepStates} />
            </>
          )}
        </Stack>
      </Card>

      <Card withBorder radius="md" p="md">
        <Stack gap="sm">
          <Text fw={600} size="sm">
            Agents ({agents.length})
          </Text>
          <Table highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Role</Table.Th>
                <Table.Th>Slot</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Current Step</Table.Th>
                <Table.Th>Actions</Table.Th>
                <Table.Th>Errors</Table.Th>
                <Table.Th>Terminal</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {agents.map((agent) => (
                <Table.Tr key={agent.id}>
                  <Table.Td>
                    <Text size="sm" fw={500}>
                      {agent.role}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs">
                      {agent.instanceNumber}/{roleTotals[agent.role] || 1}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge
                      size="sm"
                      color={statusColor(agent.status)}
                      variant="light"
                    >
                      {agent.status}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs" c="dimmed">
                      {(() => {
                        const stepId = formatCurrentStep(agent.currentStepId);
                        if (!agent.currentStepId || agent.currentStepId === "manual_run") {
                          return stepId;
                        }
                        const label = stepLabelMap.get(agent.currentStepId);
                        return label ? `${agent.currentStepId} (${label})` : stepId;
                      })()}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs">{agent.totalActions}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text
                      size="xs"
                      c={agent.totalErrors > 0 ? "red" : undefined}
                    >
                      {agent.totalErrors}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    {(() => {
                      const session = terminalSessionByAgentId.get(agent.id);
                      if (!session) {
                        return (
                          <Text size="xs" c="dimmed">
                            no session
                          </Text>
                        );
                      }
                      const isOpen = openTerminalAgentId === agent.id;
                      return (
                        <Group gap={6}>
                          <Badge size="xs" variant="light">
                            {session.status}
                          </Badge>
                          <Button
                            size="xs"
                            variant={isOpen ? "filled" : "light"}
                            leftSection={<IconTerminal2 size={12} />}
                            onClick={() =>
                              setOpenTerminalAgentId(isOpen ? null : agent.id)
                            }
                          >
                            {isOpen ? "Hide" : "Open"}
                          </Button>
                          <Button
                            size="xs"
                            color="red"
                            variant="subtle"
                            leftSection={<IconPlayerStop size={12} />}
                            onClick={() =>
                              terminateTerminalMutation.mutate(session.id)
                            }
                            loading={terminateTerminalMutation.isPending}
                          >
                            Stop
                          </Button>
                        </Group>
                      );
                    })()}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>

          {openTerminalAgentId &&
            terminalSessionByAgentId.get(openTerminalAgentId) && (
              <>
                <Divider />
                <Stack gap="xs">
                  <Text size="sm" fw={500}>
                    Agent Terminal: {openTerminalAgentId}
                  </Text>
                  <WebTerminal
                    sessionId={terminalSessionByAgentId.get(openTerminalAgentId)!.id}
                    height={360}
                  />
                </Stack>
              </>
            )}
        </Stack>
      </Card>

      <Card withBorder radius="md" p="md">
        <Stack gap="sm">
          <Text fw={600} size="sm">
            Org Chart
          </Text>
          {orgPattern ? (
            <OrgChartMermaidPreview orgPattern={orgPattern} />
          ) : (
            <Text size="sm" c="dimmed">
              Org chart unavailable for this deployment.
            </Text>
          )}
          {stepRows.length > 0 && (
            <>
              <Divider />
              <Text fw={600} size="sm">
                Live Workflow Graph
              </Text>
              <WorkflowExecutionGraph
                executionPlan={(deployment as any).executionPlan}
                workflowState={workflowState}
                compact={compact}
              />
              <Divider />
              <Text fw={600} size="sm">
                Workflow Steps
              </Text>
              <Stack gap={2}>
                {stepRows.map((step) => (
                  <Text key={step.stepId} size="xs" c="dimmed">
                    {step.stepId}: {step.label}
                  </Text>
                ))}
              </Stack>
            </>
          )}
        </Stack>
      </Card>

      <Card withBorder radius="md" p="md">
        <Stack gap="sm">
          <Text fw={600} size="sm">
            Team Run Logs
          </Text>
          {runLogs.length === 0 ? (
            <Text size="sm" c="dimmed">
              No team run logs yet.
            </Text>
          ) : (
            <Stack gap="xs">
              {runLogs.slice(0, 25).map((entry) => (
                <Card key={entry.id} withBorder radius="sm" p="sm">
                  <Stack gap={4}>
                    <Group justify="space-between">
                      <Text size="sm" fw={500}>
                        {entry.role}
                        {entry.stepId ? ` (${entry.stepId})` : ""}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {new Date(entry.timestamp).toLocaleString()}
                      </Text>
                    </Group>
                    <Text size="xs">{entry.summary}</Text>
                    <Text size="xs" c="dimmed">
                      Actions: {entry.actionsExecuted} | Errors: {entry.errorsEncountered}
                    </Text>
                    {entry.actions?.length > 0 && (
                      <Stack gap={2}>
                        {entry.actions.map((a, idx) => (
                          <Text key={`${entry.id}-${idx}`} size="xs" c="dimmed">
                            {a.status}: {a.method}
                            {a.error ? ` (${a.error})` : ""}
                          </Text>
                        ))}
                      </Stack>
                    )}
                  </Stack>
                </Card>
              ))}
            </Stack>
          )}
        </Stack>
      </Card>

      <RenameTeamModal
        opened={renameOpened}
        onClose={closeRename}
        deploymentId={deployment.id}
        currentName={getTeamName(deployment.config, deployment.templateName)}
      />
    </Stack>
  );
}
