import {
  Card,
  Stack,
  Text,
  Badge,
  Group,
  Loader,
  ActionIcon,
  Menu,
} from "@mantine/core";
import {
  IconDotsVertical,
  IconExternalLink,
  IconLink,
  IconTrash,
} from "@tabler/icons-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useTimeline, INTELLIGENCE_KEYS } from "../hooks/use-intelligence-queries";
import { useDeletePageMutation } from "@/features/page/queries/page-query";
import { formattedDate } from "@/lib/time";
import { PagePreviewDrawer } from "./page-preview-drawer";
import { notifications } from "@mantine/notifications";

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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: timeline, isLoading } = useTimeline(spaceId);
  const [previewPageId, setPreviewPageId] = useState<string | null>(null);
  const deletePageMutation = useDeletePageMutation();

  const handleDelete = (pageId: string) => {
    deletePageMutation.mutate(pageId, {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: INTELLIGENCE_KEYS.timeline(spaceId),
        });
        queryClient.invalidateQueries({
          queryKey: INTELLIGENCE_KEYS.stats(spaceId),
        });
        queryClient.invalidateQueries({
          queryKey: INTELLIGENCE_KEYS.hypotheses(spaceId),
        });
        queryClient.invalidateQueries({
          queryKey: INTELLIGENCE_KEYS.experiments(spaceId),
        });
      },
    });
  };

  const handleCopyLink = (id: string) => {
    const url = `${window.location.origin}/p/${id}`;
    navigator.clipboard.writeText(url);
    notifications.show({
      message: "Link copied to clipboard",
      color: "green",
    });
  };

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
                  <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
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
                  <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
                    <Text
                      size="xs"
                      c="dimmed"
                      style={{ whiteSpace: "nowrap" }}
                    >
                      {formattedDate(new Date(entry.updatedAt))}
                    </Text>
                    <Menu position="bottom-end" withinPortal>
                      <Menu.Target>
                        <ActionIcon
                          variant="subtle"
                          color="gray"
                          size="xs"
                          onClick={(e) => e.stopPropagation()}
                          aria-label="More options"
                        >
                          <IconDotsVertical size={14} />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item
                          leftSection={<IconExternalLink size={14} />}
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/p/${entry.id}`);
                          }}
                        >
                          Open full page
                        </Menu.Item>
                        <Menu.Item
                          leftSection={<IconLink size={14} />}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyLink(entry.id);
                          }}
                        >
                          Copy link
                        </Menu.Item>
                        <Menu.Divider />
                        <Menu.Item
                          color="red"
                          leftSection={<IconTrash size={14} />}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(entry.id);
                          }}
                        >
                          Move to trash
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  </Group>
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
