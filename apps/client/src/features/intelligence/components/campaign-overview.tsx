import { Stack, SimpleGrid, Text, Loader, Group, Card, Badge } from "@mantine/core";
import { useCampaigns } from "../hooks/use-intelligence-queries";
import { ResearchCampaignCard } from "./research-campaign-card";
import { useState } from "react";
import { PagePreviewDrawer } from "./page-preview-drawer";

interface Props {
  spaceId: string;
}

const EXP_STATUS_COLORS: Record<string, string> = {
  planned: "gray",
  running: "blue",
  completed: "green",
  failed: "red",
};

export function CampaignOverview({ spaceId }: Props) {
  const { data, isLoading } = useCampaigns(spaceId);
  const [previewPageId, setPreviewPageId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <Group justify="center" py="xl">
        <Loader size="sm" />
      </Group>
    );
  }

  if (!data || (data.campaigns.length === 0 && data.uncategorized.length === 0)) {
    return (
      <Text size="sm" c="dimmed">
        No research campaigns yet. Create a hypothesis and link experiments to it.
      </Text>
    );
  }

  return (
    <>
      <Stack gap="md">
        {data.campaigns.length > 0 && (
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
            {data.campaigns.map((campaign) => (
              <ResearchCampaignCard
                key={campaign.hypothesis.id}
                campaign={campaign}
                spaceId={spaceId}
              />
            ))}
          </SimpleGrid>
        )}

        {data.uncategorized.length > 0 && (
          <Stack gap="xs">
            <Text size="sm" fw={600} c="dimmed">
              Uncategorized Experiments
            </Text>
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
              {data.uncategorized.map((exp) => {
                const status = exp.metadata?.status || "planned";
                return (
                  <Card
                    key={exp.id}
                    withBorder
                    radius="sm"
                    p="sm"
                    style={{ cursor: "pointer" }}
                    onClick={() => setPreviewPageId(exp.id)}
                  >
                    <Group justify="space-between" wrap="nowrap">
                      <Text size="sm" lineClamp={1} style={{ flex: 1 }}>
                        {exp.title || "Untitled"}
                      </Text>
                      <Badge
                        size="xs"
                        variant="light"
                        color={EXP_STATUS_COLORS[status] || "gray"}
                      >
                        {status}
                      </Badge>
                    </Group>
                  </Card>
                );
              })}
            </SimpleGrid>
          </Stack>
        )}
      </Stack>

      <PagePreviewDrawer
        pageId={previewPageId}
        spaceId={spaceId}
        opened={previewPageId !== null}
        onClose={() => setPreviewPageId(null)}
      />
    </>
  );
}
