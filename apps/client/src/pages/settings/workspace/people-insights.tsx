import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Container,
  Group,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import useUserRole from "@/hooks/use-user-role.tsx";
import { useAtom } from "jotai";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSpaces, getSpaceMembers } from "@/features/space/services/space-service";
import { agentMemoryService } from "@/features/agent-memory/services/agent-memory-service";
import { ISpaceMember } from "@/features/space/types/space.types";
import { notifications } from "@mantine/notifications";

type TraitMetric = {
  key: string;
  label: string;
  value: number;
};

const TRAIT_ORDER = [
  "focus",
  "execution",
  "creativity",
  "communication",
  "leadership",
  "learning",
  "resilience",
];

const TRAIT_LABELS: Record<string, string> = {
  focus: "Focus",
  execution: "Execution",
  creativity: "Creativity",
  communication: "Communication",
  leadership: "Leadership",
  learning: "Learning",
  resilience: "Resilience",
};

function clamp(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(10, Math.max(0, value));
}

function RadarChart({ traits }: { traits: TraitMetric[] }) {
  const size = 320;
  const center = size / 2;
  const radius = size / 2 - 14;
  const count = traits.length;

  if (count < 3) {
    return (
      <Text size="sm" c="dimmed">
        Not enough data
      </Text>
    );
  }

  const angleStep = (Math.PI * 2) / count;
  const allZero = traits.every((trait) => clamp(trait.value) === 0);
  if (allZero) {
    return (
      <Text size="sm" c="dimmed">
        No trait signals yet.
      </Text>
    );
  }
  const points = traits.map((trait, index) => {
    const angle = angleStep * index - Math.PI / 2;
    const score = clamp(trait.value) / 10;
    const x = center + Math.cos(angle) * radius * score;
    const y = center + Math.sin(angle) * radius * score;
    return `${x},${y}`;
  });

  const axisLines = traits.map((_, index) => {
    const angle = angleStep * index - Math.PI / 2;
    const x = center + Math.cos(angle) * radius;
    const y = center + Math.sin(angle) * radius;
    return { x, y, angle };
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke="var(--mantine-color-gray-3)"
        strokeDasharray="4 6"
      />
      <circle
        cx={center}
        cy={center}
        r={radius * 0.66}
        fill="none"
        stroke="var(--mantine-color-gray-2)"
      />
      <circle
        cx={center}
        cy={center}
        r={radius * 0.33}
        fill="none"
        stroke="var(--mantine-color-gray-1)"
      />
      {axisLines.map((line, index) => (
        <line
          key={`axis-${index}`}
          x1={center}
          y1={center}
          x2={line.x}
          y2={line.y}
          stroke="var(--mantine-color-gray-3)"
        />
      ))}
      <polygon
        points={points.join(" ")}
        fill="rgba(34, 139, 230, 0.2)"
        stroke="rgba(34, 139, 230, 0.9)"
        strokeWidth={2}
      />
      {axisLines.map((line, index) => {
        const label = traits[index]?.label || "";
        const offset = 10;
        const x = center + Math.cos(line.angle) * (radius + offset);
        const y = center + Math.sin(line.angle) * (radius + offset);
        return (
          <text
            key={`${traits[index]?.key || index}-label`}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="11"
            fill="var(--mantine-color-gray-6)"
          >
            {label}
          </text>
        );
      })}
    </svg>
  );
}

function toTraitMetrics(traits?: Record<string, number>): TraitMetric[] {
  if (!traits) return [];
  return TRAIT_ORDER.map((key) => ({
    key,
    label: TRAIT_LABELS[key] || key,
    value: clamp(Number(traits[key])),
  }));
}

export default function PeopleInsights() {
  const { t } = useTranslation();
  const { isAdmin } = useUserRole();
  const [workspace] = useAtom(workspaceAtom);
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const spacesQuery = useQuery({
    queryKey: ["spaces", workspace?.id],
    queryFn: () => getSpaces({ page: 1, limit: 50 }),
    enabled: !!workspace?.id,
  });

  const membersQuery = useQuery({
    queryKey: ["space-members", spaceId],
    queryFn: () => getSpaceMembers(spaceId || "", { page: 1, limit: 100 }),
    enabled: !!spaceId,
  });

  const profilesQuery = useQuery({
    queryKey: ["user-profiles", workspace?.id, spaceId],
    queryFn: () =>
      agentMemoryService.query({
        workspaceId: workspace?.id || "",
        spaceId: spaceId || undefined,
        tags: ["user-profile"],
        limit: 200,
      }),
    enabled: !!workspace?.id && !!spaceId,
  });

  useEffect(() => {
    if (spaceId) return;
    const fallback =
      workspace?.defaultSpaceId ||
      spacesQuery.data?.items?.[0]?.id ||
      null;
    if (fallback) {
      setSpaceId(fallback);
    }
  }, [workspace?.defaultSpaceId, spacesQuery.data, spaceId]);

  const profileMap = useMemo(() => {
    const entries = profilesQuery.data || [];
    const map = new Map<string, any>();
    entries.forEach((entry) => {
      const content = entry.content as Record<string, any> | undefined;
      const userId = content?.userId as string | undefined;
      if (!userId) return;
      if (!map.has(userId)) {
        map.set(userId, entry);
      }
    });
    return map;
  }, [profilesQuery.data]);

  const members = ((membersQuery.data?.items || []) as ISpaceMember[])
    .filter((member) => member.type === "user")
    .map((member) => ({
      id: member.id,
      name: member.name,
      email: member.email,
      role: member.role,
    }));
  const spaceOptions =
    spacesQuery.data?.items?.map((space) => ({
      value: space.id,
      label: space.name || "Untitled space",
    })) || [];

  if (!isAdmin) {
    return (
      <Container size="lg" py="xl">
        <Title order={3}>{t("People Insights")}</Title>
        <Text size="sm" c="dimmed" mt="sm">
          {t("Admin access required.")}
        </Text>
      </Container>
    );
  }

  return (
    <>
      <Helmet>
        <title>{t("People Insights")}</title>
      </Helmet>
      <SettingsTitle title={t("People Insights")} />

      <Stack gap="md">
        <Group justify="space-between" align="flex-end">
          <Stack gap={4}>
            <Text fw={600}>{t("Team trait signals")}</Text>
            <Text size="sm" c="dimmed">
              {t("Trait signals update when profile distillation runs.")}
            </Text>
          </Stack>
          <Select
            label={t("Space")}
            placeholder={t("Select space")}
            data={spaceOptions}
            value={spaceId}
            onChange={setSpaceId}
            searchable
            w={240}
          />
        </Group>

        <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="md">
          {members.map((member) => {
            const profile = profileMap.get(member.id);
            const traits = toTraitMetrics(
              (profile?.content as Record<string, any> | undefined)?.profile
                ?.traits,
            );
            return (
              <Card key={member.id} withBorder radius="md" p="md">
                <Stack gap="sm">
                  <Group justify="space-between" align="flex-start">
                    <Stack gap={2}>
                      <Text fw={600}>{member.name || member.email}</Text>
                      <Text size="xs" c="dimmed">
                        {member.role}
                      </Text>
                    </Stack>
                    <Button
                      size="xs"
                      variant="light"
                      onClick={async () => {
                        if (!workspace?.id || !spaceId) return;
                        try {
                          await agentMemoryService.distillProfile({
                            workspaceId: workspace.id,
                            spaceId,
                            userId: member.id,
                          });
                          await queryClient.invalidateQueries({
                            queryKey: ["user-profiles", workspace?.id, spaceId],
                          });
                          notifications.show({
                            title: "Profile updated",
                            message: `Refreshed ${member.name || member.email}`,
                            color: "green",
                          });
                        } catch {
                          notifications.show({
                            title: "Error",
                            message: "Failed to refresh profile",
                            color: "red",
                          });
                        }
                      }}
                    >
                      {t("Refresh")}
                    </Button>
                  </Group>
                  {traits.length ? (
                    <Group align="center" justify="space-between" wrap="wrap">
                      <RadarChart traits={traits} />
                      <Stack gap={4} style={{ minWidth: 140 }}>
                        {traits.map((trait) => (
                          <div
                            key={`${member.id}-${trait.key}`}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "1fr auto",
                              columnGap: "10px",
                              alignItems: "center",
                              whiteSpace: "nowrap",
                            }}
                          >
                            <Text size="xs">{trait.label}</Text>
                            <Text size="xs" fw={600}>
                              {trait.value}/10
                            </Text>
                          </div>
                        ))}
                      </Stack>
                    </Group>
                  ) : (
                    <Text size="sm" c="dimmed">
                      {t("No trait signals yet")}
                    </Text>
                  )}
                </Stack>
              </Card>
            );
          })}
        </SimpleGrid>
      </Stack>
    </>
  );
}
