import { useState, useEffect, useRef, useCallback } from "react";
import {
  Stack,
  Title,
  Group,
  Paper,
  Text,
  Select,
  Badge,
  ScrollArea,
  ActionIcon,
  Tooltip,
  Loader,
  Center,
  Box,
  Code,
  Collapse,
  Divider,
} from "@mantine/core";
import {
  IconEye,
  IconEyeOff,
  IconChevronDown,
  IconChevronRight,
  IconCheck,
  IconX,
  IconClock,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useAtom } from "jotai";
import { AgentAvatar } from "./agent-avatar";
import { useWatchableTargets, useRecentActivity } from "../queries/parallax-agent-query";
import { ToolExecutedEvent } from "../services/parallax-agent-service";
import { mcpSocketAtom } from "@/features/websocket/atoms/mcp-socket-atom";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

interface ActivityItem {
  id: string;
  tool: string;
  params?: Record<string, any>;
  success: boolean;
  durationMs: number;
  error?: string;
  resultSummary?: string;
  timestamp: string;
}

export function AgentWatchPanel() {
  const { t } = useTranslation();
  const { data: watchableData, isLoading: isLoadingTargets } = useWatchableTargets();
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [isWatching, setIsWatching] = useState(false);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const [socket] = useAtom(mcpSocketAtom);

  // Get recent activity when agent is selected
  const { data: recentActivity } = useRecentActivity(selectedAgentId || "", 20);

  // Load recent activity into state when it changes
  useEffect(() => {
    if (recentActivity?.activities) {
      const mapped: ActivityItem[] = recentActivity.activities
        .filter((a) => a.activityType === "tool_executed")
        .map((a) => ({
          id: a.id,
          tool: a.metadata?.tool || "unknown",
          params: a.metadata?.params,
          success: a.metadata?.success ?? true,
          durationMs: a.metadata?.durationMs || 0,
          error: a.metadata?.error,
          resultSummary: a.metadata?.resultSummary,
          timestamp: a.createdAt,
        }));
      setActivities(mapped);
    }
  }, [recentActivity]);

  // Handle WebSocket events for live activity
  const handleActivityEvent = useCallback((event: ToolExecutedEvent) => {
    if (event.type !== "tool_executed") return;
    if (!selectedAgentId) return;

    // Check if this event is for the agent we're watching
    const eventUserId = event.data?.agentId || event.userId;
    if (eventUserId !== selectedAgentId) return;

    const newActivity: ActivityItem = {
      id: `live-${Date.now()}-${Math.random()}`,
      tool: event.data.tool,
      params: event.data.params,
      success: event.data.success,
      durationMs: event.data.durationMs,
      error: event.data.error,
      resultSummary: event.data.resultSummary,
      timestamp: event.timestamp,
    };

    setActivities((prev) => [newActivity, ...prev].slice(0, 100)); // Keep last 100

    // Auto-scroll to top
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [selectedAgentId]);

  // Subscribe/unsubscribe to watch events
  useEffect(() => {
    if (!socket || !isWatching || !selectedAgentId) return;

    // Subscribe to watch the selected agent
    socket.emit("mcp:watch", { targetUserId: selectedAgentId });

    // Listen for activity events
    socket.on("mcp:activity", handleActivityEvent);

    return () => {
      // Unsubscribe when stopping watch or changing agent
      socket.emit("mcp:unwatch", { targetUserId: selectedAgentId });
      socket.off("mcp:activity", handleActivityEvent);
    };
  }, [socket, isWatching, selectedAgentId, handleActivityEvent]);

  const toggleExpanded = (id: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectedAgent = watchableData?.agents.find((a) => a.id === selectedAgentId);

  const agentOptions = watchableData?.agents.map((agent) => ({
    value: agent.id,
    label: agent.name,
  })) || [];

  if (isLoadingTargets) {
    return (
      <Center py="xl">
        <Loader />
      </Center>
    );
  }

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={4}>{t("Activity Watch")}</Title>
        {isWatching && (
          <Badge color="green" variant="light" leftSection={<IconEye size={12} />}>
            {t("Live")}
          </Badge>
        )}
      </Group>

      <Paper p="md" withBorder>
        <Stack gap="sm">
          <Group>
            <Select
              placeholder={t("Select an agent to watch")}
              data={agentOptions}
              value={selectedAgentId}
              onChange={(value) => {
                setSelectedAgentId(value);
                setIsWatching(false);
                setActivities([]);
              }}
              style={{ flex: 1 }}
              leftSection={
                selectedAgent ? (
                  <AgentAvatar
                    name={selectedAgent.name}
                    avatarUrl={selectedAgent.avatarUrl}
                    size="xs"
                  />
                ) : undefined
              }
            />
            <Tooltip label={isWatching ? t("Stop watching") : t("Start watching")}>
              <ActionIcon
                variant={isWatching ? "filled" : "light"}
                color={isWatching ? "red" : "blue"}
                size="lg"
                disabled={!selectedAgentId}
                onClick={() => setIsWatching(!isWatching)}
              >
                {isWatching ? <IconEyeOff size={18} /> : <IconEye size={18} />}
              </ActionIcon>
            </Tooltip>
          </Group>

          {selectedAgent && (
            <Group gap="xs">
              <Text size="sm" c="dimmed">
                {t("Watching")}:
              </Text>
              <Badge variant="light">{selectedAgent.name}</Badge>
              <Badge color={selectedAgent.status === "approved" ? "green" : "gray"} size="sm">
                {selectedAgent.status}
              </Badge>
            </Group>
          )}
        </Stack>
      </Paper>

      {selectedAgentId && (
        <Paper p="md" withBorder>
          <Stack gap="sm">
            <Group justify="space-between">
              <Text fw={500}>{t("Activity Feed")}</Text>
              <Text size="xs" c="dimmed">
                {activities.length} {t("events")}
              </Text>
            </Group>
            <Divider />

            {activities.length === 0 ? (
              <Text size="sm" c="dimmed" ta="center" py="md">
                {isWatching
                  ? t("Waiting for activity...")
                  : t("Start watching to see live activity")}
              </Text>
            ) : (
              <ScrollArea h={400} viewportRef={scrollRef}>
                <Stack gap="xs">
                  {activities.map((activity) => (
                    <ActivityItemRow
                      key={activity.id}
                      activity={activity}
                      isExpanded={expandedItems.has(activity.id)}
                      onToggle={() => toggleExpanded(activity.id)}
                    />
                  ))}
                </Stack>
              </ScrollArea>
            )}
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}

interface ActivityItemRowProps {
  activity: ActivityItem;
  isExpanded: boolean;
  onToggle: () => void;
}

function ActivityItemRow({ activity, isExpanded, onToggle }: ActivityItemRowProps) {
  return (
    <Box>
      <Paper
        p="xs"
        withBorder
        style={{ cursor: "pointer" }}
        onClick={onToggle}
      >
        <Group justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap" style={{ flex: 1, overflow: "hidden" }}>
            <ActionIcon variant="subtle" size="xs">
              {isExpanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
            </ActionIcon>
            {activity.success ? (
              <IconCheck size={16} color="var(--mantine-color-green-6)" />
            ) : (
              <IconX size={16} color="var(--mantine-color-red-6)" />
            )}
            <Code style={{ fontSize: "0.75rem" }}>{activity.tool}</Code>
          </Group>
          <Group gap="xs" wrap="nowrap">
            <Tooltip label={`${activity.durationMs}ms`}>
              <Badge size="xs" variant="light" leftSection={<IconClock size={10} />}>
                {activity.durationMs}ms
              </Badge>
            </Tooltip>
            <Text size="xs" c="dimmed">
              {dayjs(activity.timestamp).fromNow()}
            </Text>
          </Group>
        </Group>
      </Paper>

      <Collapse in={isExpanded}>
        <Box pl="lg" pt="xs">
          {activity.resultSummary && (
            <Text size="xs" c="dimmed" mb="xs">
              {activity.resultSummary}
            </Text>
          )}
          {activity.error && (
            <Text size="xs" c="red" mb="xs">
              Error: {activity.error}
            </Text>
          )}
          {activity.params && Object.keys(activity.params).length > 0 && (
            <Box>
              <Text size="xs" fw={500} mb={4}>
                Parameters:
              </Text>
              <Code block style={{ fontSize: "0.7rem", maxHeight: 150, overflow: "auto" }}>
                {JSON.stringify(activity.params, null, 2)}
              </Code>
            </Box>
          )}
        </Box>
      </Collapse>
    </Box>
  );
}
