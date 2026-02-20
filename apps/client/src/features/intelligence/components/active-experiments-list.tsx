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
import { IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useActiveExperiments } from "../hooks/use-intelligence-queries";
import { formattedDate } from "@/lib/time";

interface Props {
  spaceId: string;
  onNewExperiment?: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  planned: "gray",
  running: "blue",
  completed: "green",
  failed: "red",
};

export function ActiveExperimentsList({ spaceId, onNewExperiment }: Props) {
  const navigate = useNavigate();
  const { data: experiments, isLoading } = useActiveExperiments(spaceId);
  const [filter, setFilter] = useState("all");

  const filtered = (experiments ?? []).filter((exp) => {
    if (filter === "all") return true;
    const status = exp.metadata?.status;
    return status === filter;
  });

  return (
    <Card withBorder radius="md" p="md">
      <Stack gap="sm">
        <Group justify="space-between">
          <Text fw={600}>Experiments</Text>
          <Group gap="xs">
          {onNewExperiment && (
            <ActionIcon variant="subtle" size="sm" onClick={onNewExperiment} aria-label="New Experiment">
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
              const status = exp.metadata?.status || "unknown";
              return (
                <Card
                  key={exp.id}
                  withBorder
                  radius="sm"
                  p="sm"
                  style={{ cursor: "pointer" }}
                  onClick={() => navigate(`/p/${exp.slugId || exp.id}`)}
                >
                  <Group justify="space-between">
                    <Stack gap={2}>
                      <Text fw={500} size="sm">{exp.title || "Untitled"}</Text>
                      {exp.metadata?.hypothesisId && (
                        <Text size="xs" c="dimmed">
                          Tests hypothesis
                        </Text>
                      )}
                    </Stack>
                    <Group gap="xs">
                      <Badge
                        size="xs"
                        variant="light"
                        color={STATUS_COLORS[status] || "gray"}
                      >
                        {status}
                      </Badge>
                      <Text size="xs" c="dimmed">
                        {formattedDate(new Date(exp.updatedAt))}
                      </Text>
                    </Group>
                  </Group>
                </Card>
              );
            })}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}
