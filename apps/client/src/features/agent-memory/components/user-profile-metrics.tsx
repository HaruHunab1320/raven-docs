import { Card, Group, Stack, Text } from "@mantine/core";

type TraitMetric = {
  key: string;
  label: string;
  value: number;
};

type UserProfileMetricsProps = {
  traits: TraitMetric[];
  title?: string;
  subtitle?: string;
};

const MAX_SCORE = 10;

function clamp(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(MAX_SCORE, Math.max(0, value));
}

function RadarChart({ traits }: { traits: TraitMetric[] }) {
  const size = 200;
  const center = size / 2;
  const radius = size / 2 - 16;
  const count = traits.length;

  if (count < 3) {
    return (
      <Text size="sm" c="dimmed">
        Not enough data to render profile traits.
      </Text>
    );
  }

  const angleStep = (Math.PI * 2) / count;
  const points = traits.map((trait, index) => {
    const angle = angleStep * index - Math.PI / 2;
    const score = clamp(trait.value) / MAX_SCORE;
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
          key={traits[index].key}
          x1={center}
          y1={center}
          x2={line.x}
          y2={line.y}
          stroke="var(--mantine-color-gray-3)"
        />
      ))}
      <polygon
        points={points.join(" ")}
        fill="rgba(32, 201, 151, 0.2)"
        stroke="rgba(32, 201, 151, 0.8)"
        strokeWidth={2}
      />
      {axisLines.map((line, index) => {
        const label = traits[index].label;
        const offset = 12;
        const x = center + Math.cos(line.angle) * (radius + offset);
        const y = center + Math.sin(line.angle) * (radius + offset);
        return (
          <text
            key={`${traits[index].key}-label`}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="10"
            fill="var(--mantine-color-gray-6)"
          >
            {label}
          </text>
        );
      })}
    </svg>
  );
}

export function UserProfileMetrics({
  traits,
  title = "User traits",
  subtitle,
}: UserProfileMetricsProps) {
  const normalized = traits
    .map((trait) => ({ ...trait, value: clamp(trait.value) }))
    .filter((trait) => Number.isFinite(trait.value));

  return (
    <Card withBorder radius="md" p="md">
      <Stack gap="sm">
        <Stack gap={2}>
          <Text fw={600}>{title}</Text>
          {subtitle ? (
            <Text size="xs" c="dimmed">
              {subtitle}
            </Text>
          ) : null}
        </Stack>
        {normalized.length ? (
          <Group align="flex-start" gap="xl" wrap="wrap">
            <RadarChart traits={normalized} />
            <Stack gap="xs" style={{ minWidth: 160 }}>
              {normalized.map((trait) => (
                <div
                  key={trait.key}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    columnGap: "12px",
                    alignItems: "center",
                    whiteSpace: "nowrap",
                  }}
                >
                  <Text size="sm">{trait.label}</Text>
                  <Text size="sm" fw={600}>
                    {trait.value}/10
                  </Text>
                </div>
              ))}
            </Stack>
          </Group>
        ) : (
          <Text size="sm" c="dimmed">
            No trait signals yet.
          </Text>
        )}
      </Stack>
    </Card>
  );
}
