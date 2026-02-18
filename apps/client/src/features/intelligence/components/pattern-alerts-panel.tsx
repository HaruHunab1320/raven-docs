import {
  Card,
  Stack,
  Text,
  Badge,
  Group,
  Button,
  Loader,
} from "@mantine/core";
import { IconBrain } from "@tabler/icons-react";
import {
  usePatternDetections,
  useAcknowledgePattern,
  useDismissPattern,
} from "../hooks/use-intelligence-queries";

interface Props {
  spaceId: string;
  full?: boolean;
}

const SEVERITY_COLORS: Record<string, string> = {
  high: "red",
  medium: "yellow",
  low: "gray",
};

const TYPE_LABELS: Record<string, string> = {
  convergence: "Convergence",
  contradiction: "Contradiction",
  staleness: "Stale Thread",
  cross_domain: "Cross-Domain",
  untested_implication: "Untested Implication",
};

export function PatternAlertsPanel({ spaceId, full }: Props) {
  const { data: patterns, isLoading } = usePatternDetections(spaceId);
  const acknowledgeMutation = useAcknowledgePattern();
  const dismissMutation = useDismissPattern();

  const visible = full
    ? patterns ?? []
    : (patterns ?? []).filter((p) => p.status === "detected").slice(0, 5);

  return (
    <Card withBorder radius="md" p="md">
      <Stack gap="sm">
        <Group gap="xs">
          <IconBrain size={18} />
          <Text fw={600}>Pattern Detection</Text>
          {visible.length > 0 && (
            <Badge size="xs" variant="light">
              {visible.length}
            </Badge>
          )}
        </Group>

        {isLoading ? (
          <Group justify="center" py="md">
            <Loader size="sm" />
          </Group>
        ) : visible.length === 0 ? (
          <Text size="sm" c="dimmed">
            No patterns detected. The system analyzes your research graph
            periodically for convergence, contradictions, and more.
          </Text>
        ) : (
          <Stack gap="xs">
            {visible.map((pattern) => (
              <Card key={pattern.id} withBorder radius="sm" p="sm">
                <Stack gap={6}>
                  <Group justify="space-between">
                    <Group gap="xs">
                      <Badge
                        size="xs"
                        color={
                          SEVERITY_COLORS[pattern.severity] || "gray"
                        }
                        variant="light"
                      >
                        {pattern.severity}
                      </Badge>
                      <Badge size="xs" variant="outline">
                        {TYPE_LABELS[pattern.patternType] ||
                          pattern.patternType}
                      </Badge>
                    </Group>
                    <Badge size="xs" variant="light">
                      {pattern.status}
                    </Badge>
                  </Group>
                  <Text size="sm">{pattern.title}</Text>
                  {pattern.status === "detected" && (
                    <Group gap="xs">
                      <Button
                        size="xs"
                        variant="light"
                        loading={acknowledgeMutation.isPending}
                        onClick={() =>
                          acknowledgeMutation.mutate(pattern.id)
                        }
                      >
                        Acknowledge
                      </Button>
                      <Button
                        size="xs"
                        variant="subtle"
                        color="gray"
                        loading={dismissMutation.isPending}
                        onClick={() =>
                          dismissMutation.mutate(pattern.id)
                        }
                      >
                        Dismiss
                      </Button>
                    </Group>
                  )}
                </Stack>
              </Card>
            ))}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}
