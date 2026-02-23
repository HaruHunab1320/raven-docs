import {
  Table,
  Badge,
  Group,
  Text,
  ActionIcon,
  Loader,
  Menu,
  Stack,
  Switch,
} from "@mantine/core";
import {
  IconPlayerPause,
  IconPlayerPlay,
  IconTrash,
  IconDots,
  IconEye,
  IconRotateClockwise,
  IconPencil,
} from "@tabler/icons-react";
import {
  useTeamDeployments,
  usePauseDeploymentMutation,
  useResumeDeploymentMutation,
  useTeardownDeploymentMutation,
  useRedeployTeamMutation,
} from "../hooks/use-team-queries";
import type { TeamDeployment, WorkflowState } from "../types/team.types";
import { useState } from "react";
import { RenameTeamModal } from "./rename-team-modal";

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

function getTeamName(deployment: TeamDeployment): string {
  try {
    const cfg =
      typeof deployment.config === "string"
        ? JSON.parse(deployment.config)
        : deployment.config;
    return cfg?.teamName || deployment.templateName;
  } catch {
    return deployment.templateName;
  }
}

export function ActiveDeploymentsTable({
  workspaceId,
  onViewDeployment,
}: Props) {
  const [showTornDown, setShowTornDown] = useState(false);
  const { data: deployments, isLoading } = useTeamDeployments(workspaceId, {
    includeTornDown: showTornDown,
  });
  const pauseMutation = usePauseDeploymentMutation();
  const resumeMutation = useResumeDeploymentMutation();
  const teardownMutation = useTeardownDeploymentMutation();
  const redeployMutation = useRedeployTeamMutation();
  const [renameOpened, setRenameOpened] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{
    deploymentId: string;
    currentName: string;
  } | null>(null);

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
      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          {deployments.length} deployment{deployments.length !== 1 ? "s" : ""}
        </Text>
        <Switch
          size="xs"
          label="Show torn down"
          checked={showTornDown}
          onChange={(e) => setShowTornDown(e.currentTarget.checked)}
        />
      </Group>

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
                  {getTeamName(d)}
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
                    <Menu.Item
                      leftSection={<IconPencil size={14} />}
                      onClick={() => {
                        setRenameTarget({
                          deploymentId: d.id,
                          currentName: getTeamName(d),
                        });
                        setRenameOpened(true);
                      }}
                    >
                      Rename
                    </Menu.Item>
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
                    {d.status === "torn_down" && (
                      <>
                        <Menu.Divider />
                        <Menu.Item
                          leftSection={<IconRotateClockwise size={14} />}
                          onClick={() =>
                            redeployMutation.mutate({
                              sourceDeploymentId: d.id,
                              memoryPolicy: "none",
                            })
                          }
                        >
                          Redeploy fresh
                        </Menu.Item>
                        <Menu.Item
                          leftSection={<IconRotateClockwise size={14} />}
                          onClick={() =>
                            redeployMutation.mutate({
                              sourceDeploymentId: d.id,
                              memoryPolicy: "carry_all",
                            })
                          }
                        >
                          Redeploy w/ memory
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
      <RenameTeamModal
        opened={renameOpened}
        onClose={() => {
          setRenameOpened(false);
          setRenameTarget(null);
        }}
        deploymentId={renameTarget?.deploymentId}
        currentName={renameTarget?.currentName}
      />
    </Stack>
  );
}
