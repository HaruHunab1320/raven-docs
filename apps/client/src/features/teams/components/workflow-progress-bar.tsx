import { Group, Box, Tooltip, Text } from "@mantine/core";
import type { StepState } from "../types/team.types";

interface Props {
  stepStates: Record<string, StepState>;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "#868e96",
  running: "#339af0",
  completed: "#51cf66",
  failed: "#ff6b6b",
  waiting: "#fcc419",
};

export function WorkflowProgressBar({ stepStates }: Props) {
  const entries = Object.entries(stepStates);

  if (entries.length === 0) {
    return (
      <Text size="xs" c="dimmed">
        No workflow steps
      </Text>
    );
  }

  return (
    <Group gap={2} wrap="nowrap">
      {entries.map(([stepId, state]) => (
        <Tooltip
          key={stepId}
          label={`${stepId}: ${state.status}`}
          withArrow
          position="top"
        >
          <Box
            style={{
              flex: 1,
              height: 8,
              borderRadius: 4,
              backgroundColor: STATUS_COLORS[state.status] || "#868e96",
              minWidth: 12,
            }}
          />
        </Tooltip>
      ))}
    </Group>
  );
}
