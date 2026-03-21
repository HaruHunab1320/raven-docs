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
  Collapse,
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
} from "../hooks/use-team-queries";
import { useTeamLiveUpdates } from "../hooks/use-team-live-updates";
import { useActiveExperiments } from "@/features/intelligence/hooks/use-intelligence-queries";
import { DeployTeamModal } from "./deploy-team-modal";
import { DeploymentDetailView } from "./deployment-detail-view";
import { RenameTeamModal } from "./rename-team-modal";
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

function getTargetTaskId(deployment: TeamDeployment): string {
  try {
    const cfg =
      typeof deployment.config === "string"
        ? JSON.parse(deployment.config)
        : deployment.config;
    return cfg?.targetTaskId || "";
  } catch {
    return "";
  }
}

function getTargetExperimentId(deployment: TeamDeployment): string {
  try {
    const cfg =
      typeof deployment.config === "string"
        ? JSON.parse(deployment.config)
        : deployment.config;
    return cfg?.targetExperimentId || "";
  } catch {
    return "";
  }
}

export function SpaceDeploymentsPanel({ spaceId }: Props) {
  useTeamLiveUpdates(spaceId);
  const [showTornDown, setShowTornDown] = useState(false);
  const { data: deployments, isLoading } = useSpaceDeployments(spaceId, {
    includeTornDown: showTornDown,
  });
  const { data: experiments } = useActiveExperiments(spaceId);
  const pauseMutation = usePauseDeploymentMutation();
  const resumeMutation = useResumeDeploymentMutation();
  const teardownMutation = useTeardownDeploymentMutation();
  const redeployMutation = useRedeployTeamMutation();

  const [deployOpened, { open: openDeploy, close: closeDeploy }] =
    useDisclosure(false);
  const [renameOpened, { open: openRename, close: closeRename }] =
    useDisclosure(false);
  const [expandedDeploymentId, setExpandedDeploymentId] = useState<
    string | null
  >(null);
  const [renameTarget, setRenameTarget] = useState<{
    deploymentId: string;
    currentName: string;
  } | null>(null);
  const experimentNameById = new Map(
    (experiments || []).map((e) => [e.id, e.title || "Untitled experiment"]),
  );

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
        const targetExperimentId = getTargetExperimentId(d);
        const targetExperimentLabel = targetExperimentId
          ? experimentNameById.get(targetExperimentId) || "Untitled experiment"
          : "";
        return (
          <Card
            key={d.id}
            withBorder
            radius="md"
            p="md"
            style={{ cursor: "pointer" }}
            onClick={() =>
              setExpandedDeploymentId((prev) => (prev === d.id ? null : d.id))
            }
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
                  {getTargetTaskId(d) && (
                    <Badge size="sm" variant="outline" color="orange">
                      task-scoped
                    </Badge>
                  )}
                  {targetExperimentId && (
                    <Badge size="sm" variant="outline" color="orange">
                      experiment-scoped
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
                          setRenameTarget({
                            deploymentId: d.id,
                            currentName: getTeamName(d),
                          });
                          openRename();
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
              {targetExperimentId && (
                <Text size="xs" c="dimmed">
                  Target experiment: {targetExperimentLabel} (
                  {targetExperimentId})
                </Text>
              )}

              <Collapse in={expandedDeploymentId === d.id}>
                <div
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <Card
                    withBorder
                    radius="md"
                    p="sm"
                    mt="sm"
                    style={{ cursor: "default" }}
                  >
                    <DeploymentDetailView deploymentId={d.id} compact />
                  </Card>
                </div>
              </Collapse>
            </Stack>
          </Card>
        );
      })}

      <DeployTeamModal
        opened={deployOpened}
        onClose={closeDeploy}
        spaceId={spaceId}
      />
      <RenameTeamModal
        opened={renameOpened}
        onClose={closeRename}
        deploymentId={renameTarget?.deploymentId}
        currentName={renameTarget?.currentName}
      />
    </Stack>
  );
}
