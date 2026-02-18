import { Card, Stack, Text, Badge, Group, Loader } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { useContradictions } from "../hooks/use-intelligence-queries";

interface Props {
  spaceId: string;
}

export function ContradictionAlerts({ spaceId }: Props) {
  const { data: contradictions, isLoading } = useContradictions(spaceId);

  return (
    <Card
      withBorder
      radius="md"
      p="md"
      style={{
        borderColor: contradictions?.length
          ? "var(--mantine-color-red-3)"
          : undefined,
      }}
    >
      <Stack gap="sm">
        <Group gap="xs">
          <IconAlertTriangle size={18} color="var(--mantine-color-red-6)" />
          <Text fw={600}>Contradictions</Text>
          {contradictions?.length ? (
            <Badge size="xs" color="red" variant="light">
              {contradictions.length}
            </Badge>
          ) : null}
        </Group>

        {isLoading ? (
          <Group justify="center" py="md">
            <Loader size="sm" />
          </Group>
        ) : !contradictions?.length ? (
          <Text size="sm" c="dimmed">No contradictions detected.</Text>
        ) : (
          <Stack gap="xs">
            {contradictions.map((c, i) => (
              <Card key={i} withBorder radius="sm" p="sm">
                <Stack gap={4}>
                  <Group gap="xs" wrap="nowrap">
                    <Badge size="xs" variant="light" color="blue">
                      {c.fromType || "page"}
                    </Badge>
                    <Text size="sm" fw={500} lineClamp={1} style={{ flex: 1 }}>
                      {c.fromTitle}
                    </Text>
                  </Group>
                  <Text size="xs" c="dimmed" ta="center">
                    contradicts
                  </Text>
                  <Group gap="xs" wrap="nowrap">
                    <Badge size="xs" variant="light" color="violet">
                      {c.toType || "page"}
                    </Badge>
                    <Text size="sm" fw={500} lineClamp={1} style={{ flex: 1 }}>
                      {c.toTitle}
                    </Text>
                  </Group>
                </Stack>
              </Card>
            ))}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}
