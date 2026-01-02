import {
  SimpleGrid,
  Card,
  Group,
  Text,
  Badge,
  RingProgress,
  Progress,
  useMantineTheme,
  Box,
} from "@mantine/core";
import {
  IconClipboard,
  IconCheckbox,
  IconAlertCircle,
  IconCalendarTime,
  IconChevronRight,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

interface TaskStats {
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  blockedTasks: number;
  highPriorityTasks: number;
  dueSoonTasks: number;
  overdueTasks: number;
  tasksWithDueDate: number;
  completionRate: number;
}

interface DashboardMetricsProps {
  taskStats: TaskStats;
  projectCount: number;
  spaceId?: string;
  projectId?: string;
}

export function DashboardMetrics({
  taskStats,
  projectCount,
  spaceId,
  projectId,
}: DashboardMetricsProps) {
  const { t } = useTranslation();
  const theme = useMantineTheme();
  const navigate = useNavigate();

  const handleNavigateToTasks = (filter: string, value?: string) => {
    if (!spaceId) return;

    const baseUrl = projectId
      ? `/spaces/${spaceId}/projects/${projectId}/tasks`
      : `/spaces/${spaceId}/tasks`;

    let queryParams = "";

    if (filter) {
      queryParams = `?filter=${filter}`;
      if (value) {
        queryParams += `&value=${value}`;
      }
    }

    navigate(`${baseUrl}${queryParams}`);
  };

  return (
    <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }}>
      {/* Total Tasks Card */}
      <Card withBorder p="md" radius="md">
        <Box
          style={{ cursor: "pointer" }}
          onClick={() => handleNavigateToTasks("all")}
        >
          <Group justify="space-between">
            <Text size="xs" c="dimmed" fw={700} tt="uppercase">
              {t("Total Tasks")}
            </Text>
            <Group gap="xs">
              <IconClipboard size={20} color={theme.colors.blue[6]} />
              <IconChevronRight size={16} color={theme.colors.gray[5]} />
            </Group>
          </Group>
          <Group justify="space-between" mt="xs">
            <Text size="xl" fw={700}>
              {taskStats.totalTasks}
            </Text>
            <Badge color="blue" variant="light">
              {projectCount} {t("Projects")}
            </Badge>
          </Group>
          <Text size="xs" c="dimmed" mt="md">
            <span>
              {taskStats.completedTasks} {t("completed")}
            </span>
            <span> • </span>
            <span>
              {taskStats.inProgressTasks} {t("in progress")}
            </span>
          </Text>
        </Box>
      </Card>

      {/* Completion Rate Card */}
      <Card withBorder p="md" radius="md">
        <Box
          style={{ cursor: "pointer" }}
          onClick={() => handleNavigateToTasks("status", "done")}
        >
          <Group justify="space-between">
            <Text size="xs" c="dimmed" fw={700} tt="uppercase">
              {t("Completion Rate")}
            </Text>
            <Group gap="xs">
              <IconCheckbox size={20} color={theme.colors.green[6]} />
              <IconChevronRight size={16} color={theme.colors.gray[5]} />
            </Group>
          </Group>
          <Group justify="space-between" mt="xs" wrap="nowrap">
            <Text size="xl" fw={700}>
              {taskStats.completionRate.toFixed(0)}%
            </Text>
            <RingProgress
              size={50}
              roundCaps
              thickness={4}
              sections={[
                {
                  value: taskStats.completionRate,
                  color: theme.colors.green[6],
                },
              ]}
            />
          </Group>
          <Progress
            value={taskStats.completionRate}
            color="green"
            size="sm"
            mt="md"
          />
        </Box>
      </Card>

      {/* Priority Tasks Card */}
      <Card withBorder p="md" radius="md">
        <Box
          style={{ cursor: "pointer" }}
          onClick={() => handleNavigateToTasks("priority", "high")}
        >
          <Group justify="space-between">
            <Text size="xs" c="dimmed" fw={700} tt="uppercase">
              {t("Priority Tasks")}
            </Text>
            <Group gap="xs">
              <IconAlertCircle size={20} color={theme.colors.orange[6]} />
              <IconChevronRight size={16} color={theme.colors.gray[5]} />
            </Group>
          </Group>
          <Group justify="space-between" mt="xs">
            <Text size="xl" fw={700}>
              {taskStats.highPriorityTasks}
            </Text>
            <Badge color="orange" variant="light">
              {(
                (taskStats.highPriorityTasks / taskStats.totalTasks) * 100 || 0
              ).toFixed(0)}
              %
            </Badge>
          </Group>
          <Text size="xs" c="dimmed" mt="md">
            <span>
              {taskStats.dueSoonTasks} {t("due soon")}
            </span>
            <span> • </span>
            <span>
              {taskStats.overdueTasks} {t("overdue")}
            </span>
          </Text>
        </Box>
      </Card>

      {/* Deadlines Card */}
      <Card withBorder p="md" radius="md">
        <Box
          style={{ cursor: "pointer" }}
          onClick={() => handleNavigateToTasks("dueDate", "overdue")}
        >
          <Group justify="space-between">
            <Text size="xs" c="dimmed" fw={700} tt="uppercase">
              {t("Deadlines")}
            </Text>
            <Group gap="xs">
              <IconCalendarTime size={20} color={theme.colors.red[6]} />
              <IconChevronRight size={16} color={theme.colors.gray[5]} />
            </Group>
          </Group>
          <Group justify="space-between" mt="xs">
            <Text size="xl" fw={700}>
              {taskStats.overdueTasks}
            </Text>
            <Badge color="red" variant="light">
              {t("Overdue")}
            </Badge>
          </Group>
          <Text size="xs" c="dimmed" mt="md">
            <span>
              {taskStats.tasksWithDueDate} {t("tasks with due date")}
            </span>
          </Text>
        </Box>
      </Card>
    </SimpleGrid>
  );
}
