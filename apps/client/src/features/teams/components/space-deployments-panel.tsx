import {
  Stack,
  Card,
  Group,
  Text,
  Badge,
  Button,
  Loader,
  Menu,
  ActionIcon,
  Switch,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import {
  IconPlus,
  IconDots,
  IconPlayerPause,
  IconPlayerPlay,
  IconTrash,
  IconRotateClockwise,
  IconPencil,
} from "@tabler/icons-react";
import {
  useSpaceDeployments,
  usePauseDeploymentMutation,
  useResumeDeploymentMutation,
  useTeardownDeploymentMutation,
  useRedeployTeamMutation,
  useRenameDeploymentMutation,
} from "../hooks/use-team-queries";
import { DeployTeamModal } from "./deploy-team-modal";
import { DeploymentDetailView } from "./deployment-detail-view";
import { WorkflowProgressBar } from "./workflow-progress-bar";
import type { TeamDeployment, WorkflowState } from "../types/team.types";

interface Props {
  spaceId: string;
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

export function SpaceDeploymentsPanel({ spaceId }: Props) {
  const [showTornDown, setShowTornDown] = useState(false);
  const { data: deployments, isLoading } = useSpaceDeployments(spaceId, {
    includeTornDown: showTornDown,
  });
  const pauseMutation = usePauseDeploymentMutation();
  const resumeMutation = useResumeDeploymentMutation();
  const teardownMutation = useTeardownDeploymentMutation();
  const redeployMutation = useRedeployTeamMutation();
  const renameMutation = useRenameDeploymentMutation();

  const [deployOpened, { open: openDeploy, close: closeDeploy }] =
    useDisclosure(false);
  const [selectedDeployment, setSelectedDeployment] = useState<string | null>(
    null,
  );

  if (selectedDeployment) {
    return (
      <DeploymentDetailView
        deploymentId={selectedDeployment}
        onBack={() => setSelectedDeployment(null)}
      />
    );
  }

  if (isLoading) {
    return (
      <Group justify="center" py="xl">
        <Loader size="sm" />
      </Group>
    );
  }

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Group gap="md">
          <Text size="sm" c="dimmed">
            {(deployments || []).length} deployment
            {(deployments || []).length !== 1 ? "s" : ""} in this space
          </Text>
          <Switch
            size="xs"
            label="Show torn down"
            checked={showTornDown}
            onChange={(e) => setShowTornDown(e.currentTarget.checked)}
          />
        </Group>
        <Button size="xs" leftSection={<IconPlus size={14} />} onClick={openDeploy}>
          Deploy Team
        </Button>
      </Group>

      {(!deployments || deployments.length === 0) && (
        <Text size="sm" c="dimmed" ta="center" py="xl">
          No team deployments in this space yet. Deploy a team to get started.
        </Text>
      )}

      {(deployments || []).map((d: TeamDeployment) => {
        const workflowState = d.workflowState as WorkflowState | null;
        return (
          <Card
            key={d.id}
            withBorder
            radius="md"
            p="md"
            style={{ cursor: "pointer" }}
            onClick={() => setSelectedDeployment(d.id)}
          >
            <Stack gap="sm">
              <Group justify="space-between">
                <Group gap="sm">
                  <Text fw={600} size="sm">
                    {getTeamName(d)}
                  </Text>
                  <Badge
                    size="sm"
                    color={statusColor(d.status)}
                    variant="light"
                  >
                    {d.status}
                  </Badge>
                  {workflowState &&
                    d.status !== "torn_down" && (
                      <Badge size="sm" variant="outline">
                        {workflowState.currentPhase}
                      </Badge>
                    )}
                </Group>
                <div
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <Menu shadow="md" width={160} withinPortal zIndex={1000}>
                    <Menu.Target>
                      <ActionIcon variant="subtle" size="sm">
                        <IconDots size={16} />
                      </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                      {d.status === "active" && (
                        <Menu.Item
                          leftSection={<IconPlayerPause size={14} />}
                          onClick={() => pauseMutation.mutate(d.id)}
                        >
                          Pause
                        </Menu.Item>
                      )}
                      {d.status === "paused" && (
                        <Menu.Item
                          leftSection={<IconPlayerPlay size={14} />}
                          onClick={() => resumeMutation.mutate(d.id)}
                        >
                          Resume
                        </Menu.Item>
                      )}
                      <Menu.Item
                        leftSection={<IconPencil size={14} />}
                        onClick={() => {
                          const currentName = getTeamName(d);
                          const next = window.prompt("Rename team", currentName);
                          if (!next || next.trim() === "" || next.trim() === currentName) return;
                          renameMutation.mutate({
                            deploymentId: d.id,
                            teamName: next.trim(),
                          });
                        }}
                      >
                        Rename
                      </Menu.Item>
                      {d.status !== "torn_down" && (
                        <Menu.Item
                          leftSection={<IconTrash size={14} />}
                          color="red"
                          onClick={() => teardownMutation.mutate(d.id)}
                        >
                          Teardown
                        </Menu.Item>
                      )}
                      {d.status === "torn_down" && (
                        <>
                          <Menu.Item
                            leftSection={<IconRotateClockwise size={14} />}
                            onClick={() =>
                              redeployMutation.mutate({
                                sourceDeploymentId: d.id,
                                spaceId,
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
                                spaceId,
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
                </div>
              </Group>

              {workflowState &&
                Object.keys(workflowState.stepStates).length > 0 && (
                  <WorkflowProgressBar stepStates={workflowState.stepStates} />
                )}

              <Text size="xs" c="dimmed">
                Deployed {new Date(d.createdAt).toLocaleString()}
              </Text>
            </Stack>
          </Card>
        );
      })}

      <DeployTeamModal
        opened={deployOpened}
        onClose={closeDeploy}
        spaceId={spaceId}
      />
    </Stack>
  );
}
