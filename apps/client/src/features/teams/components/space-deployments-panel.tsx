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
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import {
  IconPlus,
  IconDots,
  IconPlayerPause,
  IconPlayerPlay,
  IconTrash,
} from "@tabler/icons-react";
import {
  useSpaceDeployments,
  usePauseDeploymentMutation,
  useResumeDeploymentMutation,
  useTeardownDeploymentMutation,
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

export function SpaceDeploymentsPanel({ spaceId }: Props) {
  const { data: deployments, isLoading } = useSpaceDeployments(spaceId);
  const pauseMutation = usePauseDeploymentMutation();
  const resumeMutation = useResumeDeploymentMutation();
  const teardownMutation = useTeardownDeploymentMutation();

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
        <Text size="sm" c="dimmed">
          {(deployments || []).length} deployment
          {(deployments || []).length !== 1 ? "s" : ""} in this space
        </Text>
        <Button
          size="xs"
          leftSection={<IconPlus size={14} />}
          onClick={openDeploy}
        >
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
                    {d.templateName}
                  </Text>
                  <Badge
                    size="sm"
                    color={statusColor(d.status)}
                    variant="light"
                  >
                    {d.status}
                  </Badge>
                  {workflowState && (
                    <Badge size="sm" variant="outline">
                      {workflowState.currentPhase}
                    </Badge>
                  )}
                </Group>
                <Menu shadow="md" width={140} position="bottom-end">
                  <Menu.Target>
                    <ActionIcon
                      variant="subtle"
                      size="sm"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <IconDots size={16} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    {d.status === "active" ? (
                      <Menu.Item
                        leftSection={<IconPlayerPause size={14} />}
                        onClick={(e) => {
                          e.stopPropagation();
                          pauseMutation.mutate(d.id);
                        }}
                      >
                        Pause
                      </Menu.Item>
                    ) : d.status === "paused" ? (
                      <Menu.Item
                        leftSection={<IconPlayerPlay size={14} />}
                        onClick={(e) => {
                          e.stopPropagation();
                          resumeMutation.mutate(d.id);
                        }}
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
                          onClick={(e) => {
                            e.stopPropagation();
                            teardownMutation.mutate(d.id);
                          }}
                        >
                          Teardown
                        </Menu.Item>
                      </>
                    )}
                  </Menu.Dropdown>
                </Menu>
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
