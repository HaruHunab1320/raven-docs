import {
  Paper,
  Text,
  Stack,
  Group,
  Badge,
  ScrollArea,
  Loader,
  Center,
  Timeline,
  ThemeIcon,
  Title,
} from "@mantine/core";
import {
  IconRobot,
  IconCheck,
  IconX,
  IconArrowRight,
  IconFileText,
  IconCheckbox,
  IconFolder,
  IconActivity,
} from "@tabler/icons-react";
import { useWorkspaceActivity, useAgentActivity } from "../queries/parallax-agent-query";
import { ParallaxAgentActivity } from "../services/parallax-agent-service";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

// Activity type icons and colors
const ACTIVITY_CONFIG: Record<
  string,
  { icon: React.ReactNode; color: string; label: string }
> = {
  access_requested: {
    icon: <IconRobot size={12} />,
    color: "blue",
    label: "Access Requested",
  },
  access_approved: {
    icon: <IconCheck size={12} />,
    color: "green",
    label: "Access Approved",
  },
  access_denied: {
    icon: <IconX size={12} />,
    color: "red",
    label: "Access Denied",
  },
  access_revoked: {
    icon: <IconX size={12} />,
    color: "orange",
    label: "Access Revoked",
  },
  assigned_to_project: {
    icon: <IconFolder size={12} />,
    color: "violet",
    label: "Assigned to Project",
  },
  assigned_to_task: {
    icon: <IconCheckbox size={12} />,
    color: "cyan",
    label: "Assigned to Task",
  },
  unassigned: {
    icon: <IconArrowRight size={12} />,
    color: "gray",
    label: "Unassigned",
  },
  task_claimed: {
    icon: <IconCheckbox size={12} />,
    color: "teal",
    label: "Task Claimed",
  },
  task_completed: {
    icon: <IconCheck size={12} />,
    color: "green",
    label: "Task Completed",
  },
  page_created: {
    icon: <IconFileText size={12} />,
    color: "blue",
    label: "Page Created",
  },
  page_updated: {
    icon: <IconFileText size={12} />,
    color: "indigo",
    label: "Page Updated",
  },
  status_change: {
    icon: <IconActivity size={12} />,
    color: "yellow",
    label: "Status Changed",
  },
  task_delegated: {
    icon: <IconArrowRight size={12} />,
    color: "grape",
    label: "Task Delegated",
  },
  task_received: {
    icon: <IconArrowRight size={12} />,
    color: "pink",
    label: "Task Received",
  },
};

function getActivityConfig(activityType: string) {
  return (
    ACTIVITY_CONFIG[activityType] || {
      icon: <IconActivity size={12} />,
      color: "gray",
      label: activityType.replace(/_/g, " "),
    }
  );
}

interface AgentActivityFeedProps {
  agentId?: string;
  limit?: number;
  showTitle?: boolean;
}

export function AgentActivityFeed({
  agentId,
  limit = 50,
  showTitle = true,
}: AgentActivityFeedProps) {
  const { t } = useTranslation();

  // Use appropriate query based on whether we're filtering by agent
  const workspaceActivityQuery = useWorkspaceActivity(limit);
  const agentActivityQuery = useAgentActivity(agentId || "", limit);

  const { data: activities, isLoading } = agentId
    ? agentActivityQuery
    : workspaceActivityQuery;

  if (isLoading) {
    return (
      <Center py="xl">
        <Loader />
      </Center>
    );
  }

  if (!activities || activities.length === 0) {
    return (
      <Paper p="lg" withBorder>
        <Text size="sm" c="dimmed" ta="center">
          {t("No agent activity recorded yet")}
        </Text>
      </Paper>
    );
  }

  return (
    <Stack gap="md">
      {showTitle && (
        <Title order={4}>
          {agentId ? t("Agent Activity") : t("Workspace Agent Activity")}
        </Title>
      )}
      <ScrollArea h={400}>
        <Timeline active={activities.length - 1} bulletSize={24} lineWidth={2}>
          {activities.map((activity) => {
            const config = getActivityConfig(activity.activityType);
            return (
              <Timeline.Item
                key={activity.id}
                bullet={
                  <ThemeIcon size={24} radius="xl" color={config.color}>
                    {config.icon}
                  </ThemeIcon>
                }
                title={
                  <Group gap="xs">
                    <Text size="sm" fw={500}>
                      {t(config.label)}
                    </Text>
                    <Badge size="xs" variant="light" color={config.color}>
                      {activity.activityType}
                    </Badge>
                  </Group>
                }
              >
                <ActivityDetails activity={activity} />
                <Text size="xs" c="dimmed" mt={4}>
                  {dayjs(activity.createdAt).fromNow()}
                </Text>
              </Timeline.Item>
            );
          })}
        </Timeline>
      </ScrollArea>
    </Stack>
  );
}

function ActivityDetails({ activity }: { activity: ParallaxAgentActivity }) {
  const { t } = useTranslation();
  const metadata = activity.metadata || {};

  return (
    <Stack gap={4}>
      {activity.description && (
        <Text size="sm" c="dimmed">
          {activity.description}
        </Text>
      )}

      {/* Show relevant metadata based on activity type */}
      {metadata.agentName && (
        <Text size="xs">
          {t("Agent")}: {metadata.agentName}
        </Text>
      )}
      {metadata.projectId && (
        <Text size="xs">
          {t("Project")}: {metadata.projectId}
        </Text>
      )}
      {metadata.taskId && (
        <Text size="xs">
          {t("Task")}: {metadata.taskId}
        </Text>
      )}
      {metadata.reason && (
        <Text size="xs" c="dimmed">
          {t("Reason")}: {metadata.reason}
        </Text>
      )}
      {metadata.newStatus && (
        <Text size="xs">
          {t("New Status")}: {metadata.newStatus}
        </Text>
      )}
      {metadata.toAgentName && (
        <Text size="xs">
          {t("Delegated to")}: {metadata.toAgentName}
        </Text>
      )}
      {metadata.fromAgentName && (
        <Text size="xs">
          {t("Received from")}: {metadata.fromAgentName}
        </Text>
      )}
    </Stack>
  );
}
