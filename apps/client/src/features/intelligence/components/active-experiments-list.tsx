import {
  Card,
  Stack,
  Text,
  Badge,
  Group,
  SegmentedControl,
  Loader,
  ActionIcon,
  Table,
} from "@mantine/core";
import {
  IconPlus,
  IconPlayerPlay,
  IconUsersGroup,
  IconLayoutList,
  IconLayoutGrid,
} from "@tabler/icons-react";
import { useMemo, useState } from "react";
import {
  useActiveExperiments,
  useHypothesesList,
} from "../hooks/use-intelligence-queries";
import { formattedDate } from "@/lib/time";
import { PagePreviewDrawer } from "./page-preview-drawer";

interface Props {
  spaceId: string;
  onNewExperiment?: () => void;
  onLaunchSwarm?: (experimentId: string, title: string, repoUrl?: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
  planned: "gray",
  running: "blue",
  completed: "green",
  failed: "red",
};

export function ActiveExperimentsList({ spaceId, onNewExperiment, onLaunchSwarm }: Props) {
  const { data: experiments, isLoading } = useActiveExperiments(spaceId);
  const { data: hypotheses } = useHypothesesList(spaceId);
  const [filter, setFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"card" | "table">("card");
  const [previewPageId, setPreviewPageId] = useState<string | null>(null);
  const activeSwarmStatuses = new Set([
    "pending",
    "provisioning",
    "spawning",
    "running",
    "capturing",
    "finalizing",
  ]);

  const hypothesisMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const h of hypotheses ?? []) {
      map.set(h.id, h.title || "Untitled Hypothesis");
    }
    return map;
  }, [hypotheses]);

  const getEffectiveStatus = (exp: (typeof experiments extends (infer T)[] | undefined ? T : never)) => {
    const baseStatus = exp.metadata?.status || "unknown";
    const hasActiveTeamExecution = !!exp.activeTeam && (
      (exp.activeTeam.swarmStatus &&
        activeSwarmStatuses.has(exp.activeTeam.swarmStatus)) ||
      exp.activeTeam.status === "active"
    );
    return baseStatus === "planned" && hasActiveTeamExecution
      ? "running"
      : baseStatus;
  };

  const filtered = (experiments ?? []).filter((exp) => {
    const effectiveStatus = getEffectiveStatus(exp);
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
                value={viewMode}
                onChange={(v) => setViewMode(v as "card" | "table")}
                data={[
                  { value: "card", label: <IconLayoutGrid size={14} /> },
                  { value: "table", label: <IconLayoutList size={14} /> },
                ]}
              />
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
        ) : viewMode === "table" ? (
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Title</Table.Th>
                <Table.Th>Hypothesis</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Team</Table.Th>
                <Table.Th>Updated</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filtered.map((exp) => {
                const status = getEffectiveStatus(exp);
                const hypothesisTitle = exp.metadata?.hypothesisId
                  ? hypothesisMap.get(exp.metadata.hypothesisId as string)
                  : undefined;
                return (
                  <Table.Tr
                    key={exp.id}
                    style={{ cursor: "pointer" }}
                    onClick={() => setPreviewPageId(exp.id)}
                  >
                    <Table.Td>
                      <Text size="sm" lineClamp={1}>
                        {exp.title || "Untitled"}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      {hypothesisTitle ? (
                        <Text size="xs" c="dimmed" lineClamp={1}>
                          {hypothesisTitle}
                        </Text>
                      ) : (
                        <Text size="xs" c="dimmed">—</Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Badge
                        size="xs"
                        variant="light"
                        color={STATUS_COLORS[status] || "gray"}
                      >
                        {status}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      {exp.activeTeam ? (
                        <Text size="xs" c="dimmed">
                          {exp.activeTeam.teamName}
                        </Text>
                      ) : (
                        <Text size="xs" c="dimmed">—</Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" c="dimmed">
                        {formattedDate(new Date(exp.updatedAt))}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        ) : (
          <Stack gap="xs">
            {filtered.map((exp) => {
              const status = getEffectiveStatus(exp);
              const hypothesisTitle = exp.metadata?.hypothesisId
                ? hypothesisMap.get(exp.metadata.hypothesisId as string)
                : undefined;
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
                      {hypothesisTitle && (
                        <Text size="xs" c="violet">
                          {hypothesisTitle}
                        </Text>
                      )}
                      {!hypothesisTitle && exp.metadata?.hypothesisId && (
                        <Text size="xs" c="dimmed">
                          Tests hypothesis
                        </Text>
                      )}
                      {exp.metadata?.results && (
                        <Text size="xs" c="dimmed" lineClamp={1}>
                          {typeof exp.metadata.results === "string"
                            ? exp.metadata.results.slice(0, 120)
                            : JSON.stringify(exp.metadata.results).slice(0, 120)}
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
                              onLaunchSwarm(exp.id, exp.title || "Untitled", exp.metadata?.repoUrl as string | undefined);
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
