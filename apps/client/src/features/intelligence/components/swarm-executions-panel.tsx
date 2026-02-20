import {
  Card,
  Stack,
  Text,
  Badge,
  Group,
  Button,
  Loader,
  Collapse,
  Code,
  ScrollArea,
  ActionIcon,
} from "@mantine/core";
import {
  IconPlayerStop,
  IconChevronDown,
  IconChevronRight,
  IconRobot,
} from "@tabler/icons-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useSwarmExecutions,
  useStopSwarmMutation,
  useSwarmLogs,
} from "../hooks/use-swarm-queries";
import { formattedDate } from "@/lib/time";
import type { SwarmExecution } from "../services/swarm-service";

interface Props {
  spaceId: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "gray",
  provisioning: "yellow",
  spawning: "yellow",
  running: "blue",
  capturing: "cyan",
  finalizing: "cyan",
  completed: "green",
  failed: "red",
  cancelled: "orange",
};

const ACTIVE_STATUSES = new Set([
  "pending",
  "provisioning",
  "spawning",
  "running",
  "capturing",
  "finalizing",
]);

function ExecutionLogs({ executionId }: { executionId: string }) {
  const { data, isLoading } = useSwarmLogs(executionId, 50);

  if (isLoading) return <Loader size="xs" />;
  if (!data?.logs?.length) {
    return (
      <Text size="xs" c="dimmed">
        No logs available.
      </Text>
    );
  }

  return (
    <ScrollArea h={200}>
      <Code block style={{ fontSize: 11 }}>
        {data.logs.map((l) => l.content).join("\n")}
      </Code>
    </ScrollArea>
  );
}

function ExecutionRow({ execution }: { execution: SwarmExecution }) {
  const navigate = useNavigate();
  const stopMutation = useStopSwarmMutation();
  const [logsOpen, setLogsOpen] = useState(false);
  const isActive = ACTIVE_STATUSES.has(execution.status);

  const elapsed = execution.startedAt
    ? execution.completedAt
      ? `${Math.round((new Date(execution.completedAt).getTime() - new Date(execution.startedAt).getTime()) / 1000)}s`
      : "running..."
    : null;

  return (
    <Card withBorder radius="sm" p="sm">
      <Stack gap={6}>
        <Group justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
            <IconRobot size={16} style={{ flexShrink: 0 }} />
            <Text
              fw={500}
              size="sm"
              truncate
              style={{ cursor: execution.experimentId ? "pointer" : undefined }}
              onClick={() => {
                if (execution.experimentId) {
                  navigate(`/p/${execution.experimentId}`);
                }
              }}
            >
              {execution.taskDescription}
            </Text>
          </Group>
          <Group gap="xs" wrap="nowrap">
            <Badge size="xs" variant="light" color="gray">
              {execution.agentType}
            </Badge>
            <Badge
              size="xs"
              variant="light"
              color={STATUS_COLORS[execution.status] || "gray"}
            >
              {execution.status}
            </Badge>
            {elapsed && (
              <Text size="xs" c="dimmed">
                {elapsed}
              </Text>
            )}
            {isActive && (
              <ActionIcon
                variant="subtle"
                size="xs"
                color="red"
                onClick={() => stopMutation.mutate(execution.id)}
                loading={stopMutation.isPending}
                aria-label="Stop execution"
              >
                <IconPlayerStop size={12} />
              </ActionIcon>
            )}
          </Group>
        </Group>

        {execution.errorMessage && (
          <Text size="xs" c="red">
            {execution.errorMessage}
          </Text>
        )}

        <Group gap={4}>
          <ActionIcon
            variant="subtle"
            size="xs"
            onClick={() => setLogsOpen((v) => !v)}
            aria-label="Toggle logs"
          >
            {logsOpen ? (
              <IconChevronDown size={12} />
            ) : (
              <IconChevronRight size={12} />
            )}
          </ActionIcon>
          <Text
            size="xs"
            c="dimmed"
            style={{ cursor: "pointer" }}
            onClick={() => setLogsOpen((v) => !v)}
          >
            View Logs
          </Text>
          {execution.createdAt && (
            <Text size="xs" c="dimmed" ml="auto">
              {formattedDate(new Date(execution.createdAt))}
            </Text>
          )}
        </Group>

        <Collapse in={logsOpen}>
          <ExecutionLogs executionId={execution.id} />
        </Collapse>
      </Stack>
    </Card>
  );
}

export function SwarmExecutionsPanel({ spaceId }: Props) {
  const { data, isLoading } = useSwarmExecutions(spaceId);
  const executions = data?.executions ?? [];

  return (
    <Card withBorder radius="md" p="md">
      <Stack gap="sm">
        <Group justify="space-between">
          <Text fw={600}>Agent Executions</Text>
          {executions.length > 0 && (
            <Badge size="xs" variant="light">
              {executions.filter((e) => ACTIVE_STATUSES.has(e.status)).length}{" "}
              active
            </Badge>
          )}
        </Group>

        {isLoading ? (
          <Group justify="center" py="md">
            <Loader size="sm" />
          </Group>
        ) : executions.length === 0 ? (
          <Text size="sm" c="dimmed">
            No agent executions yet. Launch an agent from the menu above or from
            an experiment.
          </Text>
        ) : (
          <Stack gap="xs">
            {executions.map((execution) => (
              <ExecutionRow key={execution.id} execution={execution} />
            ))}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}
