import { Card, Stack, Text, Badge, Group, Loader } from "@mantine/core";
import { useState } from "react";
import { useTimeline } from "../hooks/use-intelligence-queries";
import { formattedDate } from "@/lib/time";
import { PagePreviewDrawer } from "./page-preview-drawer";

interface Props {
  spaceId: string;
}

const PAGE_TYPE_COLORS: Record<string, string> = {
  hypothesis: "violet",
  experiment: "blue",
  paper: "orange",
  journal: "teal",
};

export function RecentFindingsTimeline({ spaceId }: Props) {
  const { data: timeline, isLoading } = useTimeline(spaceId);
  const [previewPageId, setPreviewPageId] = useState<string | null>(null);

  return (
    <>
      <Card withBorder radius="md" p="md">
        <Stack gap="sm">
          <Text fw={600}>Recent Findings</Text>

          {isLoading ? (
            <Group justify="center" py="md">
              <Loader size="sm" />
            </Group>
          ) : !timeline?.length ? (
            <Text size="sm" c="dimmed">No typed pages yet.</Text>
          ) : (
            <Stack gap="xs">
              {timeline.map((entry) => (
                <Group
                  key={entry.id}
                  gap="sm"
                  wrap="nowrap"
                  style={{
                    borderLeft: `3px solid var(--mantine-color-${PAGE_TYPE_COLORS[entry.pageType || ""] || "gray"}-4)`,
                    paddingLeft: 12,
                    cursor: "pointer",
                  }}
                  onClick={() => setPreviewPageId(entry.id)}
                >
                  <Stack gap={2} style={{ flex: 1 }}>
                    <Text fw={500} size="sm" lineClamp={1}>
                      {entry.title || "Untitled"}
                    </Text>
                    <Group gap="xs">
                      <Badge
                        size="xs"
                        variant="light"
                        color={PAGE_TYPE_COLORS[entry.pageType || ""] || "gray"}
                      >
                        {entry.pageType || "page"}
                      </Badge>
                      {entry.metadataStatus && (
                        <Badge size="xs" variant="outline">
                          {entry.metadataStatus}
                        </Badge>
                      )}
                    </Group>
                  </Stack>
                  <Text
                    size="xs"
                    c="dimmed"
                    style={{ whiteSpace: "nowrap" }}
                  >
                    {formattedDate(new Date(entry.updatedAt))}
                  </Text>
                </Group>
              ))}
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
