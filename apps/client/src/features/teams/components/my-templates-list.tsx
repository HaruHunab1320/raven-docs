import {
  Stack,
  Card,
  Group,
  Text,
  Button,
  Menu,
  ActionIcon,
  Badge,
  Loader,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import {
  IconDots,
  IconEdit,
  IconCopy,
  IconTrash,
  IconPlus,
} from "@tabler/icons-react";
import {
  useTeamTemplates,
  useDuplicateTemplateMutation,
  useDeleteTemplateMutation,
} from "../hooks/use-team-queries";
import type { TeamTemplate, OrgPattern } from "../types/team.types";

interface Props {
  onNewTemplate: () => void;
  onEditTemplate: (template: TeamTemplate) => void;
}

function parseOrgPattern(template: TeamTemplate): OrgPattern | null {
  if (!template.orgPattern) return null;
  return typeof template.orgPattern === "string"
    ? JSON.parse(template.orgPattern)
    : template.orgPattern;
}

export function MyTemplatesList({ onNewTemplate, onEditTemplate }: Props) {
  const { data: templates, isLoading } = useTeamTemplates();
  const duplicateMutation = useDuplicateTemplateMutation();
  const deleteMutation = useDeleteTemplateMutation();

  const customTemplates = (templates || []).filter((t) => !t.isSystem);

  const handleDelete = (template: TeamTemplate) => {
    modals.openConfirmModal({
      title: "Delete Template",
      children: (
        <Text size="sm">
          Are you sure you want to delete &quot;{template.name}&quot;? This
          action cannot be undone.
        </Text>
      ),
      labels: { confirm: "Delete", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: () => deleteMutation.mutate(template.id),
    });
  };

  if (isLoading) {
    return (
      <Group justify="center" py="xl">
        <Loader size="sm" />
      </Group>
    );
  }

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          {customTemplates.length} custom template
          {customTemplates.length !== 1 ? "s" : ""}
        </Text>
        <Button
          size="xs"
          leftSection={<IconPlus size={14} />}
          onClick={onNewTemplate}
        >
          New Template
        </Button>
      </Group>

      {customTemplates.length === 0 ? (
        <Text size="sm" c="dimmed" ta="center" py="xl">
          No custom templates yet. Create one or customize a system template.
        </Text>
      ) : (
        customTemplates.map((template) => {
          const pattern = parseOrgPattern(template);
          const roleCount = pattern?.structure?.roles
            ? Object.keys(pattern.structure.roles).length
            : 0;

          return (
            <Card key={template.id} withBorder radius="md" p="sm">
              <Group justify="space-between" wrap="nowrap">
                <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                  <Group gap="xs">
                    <Text fw={600} size="sm" truncate>
                      {template.name}
                    </Text>
                    <Badge size="xs" variant="light">
                      v{template.version}
                    </Badge>
                    <Badge size="xs" variant="light" color="blue">
                      {roleCount} roles
                    </Badge>
                  </Group>
                  {template.description && (
                    <Text size="xs" c="dimmed" lineClamp={1}>
                      {template.description}
                    </Text>
                  )}
                </Stack>

                <Menu shadow="md" width={160} position="bottom-end">
                  <Menu.Target>
                    <ActionIcon variant="subtle" size="sm">
                      <IconDots size={16} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item
                      leftSection={<IconEdit size={14} />}
                      onClick={() => onEditTemplate(template)}
                    >
                      Edit
                    </Menu.Item>
                    <Menu.Item
                      leftSection={<IconCopy size={14} />}
                      onClick={() => duplicateMutation.mutate(template.id)}
                    >
                      Duplicate
                    </Menu.Item>
                    <Menu.Divider />
                    <Menu.Item
                      leftSection={<IconTrash size={14} />}
                      color="red"
                      onClick={() => handleDelete(template)}
                    >
                      Delete
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </Group>
            </Card>
          );
        })
      )}
    </Stack>
  );
}
