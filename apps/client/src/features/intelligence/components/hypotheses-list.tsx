import {
  Card,
  Stack,
  Text,
  Badge,
  Group,
  SegmentedControl,
  Loader,
  ActionIcon,
} from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import { useHypothesesList } from "../hooks/use-intelligence-queries";
import { formattedDate } from "@/lib/time";
import { PagePreviewDrawer } from "./page-preview-drawer";

interface Props {
  spaceId: string;
  onNewHypothesis?: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  proposed: "gray",
  testing: "blue",
  validated: "green",
  refuted: "red",
  inconclusive: "yellow",
  superseded: "dark",
};

export function HypothesesList({ spaceId, onNewHypothesis }: Props) {
  const { data: hypotheses, isLoading } = useHypothesesList(spaceId);
  const [filter, setFilter] = useState("all");
  const [previewPageId, setPreviewPageId] = useState<string | null>(null);

  const filtered = (hypotheses ?? []).filter((hypothesis) => {
    const status = hypothesis.metadata?.status || "proposed";
    if (filter === "all") return true;
    return status === filter;
  });

  return (
    <>
      <Card withBorder radius="md" p="md">
        <Stack gap="sm">
          <Group justify="space-between">
            <Text fw={600}>Hypotheses</Text>
            <Group gap="xs">
              {onNewHypothesis && (
                <ActionIcon
                  variant="subtle"
                  size="sm"
                  onClick={onNewHypothesis}
                  aria-label="New Hypothesis"
                >
                  <IconPlus size={14} />
                </ActionIcon>
              )}
              <SegmentedControl
                size="xs"
                value={filter}
                onChange={setFilter}
                data={[
                  { value: "all", label: "All" },
                  { value: "testing", label: "Testing" },
                  { value: "validated", label: "Validated" },
                  { value: "proposed", label: "Proposed" },
                ]}
              />
            </Group>
          </Group>

          {isLoading ? (
            <Group justify="center" py="md">
              <Loader size="sm" />
            </Group>
          ) : filtered.length === 0 ? (
            <Text size="sm" c="dimmed">
              No hypotheses found.
            </Text>
          ) : (
            <Stack gap="xs">
              {filtered.map((hypothesis) => {
                const status = hypothesis.metadata?.status || "proposed";
                return (
                  <Card
                    key={hypothesis.id}
                    withBorder
                    radius="sm"
                    p="sm"
                    style={{ cursor: "pointer" }}
                    onClick={() => setPreviewPageId(hypothesis.id)}
                  >
                    <Group justify="space-between" align="flex-start" wrap="nowrap">
                      <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                        <Text fw={500} size="sm">
                          {hypothesis.title || "Untitled"}
                        </Text>
                        {hypothesis.metadata?.formalStatement && (
                          <Text size="xs" c="dimmed" lineClamp={2}>
                            {String(hypothesis.metadata.formalStatement)}
                          </Text>
                        )}
                      </Stack>
                      <Stack gap={4} align="flex-end" style={{ minWidth: 130, flexShrink: 0 }}>
                        <Badge
                          size="xs"
                          variant="light"
                          color={STATUS_COLORS[status] || "gray"}
                        >
                          {status}
                        </Badge>
                        <Text size="xs" c="dimmed">
                          {formattedDate(new Date(hypothesis.updatedAt))}
                        </Text>
                      </Stack>
                    </Group>
                  </Card>
                );
              })}
            </Stack>
          )}
        </Stack>
      </Card>

      <PagePreviewDrawer
        pageId={previewPageId}
        spaceId={spaceId}
        opened={previewPageId !== null}
        onClose={() => setPreviewPageId(null)}
      />
    </>
  );
}

