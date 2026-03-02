import { Group, Badge, Text, Paper, Tooltip } from "@mantine/core";
import {
  IconAlertTriangle,
  IconFlask,
  IconQuestionMark,
  IconBrain,
  IconCheck,
} from "@tabler/icons-react";
import {
  useAttentionItems,
  useIntelligenceStats,
} from "../hooks/use-intelligence-queries";

interface Props {
  spaceId: string;
  onNavigateToTab?: (tab: string) => void;
}

export function AttentionBar({ spaceId, onNavigateToTab }: Props) {
  const { data: items } = useAttentionItems(spaceId);
  const { data: stats } = useIntelligenceStats(spaceId);

  const counts = {
    contradictions: 0,
    stalled_experiment: 0,
    blocking_question: 0,
    pattern: 0,
  };

  for (const item of items ?? []) {
    if (item.type in counts) {
      counts[item.type as keyof typeof counts]++;
    }
  }

  const hasAttention = (items?.length ?? 0) > 0;

  if (!hasAttention) {
    return (
      <Paper withBorder radius="md" p="sm">
        <Group gap="md">
          <Group gap={6}>
            <IconCheck size={16} color="var(--mantine-color-green-6)" />
            <Text size="sm" fw={500} c="green">
              All clear
            </Text>
          </Group>
          {stats && (
            <Group gap="xs">
              <Badge size="xs" variant="light" color="violet">
                {stats.hypotheses.total} hypotheses
              </Badge>
              <Badge size="xs" variant="light" color="blue">
                {stats.activeExperiments} active experiments
              </Badge>
              <Badge size="xs" variant="light">
                {stats.totalTypedPages} typed pages
              </Badge>
            </Group>
          )}
        </Group>
      </Paper>
    );
  }

  const chips: {
    key: string;
    label: string;
    count: number;
    color: string;
    icon: React.ReactNode;
    tab: string;
  }[] = [];

  if (counts.contradictions > 0) {
    chips.push({
      key: "contradictions",
      label: "contradictions",
      count: counts.contradictions,
      color: "red",
      icon: <IconAlertTriangle size={14} />,
      tab: "overview",
    });
  }
  if (counts.stalled_experiment > 0) {
    chips.push({
      key: "experiments",
      label: "experiments need attention",
      count: counts.stalled_experiment,
      color: "orange",
      icon: <IconFlask size={14} />,
      tab: "experiments",
    });
  }
  if (counts.blocking_question > 0) {
    chips.push({
      key: "questions",
      label: "questions blocking",
      count: counts.blocking_question,
      color: "yellow",
      icon: <IconQuestionMark size={14} />,
      tab: "questions",
    });
  }
  if (counts.pattern > 0) {
    chips.push({
      key: "patterns",
      label: "patterns to review",
      count: counts.pattern,
      color: "violet",
      icon: <IconBrain size={14} />,
      tab: "patterns",
    });
  }

  return (
    <Paper withBorder radius="md" p="sm">
      <Group gap="sm">
        {chips.map((chip) => (
          <Tooltip key={chip.key} label={`View ${chip.label}`}>
            <Badge
              size="lg"
              variant="light"
              color={chip.color}
              leftSection={chip.icon}
              style={{ cursor: "pointer" }}
              onClick={() => onNavigateToTab?.(chip.tab)}
            >
              {chip.count} {chip.label}
            </Badge>
          </Tooltip>
        ))}
      </Group>
    </Paper>
  );
}
