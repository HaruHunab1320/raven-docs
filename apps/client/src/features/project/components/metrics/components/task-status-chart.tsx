import React from "react";
import { Card, Text, Group, RingProgress, Stack, Box } from "@mantine/core";
import { IconChecklist } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { TaskStatus } from "../../../types";

interface TaskStatusChartProps {
  totalTasks: number;
  tasksByStatus: {
    todo: number;
    in_progress: number;
    in_review: number;
    done: number;
    blocked: number;
  };
  completionPercentage: number;
  statusColors: Record<string, string>;
}

export function TaskStatusChart({
  totalTasks,
  tasksByStatus,
  completionPercentage,
  statusColors,
}: TaskStatusChartProps) {
  const { t } = useTranslation();

  // Creating the sections for RingProgress
  const sections = Object.entries(tasksByStatus).map(([status, count]) => ({
    value: totalTasks > 0 ? (count / totalTasks) * 100 : 0,
    color: statusColors[status as TaskStatus],
  }));

  return (
    <Card withBorder padding="lg" radius="md">
      <Group justify="space-between">
        <Text size="lg" fw={500}>
          {t("Task Status")}
        </Text>
        <IconChecklist size={22} />
      </Group>
      <Group justify="space-between" mt="md">
        <Stack gap={0}>
          <Text size="xl" fw={700}>
            {totalTasks}
          </Text>
          <Text size="sm" c="dimmed">
            {t("Total Tasks")}
          </Text>
        </Stack>
        <RingProgress
          size={80}
          roundCaps
          thickness={8}
          sections={sections}
          label={
            <Text size="xs" ta="center" fw={700}>
              {`${Math.round(completionPercentage)}%`}
            </Text>
          }
        />
      </Group>
      <Stack mt="md" gap="xs">
        {Object.entries(tasksByStatus).map(([status, count]) => (
          <Group key={status} justify="space-between">
            <Group gap="xs">
              <Box
                w={12}
                h={12}
                bg={statusColors[status as TaskStatus]}
                style={{ borderRadius: "50%" }}
              />
              <Text size="xs">
                {t(
                  status === "todo"
                    ? "To Do"
                    : status === "in_progress"
                      ? "In Progress"
                      : status === "in_review"
                        ? "In Review"
                        : status === "done"
                          ? "Done"
                          : "Blocked"
                )}
              </Text>
            </Group>
            <Text size="xs">{count}</Text>
          </Group>
        ))}
      </Stack>
    </Card>
  );
}
