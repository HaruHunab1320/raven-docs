import {
  Card,
  Stack,
  Text,
  Badge,
  Group,
  Loader,
} from "@mantine/core";
import {
  IconFlask,
  IconAlertTriangle,
  IconQuestionMark,
  IconBrain,
} from "@tabler/icons-react";
import { useState } from "react";
import { useAttentionItems } from "../hooks/use-intelligence-queries";
import { PagePreviewDrawer } from "./page-preview-drawer";

interface Props {
  spaceId: string;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  stalled_experiment: <IconFlask size={16} />,
  contradiction: <IconAlertTriangle size={16} />,
  blocking_question: <IconQuestionMark size={16} />,
  pattern: <IconBrain size={16} />,
};

const SEVERITY_COLORS: Record<string, string> = {
  high: "red",
  medium: "orange",
  low: "gray",
};

export function NeedsAttentionSection({ spaceId }: Props) {
  const { data: items, isLoading } = useAttentionItems(spaceId);
  const [previewPageId, setPreviewPageId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <Group justify="center" py="md">
        <Loader size="sm" />
      </Group>
    );
  }

  if (!items?.length) {
    return null;
  }

  return (
    <>
      <Card withBorder radius="md" p="md">
        <Stack gap="sm">
          <Text fw={600}>Needs Attention</Text>
          <Stack gap="xs">
            {items.map((item, i) => (
              <Group
                key={i}
                gap="sm"
                wrap="nowrap"
                align="flex-start"
                style={{ cursor: "pointer" }}
                onClick={() => setPreviewPageId(item.entityId)}
              >
                <Group gap={0} mt={2}>
                  {TYPE_ICONS[item.type] || <IconAlertTriangle size={16} />}
                </Group>
                <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                  <Group gap="xs">
                    <Badge
                      size="xs"
                      variant="light"
                      color={SEVERITY_COLORS[item.severity] || "gray"}
                    >
                      {item.severity}
                    </Badge>
                    <Text size="sm" fw={500} lineClamp={1}>
                      {item.title}
                    </Text>
                  </Group>
                  <Text size="xs" c="dimmed" lineClamp={1}>
                    {item.description}
                  </Text>
                </Stack>
              </Group>
            ))}
          </Stack>
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
