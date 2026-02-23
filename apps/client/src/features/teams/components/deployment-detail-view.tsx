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
} from "@mantine/core";
import {
  IconPlayerPlay,
  IconPlayerPause,
  IconBolt,
  IconArrowLeft,
} from "@tabler/icons-react";
import {
  useDeploymentStatus,
  usePauseDeploymentMutation,
  useResumeDeploymentMutation,
  useStartWorkflowMutation,
  useTeardownDeploymentMutation,
  useRedeployTeamMutation,
  useRenameDeploymentMutation,
} from "../hooks/use-team-queries";
import { WorkflowProgressBar } from "./workflow-progress-bar";
import { OrgChartMermaidPreview } from "./org-chart-mermaid-preview";
import type { WorkflowState, OrgPattern } from "../types/team.types";

interface Props {
  deploymentId: string;
  onBack: () => void;
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

export function DeploymentDetailView({ deploymentId, onBack }: Props) {
  const { data, isLoading } = useDeploymentStatus(deploymentId);
  const pauseMutation = usePauseDeploymentMutation();
  const resumeMutation = useResumeDeploymentMutation();
  const startMutation = useStartWorkflowMutation();
  const teardownMutation = useTeardownDeploymentMutation();
  const redeployMutation = useRedeployTeamMutation();
  const renameMutation = useRenameDeploymentMutation();

  if (isLoading || !data) {
    return (
      <Group justify="center" py="xl">
        <Loader size="sm" />
      </Group>
    );
  }

  const { deployment, agents } = data;
  const workflowState = deployment.workflowState as WorkflowState | null;
  const orgPattern = deployment.orgPattern as OrgPattern | null;
  const phase = workflowState?.currentPhase || "idle";

  return (
    <Stack gap="md">
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
              <Button
                size="xs"
                variant="subtle"
                onClick={() => {
                  const currentName = getTeamName(
                    deployment.config,
                    deployment.templateName,
                  );
                  const next = window.prompt("Rename team", currentName);
                  if (!next || next.trim() === "" || next.trim() === currentName) return;
                  renameMutation.mutate({
                    deploymentId: deployment.id,
                    teamName: next.trim(),
                  });
                }}
                loading={renameMutation.isPending}
              >
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
                <Table.Th>Instance</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Current Step</Table.Th>
                <Table.Th>Actions</Table.Th>
                <Table.Th>Errors</Table.Th>
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
                    <Text size="xs">#{agent.instanceNumber}</Text>
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
                      {agent.currentStepId || "-"}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs">{agent.totalActions}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs" c={agent.totalErrors > 0 ? "red" : undefined}>
                      {agent.totalErrors}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Stack>
      </Card>

      {orgPattern && (
        <Card withBorder radius="md" p="md">
          <Stack gap="sm">
            <Text fw={600} size="sm">
              Org Chart
            </Text>
            <OrgChartMermaidPreview orgPattern={orgPattern} />
          </Stack>
        </Card>
      )}
    </Stack>
  );
}
