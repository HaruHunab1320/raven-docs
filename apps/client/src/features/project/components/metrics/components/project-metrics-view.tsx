import React, { useMemo } from "react";
import {
  SimpleGrid,
  Stack,
  Title,
  Card,
  Group,
  Text,
  Badge,
  Progress,
  ThemeIcon,
} from "@mantine/core";
import {
  IconCalendarDue,
  IconCalendarStats,
  IconExclamationCircle,
  IconCircleX,
  IconClock,
  IconHourglass,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { Task } from "../../../types";
import { calculateMetrics } from "../metrics-utils";
import { TaskStatusChart } from "./task-status-chart";
import { MetricCard } from "./metric-card";

// Define status and priority colors
const statusColors = {
  todo: "gray",
  in_progress: "blue",
  in_review: "indigo",
  done: "green",
  blocked: "red",
};

const priorityColors = {
  urgent: "red",
  high: "orange",
  medium: "blue",
  low: "gray",
};

interface ProjectMetricsViewProps {
  tasks: Task[];
  users: any[];
}

export function ProjectMetricsView({ tasks, users }: ProjectMetricsViewProps) {
  const { t } = useTranslation();

  // Calculate metrics using the utility function
  const metrics = useMemo(() => calculateMetrics(tasks, users), [tasks, users]);

  // Extract tasks by status for the status chart
  const tasksByStatus = {
    todo: metrics.tasksByStatus["todo"] || 0,
    in_progress: metrics.tasksByStatus["in_progress"] || 0,
    in_review: metrics.tasksByStatus["in_review"] || 0,
    done: metrics.tasksByStatus["done"] || 0,
    blocked: metrics.tasksByStatus["blocked"] || 0,
  };

  return (
    <Stack>
      <Title order={3} mb="md">
        {t("Project Overview")}
      </Title>

      {/* Main metrics */}
      <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }}>
        {/* Task Status Chart */}
        <TaskStatusChart
          totalTasks={metrics.totalTasks}
          tasksByStatus={tasksByStatus}
          completionPercentage={metrics.completionPercentage}
          statusColors={statusColors}
        />

        {/* Priority Breakdown */}
        <Card withBorder padding="lg" radius="md">
          <Group justify="space-between">
            <Text size="lg" fw={500}>
              {t("Priority Breakdown")}
            </Text>
            <IconExclamationCircle size={22} />
          </Group>
          <Stack mt="md" gap="xs">
            {Object.entries(priorityColors).map(([priority, color]) => (
              <React.Fragment key={priority}>
                <Group justify="space-between">
                  <Text size="sm">
                    {t(priority.charAt(0).toUpperCase() + priority.slice(1))}
                  </Text>
                  <Badge color={color}>
                    {metrics.tasksByPriority[priority] || 0}
                  </Badge>
                </Group>
                <Progress
                  value={
                    metrics.totalTasks > 0
                      ? ((metrics.tasksByPriority[priority] || 0) /
                          metrics.totalTasks) *
                        100
                      : 0
                  }
                  color={color}
                  size="sm"
                />
              </React.Fragment>
            ))}
          </Stack>
        </Card>

        {/* Deadlines */}
        <Card withBorder padding="lg" radius="md">
          <Group justify="space-between">
            <Text size="lg" fw={500}>
              {t("Deadlines")}
            </Text>
            <IconCalendarDue size={22} />
          </Group>

          <Stack mt="md">
            <Group justify="space-between">
              <Group>
                <ThemeIcon color="red" variant="light">
                  <IconCircleX size={18} />
                </ThemeIcon>
                <div>
                  <Text>{t("Overdue")}</Text>
                  <Text size="xs" c="dimmed">
                    {t("Needs immediate attention")}
                  </Text>
                </div>
              </Group>
              <Badge color="red" size="lg">
                {metrics.overdueTasks.length}
              </Badge>
            </Group>

            <Group justify="space-between" mt="sm">
              <Group>
                <ThemeIcon color="yellow" variant="light">
                  <IconClock size={18} />
                </ThemeIcon>
                <div>
                  <Text>{t("Due Soon")}</Text>
                  <Text size="xs" c="dimmed">
                    {t("Next 7 days")}
                  </Text>
                </div>
              </Group>
              <Badge color="yellow" size="lg">
                {metrics.upcomingDeadlines.length}
              </Badge>
            </Group>

            <Group justify="space-between" mt="sm">
              <Group>
                <ThemeIcon color="gray" variant="light">
                  <IconHourglass size={18} />
                </ThemeIcon>
                <div>
                  <Text>{t("No Due Date")}</Text>
                  <Text size="xs" c="dimmed">
                    {t("Not scheduled")}
                  </Text>
                </div>
              </Group>
              <Badge color="gray" size="lg">
                {metrics.tasksWithoutDueDate}
              </Badge>
            </Group>
          </Stack>
        </Card>

        {/* Activity */}
        <Card withBorder padding="lg" radius="md">
          <Group justify="space-between">
            <Text size="lg" fw={500}>
              {t("Activity")}
            </Text>
            <IconCalendarStats size={22} />
          </Group>

          <Stack mt="md" gap="md">
            <Group justify="space-between">
              <Text>{t("Completion Rate")}</Text>
              <Text fw={700} size="xl">
                {Math.round(metrics.completionPercentage)}%
              </Text>
            </Group>

            <div>
              <Text>{t("Recently Completed")}</Text>
              <Group justify="space-between" mt={4}>
                <Text size="sm" c="dimmed">
                  {t("Last 7 days")}
                </Text>
                <Badge color="green">{metrics.recentlyCompletedTasks}</Badge>
              </Group>
            </div>

            <div>
              <Text>{t("Recently Created")}</Text>
              <Group justify="space-between" mt={4}>
                <Text size="sm" c="dimmed">
                  {t("Last 30 days")}
                </Text>
                <Badge color="blue">{metrics.recentlyCreatedTasks}</Badge>
              </Group>
            </div>
          </Stack>
        </Card>
      </SimpleGrid>
    </Stack>
  );
}
