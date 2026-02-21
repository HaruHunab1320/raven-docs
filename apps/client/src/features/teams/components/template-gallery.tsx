import {
  SimpleGrid,
  Card,
  Text,
  Group,
  Badge,
  Button,
  Stack,
  Loader,
} from "@mantine/core";
import { IconRocket, IconCopy } from "@tabler/icons-react";
import {
  useTeamTemplates,
  useDuplicateTemplateMutation,
} from "../hooks/use-team-queries";
import { OrgChartMermaidPreview } from "./org-chart-mermaid-preview";
import type { TeamTemplate, OrgPattern } from "../types/team.types";

interface Props {
  onDeploy: (templateId: string) => void;
}

function parseOrgPattern(template: TeamTemplate): OrgPattern | null {
  if (!template.orgPattern) return null;
  return typeof template.orgPattern === "string"
    ? JSON.parse(template.orgPattern)
    : template.orgPattern;
}

function countRoles(pattern: OrgPattern | null): number {
  if (!pattern?.structure?.roles) return 0;
  return Object.keys(pattern.structure.roles).length;
}

function countSteps(pattern: OrgPattern | null): number {
  if (!pattern?.workflow?.steps) return 0;
  return pattern.workflow.steps.length;
}

export function TemplateGallery({ onDeploy }: Props) {
  const { data: templates, isLoading } = useTeamTemplates();
  const duplicateMutation = useDuplicateTemplateMutation();

  const systemTemplates = (templates || []).filter((t) => t.isSystem);

  if (isLoading) {
    return (
      <Group justify="center" py="xl">
        <Loader size="sm" />
      </Group>
    );
  }

  if (systemTemplates.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        No templates available.
      </Text>
    );
  }

  return (
    <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
      {systemTemplates.map((template) => {
        const pattern = parseOrgPattern(template);
        return (
          <Card key={template.id} withBorder radius="md" p="md">
            <Stack gap="sm">
              <Group justify="space-between" align="flex-start">
                <Text fw={600} size="sm">
                  {template.name}
                </Text>
                <Group gap={4}>
                  <Badge size="xs" variant="light">
                    {countRoles(pattern)} roles
                  </Badge>
                  <Badge size="xs" variant="light" color="grape">
                    {countSteps(pattern)} steps
                  </Badge>
                </Group>
              </Group>

              <Text size="xs" c="dimmed" lineClamp={2}>
                {template.description}
              </Text>

              <OrgChartMermaidPreview orgPattern={pattern} compact />

              <Group gap="xs">
                <Button
                  size="xs"
                  leftSection={<IconRocket size={14} />}
                  onClick={() => onDeploy(template.id)}
                  flex={1}
                >
                  Deploy
                </Button>
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<IconCopy size={14} />}
                  onClick={() => duplicateMutation.mutate(template.id)}
                  loading={duplicateMutation.isPending}
                >
                  Customize
                </Button>
              </Group>
            </Stack>
          </Card>
        );
      })}
    </SimpleGrid>
  );
}
