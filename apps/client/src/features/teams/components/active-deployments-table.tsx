import {
  Table,
  Badge,
  Group,
  Text,
  ActionIcon,
  Loader,
  Menu,
  Stack,
} from "@mantine/core";
import {
  IconPlayerPause,
  IconPlayerPlay,
  IconTrash,
  IconDots,
  IconEye,
} from "@tabler/icons-react";
import {
  useTeamDeployments,
  usePauseDeploymentMutation,
  useResumeDeploymentMutation,
  useTeardownDeploymentMutation,
} from "../hooks/use-team-queries";
import type { TeamDeployment, WorkflowState } from "../types/team.types";

interface Props {
  workspaceId: string;
  onViewDeployment?: (deploymentId: string) => void;
}

function statusColor(status: string) {
  switch (status) {
    case "active":
      return "green";
    case "paused":
      return "yellow";
    case "torn_down":
      return "gray";
    default:
      return "blue";
  }
}

function workflowPhaseLabel(deployment: TeamDeployment): string {
  const state = deployment.workflowState as WorkflowState | null;
  if (!state) return "-";
  return state.currentPhase || "idle";
}

export function ActiveDeploymentsTable({
  workspaceId,
  onViewDeployment,
}: Props) {
  const { data: deployments, isLoading } = useTeamDeployments(workspaceId);
  const pauseMutation = usePauseDeploymentMutation();
  const resumeMutation = useResumeDeploymentMutation();
  const teardownMutation = useTeardownDeploymentMutation();

  if (isLoading) {
    return (
      <Group justify="center" py="xl">
        <Loader size="sm" />
      </Group>
    );
  }

  if (!deployments || deployments.length === 0) {
    return (
      <Text size="sm" c="dimmed" ta="center" py="xl">
        No deployments yet. Deploy a team from the Template Gallery.
      </Text>
    );
  }

  return (
    <Stack gap="md">
      <Table highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Template</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th>Workflow</Table.Th>
            <Table.Th>Created</Table.Th>
            <Table.Th w={60} />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {deployments.map((d) => (
            <Table.Tr key={d.id}>
              <Table.Td>
                <Text size="sm" fw={500}>
                  {d.templateName}
                </Text>
              </Table.Td>
              <Table.Td>
                <Badge size="sm" color={statusColor(d.status)} variant="light">
                  {d.status}
                </Badge>
              </Table.Td>
              <Table.Td>
                <Text size="xs" c="dimmed">
                  {workflowPhaseLabel(d)}
                </Text>
              </Table.Td>
              <Table.Td>
                <Text size="xs" c="dimmed">
                  {new Date(d.createdAt).toLocaleDateString()}
                </Text>
              </Table.Td>
              <Table.Td>
                <Menu shadow="md" width={160} position="bottom-end">
                  <Menu.Target>
                    <ActionIcon variant="subtle" size="sm">
                      <IconDots size={16} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    {onViewDeployment && (
                      <Menu.Item
                        leftSection={<IconEye size={14} />}
                        onClick={() => onViewDeployment(d.id)}
                      >
                        View
                      </Menu.Item>
                    )}
                    {d.status === "active" ? (
                      <Menu.Item
                        leftSection={<IconPlayerPause size={14} />}
                        onClick={() => pauseMutation.mutate(d.id)}
                      >
                        Pause
                      </Menu.Item>
                    ) : d.status === "paused" ? (
                      <Menu.Item
                        leftSection={<IconPlayerPlay size={14} />}
                        onClick={() => resumeMutation.mutate(d.id)}
                      >
                        Resume
                      </Menu.Item>
                    ) : null}
                    {d.status !== "torn_down" && (
                      <>
                        <Menu.Divider />
                        <Menu.Item
                          leftSection={<IconTrash size={14} />}
                          color="red"
                          onClick={() => teardownMutation.mutate(d.id)}
                        >
                          Teardown
                        </Menu.Item>
                      </>
                    )}
                  </Menu.Dropdown>
                </Menu>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}
