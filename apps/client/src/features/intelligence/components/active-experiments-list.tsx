import {
  Card,
  Stack,
  Text,
  Badge,
  Group,
  SegmentedControl,
  Loader,
  ActionIcon,
} from "@mantine/core";
import { IconPlus, IconPlayerPlay, IconUsersGroup } from "@tabler/icons-react";
import { useState } from "react";
import { useActiveExperiments } from "../hooks/use-intelligence-queries";
import { formattedDate } from "@/lib/time";
import { PagePreviewDrawer } from "./page-preview-drawer";

interface Props {
  spaceId: string;
  onNewExperiment?: () => void;
  onLaunchSwarm?: (experimentId: string, title: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
  planned: "gray",
  running: "blue",
  completed: "green",
  failed: "red",
};

export function ActiveExperimentsList({ spaceId, onNewExperiment, onLaunchSwarm }: Props) {
  const { data: experiments, isLoading } = useActiveExperiments(spaceId);
  const [filter, setFilter] = useState("all");
  const [previewPageId, setPreviewPageId] = useState<string | null>(null);
  const activeSwarmStatuses = new Set([
    "pending",
    "provisioning",
    "spawning",
    "running",
    "capturing",
    "finalizing",
  ]);

  const filtered = (experiments ?? []).filter((exp) => {
    const baseStatus = exp.metadata?.status || "unknown";
    const hasActiveTeamExecution = !!exp.activeTeam && (
      (exp.activeTeam.swarmStatus &&
        activeSwarmStatuses.has(exp.activeTeam.swarmStatus)) ||
      exp.activeTeam.status === "active"
    );
    const effectiveStatus =
      baseStatus === "planned" && hasActiveTeamExecution
        ? "running"
        : baseStatus;
    if (filter === "all") return true;
    return effectiveStatus === filter;
  });

  return (
    <>
      <Card withBorder radius="md" p="md">
        <Stack gap="sm">
          <Group justify="space-between">
            <Text fw={600}>Experiments</Text>
            <Group gap="xs">
              {onNewExperiment && (
                <ActionIcon
                  variant="subtle"
                  size="sm"
                  onClick={onNewExperiment}
                  aria-label="New Experiment"
                >
                  <IconPlus size={14} />
                </ActionIcon>
              )}
              <SegmentedControl
                size="xs"
                value={filter}
                onChange={setFilter}
                data={[
                  { value: "all", label: "All" },
                  { value: "running", label: "Running" },
                  { value: "planned", label: "Planned" },
                  { value: "completed", label: "Completed" },
                ]}
              />
            </Group>
          </Group>

        {isLoading ? (
          <Group justify="center" py="md">
            <Loader size="sm" />
          </Group>
        ) : filtered.length === 0 ? (
          <Text size="sm" c="dimmed">No experiments found.</Text>
        ) : (
          <Stack gap="xs">
            {filtered.map((exp) => {
              const baseStatus = exp.metadata?.status || "unknown";
              const hasActiveTeamExecution = !!exp.activeTeam && (
                (exp.activeTeam.swarmStatus &&
                  activeSwarmStatuses.has(exp.activeTeam.swarmStatus)) ||
                exp.activeTeam.status === "active"
              );
              const status =
                baseStatus === "planned" && hasActiveTeamExecution
                  ? "running"
                  : baseStatus;
              return (
                <Card
                  key={exp.id}
                  withBorder
                  radius="sm"
                  p="sm"
                  style={{ cursor: "pointer" }}
                  onClick={() => setPreviewPageId(exp.id)}
                >
                  <Group justify="space-between" align="flex-start" wrap="nowrap">
                    <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                      <Text fw={500} size="sm">{exp.title || "Untitled"}</Text>
                      {exp.metadata?.hypothesisId && (
                        <Text size="xs" c="dimmed">
                          Tests hypothesis
                        </Text>
                      )}
                      {exp.activeTeam && (
                        <Group gap={6}>
                          <IconUsersGroup size={12} />
                          <Text size="xs" c="dimmed">
                            Team: {exp.activeTeam.teamName}
                          </Text>
                        </Group>
                      )}
                    </Stack>
                    <Stack gap={4} align="flex-end" style={{ minWidth: 170, flexShrink: 0 }}>
                      <Group gap="xs" wrap="nowrap">
                        {onLaunchSwarm && (
                          <ActionIcon
                            variant="subtle"
                            size="xs"
                            color="blue"
                            onClick={(e) => {
                              e.stopPropagation();
                              onLaunchSwarm(exp.id, exp.title || "Untitled");
                            }}
                            aria-label="Launch agent"
                          >
                            <IconPlayerPlay size={12} />
                          </ActionIcon>
                        )}
                        <Badge
                          size="xs"
                          variant="light"
                          color={STATUS_COLORS[status] || "gray"}
                        >
                          {status}
                        </Badge>
                      </Group>
                      <Text size="xs" c="dimmed">
                        {formattedDate(new Date(exp.updatedAt))}
                      </Text>
                    </Stack>
                  </Group>
                </Card>
              );
            })}
          </Stack>
        )}
        </Stack>
      </Card>

      <PagePreviewDrawer
        pageId={previewPageId}
        spaceId={spaceId}
        opened={previewPageId !== null}
        onClose={() => setPreviewPageId(null)}
      />
    </>
  );
}
