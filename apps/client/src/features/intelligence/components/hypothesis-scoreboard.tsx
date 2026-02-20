import { Card, SimpleGrid, Stack, Text, Title, Badge, Group, ActionIcon } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { useIntelligenceStats } from "../hooks/use-intelligence-queries";

interface Props {
  spaceId: string;
  onNewHypothesis?: () => void;
}

const STATUS_CONFIG = [
  { key: "validated" as const, label: "Validated", color: "green" },
  { key: "testing" as const, label: "Testing", color: "blue" },
  { key: "refuted" as const, label: "Refuted", color: "red" },
  { key: "proposed" as const, label: "Proposed", color: "gray" },
];

export function HypothesisScoreboard({ spaceId, onNewHypothesis }: Props) {
  const { data: stats, isLoading } = useIntelligenceStats(spaceId);

  if (isLoading || !stats) {
    return (
      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
        {STATUS_CONFIG.map((s) => (
          <Card key={s.key} withBorder radius="md" p="md">
            <Stack gap={4}>
              <Text size="xs" c="dimmed" tt="uppercase">{s.label}</Text>
              <Title order={3}>-</Title>
            </Stack>
          </Card>
        ))}
      </SimpleGrid>
    );
  }

  return (
    <Stack gap="xs">
      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
        {STATUS_CONFIG.map((s) => (
          <Card key={s.key} withBorder radius="md" p="md">
            <Stack gap={4}>
              <Text size="xs" c="dimmed" tt="uppercase">{s.label}</Text>
              <Group justify="space-between">
                <Title order={3}>{stats.hypotheses[s.key]}</Title>
                <Badge size="xs" color={s.color} variant="light">
                  {s.label}
                </Badge>
              </Group>
            </Stack>
          </Card>
        ))}
      </SimpleGrid>
      {onNewHypothesis && (
        <Group justify="flex-end">
          <ActionIcon variant="subtle" size="sm" onClick={onNewHypothesis} aria-label="New Hypothesis">
            <IconPlus size={14} />
          </ActionIcon>
        </Group>
      )}
    </Stack>
  );
}
