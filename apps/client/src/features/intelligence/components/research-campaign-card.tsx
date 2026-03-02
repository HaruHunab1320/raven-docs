import {
  Card,
  Stack,
  Text,
  Badge,
  Group,
  RingProgress,
  Collapse,
  UnstyledButton,
} from "@mantine/core";
import {
  IconChevronDown,
  IconChevronRight,
  IconAlertTriangle,
} from "@tabler/icons-react";
import { useState } from "react";
import type { ResearchCampaign } from "../types/intelligence.types";
import { PagePreviewDrawer } from "./page-preview-drawer";

interface Props {
  campaign: ResearchCampaign;
  spaceId: string;
}

const STATUS_COLORS: Record<string, string> = {
  validated: "green",
  testing: "blue",
  refuted: "red",
  proposed: "gray",
  inconclusive: "yellow",
};

const EXP_STATUS_COLORS: Record<string, string> = {
  planned: "gray",
  running: "blue",
  completed: "green",
  failed: "red",
};

export function ResearchCampaignCard({ campaign, spaceId }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [previewPageId, setPreviewPageId] = useState<string | null>(null);

  const { hypothesis, experiments, rollup } = campaign;
  const status = hypothesis.metadata?.status || "proposed";
  const confidence = hypothesis.metadata?.confidence;
  const formalStatement = hypothesis.metadata?.formalStatement;

  const completedPercent =
    rollup.experimentsTotal > 0
      ? Math.round((rollup.experimentsCompleted / rollup.experimentsTotal) * 100)
      : 0;

  return (
    <>
      <Card withBorder radius="md" p="md">
        <Stack gap="sm">
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
              <Group gap="xs">
                <Text fw={600} size="sm" lineClamp={1} style={{ flex: 1 }}>
                  {hypothesis.title || "Untitled Hypothesis"}
                </Text>
                <Badge size="xs" variant="light" color={STATUS_COLORS[status] || "gray"}>
                  {status}
                </Badge>
                {confidence != null && (
                  <Badge size="xs" variant="outline">
                    {Math.round(Number(confidence) * 100)}% confidence
                  </Badge>
                )}
              </Group>
              {formalStatement && (
                <Text size="xs" c="dimmed" lineClamp={1}>
                  {formalStatement}
                </Text>
              )}
            </Stack>

            {rollup.experimentsTotal > 0 && (
              <RingProgress
                size={48}
                thickness={5}
                roundCaps
                sections={[
                  { value: completedPercent, color: "green" },
                ]}
                label={
                  <Text size="xs" ta="center" fw={600}>
                    {completedPercent}%
                  </Text>
                }
              />
            )}
          </Group>

          <Group gap="xs">
            {rollup.experimentsRunning > 0 && (
              <Badge size="xs" variant="light" color="blue">
                {rollup.experimentsRunning} running
              </Badge>
            )}
            {rollup.experimentsCompleted > 0 && (
              <Badge size="xs" variant="light" color="green">
                {rollup.experimentsCompleted} completed
              </Badge>
            )}
            {rollup.experimentsFailed > 0 && (
              <Badge size="xs" variant="light" color="red">
                {rollup.experimentsFailed} failed
              </Badge>
            )}
            {rollup.experimentsTotal === 0 && (
              <Badge size="xs" variant="light" color="gray">
                No experiments
              </Badge>
            )}
            {rollup.contradictionsCount > 0 && (
              <Badge
                size="xs"
                variant="light"
                color="red"
                leftSection={<IconAlertTriangle size={10} />}
              >
                {rollup.contradictionsCount} contradictions
              </Badge>
            )}
          </Group>

          {experiments.length > 0 && (
            <UnstyledButton onClick={() => setExpanded((v) => !v)}>
              <Group gap={4}>
                {expanded ? (
                  <IconChevronDown size={14} />
                ) : (
                  <IconChevronRight size={14} />
                )}
                <Text size="xs" c="dimmed">
                  {experiments.length} experiment{experiments.length !== 1 ? "s" : ""}
                </Text>
              </Group>
            </UnstyledButton>
          )}

          <Collapse in={expanded}>
            <Stack gap="xs" pl="sm">
              {experiments.map((exp) => {
                const expStatus = exp.metadata?.status || "planned";
                return (
                  <Group
                    key={exp.id}
                    gap="sm"
                    wrap="nowrap"
                    style={{ cursor: "pointer" }}
                    onClick={() => setPreviewPageId(exp.id)}
                  >
                    <Text size="xs" lineClamp={1} style={{ flex: 1 }}>
                      {exp.title || "Untitled"}
                    </Text>
                    <Badge
                      size="xs"
                      variant="light"
                      color={EXP_STATUS_COLORS[expStatus] || "gray"}
                    >
                      {expStatus}
                    </Badge>
                  </Group>
                );
              })}

              {campaign.contradictions.length > 0 && (
                <Stack gap={4} mt="xs">
                  <Text size="xs" fw={500} c="red">
                    Contradictions
                  </Text>
                  {campaign.contradictions.map((c, i) => (
                    <Text key={i} size="xs" c="dimmed">
                      {c.fromTitle} vs {c.toTitle}
                    </Text>
                  ))}
                </Stack>
              )}
            </Stack>
          </Collapse>
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
