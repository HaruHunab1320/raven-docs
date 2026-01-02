import React from "react";
import {
  Card,
  Text,
  Group,
  RingProgress,
  Stack,
  ThemeIcon,
} from "@mantine/core";

interface MetricCardProps {
  title: string;
  value: number | string;
  icon?: React.ReactNode;
  subtitle?: string;
  progress?: {
    value: number;
    color: string;
    sections?: Array<{ value: number; color: string }>;
    label?: React.ReactNode;
  };
}

export function MetricCard({
  title,
  value,
  icon,
  subtitle,
  progress,
}: MetricCardProps) {
  return (
    <Card withBorder padding="lg" radius="md">
      <Group justify="space-between">
        <Text size="lg" fw={500}>
          {title}
        </Text>
        {icon}
      </Group>
      <Group justify="space-between" mt="md">
        <Stack gap={0}>
          <Text size="xl" fw={700}>
            {value}
          </Text>
          {subtitle && (
            <Text size="sm" c="dimmed">
              {subtitle}
            </Text>
          )}
        </Stack>
        {progress && (
          <RingProgress
            size={80}
            roundCaps
            thickness={8}
            sections={
              progress.sections || [
                { value: progress.value, color: progress.color },
              ]
            }
            label={progress.label}
          />
        )}
      </Group>
    </Card>
  );
}
