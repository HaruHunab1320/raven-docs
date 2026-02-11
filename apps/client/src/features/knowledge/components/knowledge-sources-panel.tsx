import { useState } from "react";
import {
  Stack,
  Text,
  Card,
  Group,
  Badge,
  ActionIcon,
  Menu,
  Button,
  TextInput,
  Select,
  Modal,
  Loader,
  Alert,
} from "@mantine/core";
import {
  IconDots,
  IconRefresh,
  IconTrash,
  IconPlus,
  IconLink,
  IconFile,
  IconFileText,
  IconAlertCircle,
  IconCheck,
  IconClock,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useDisclosure } from "@mantine/hooks";
import {
  useKnowledgeSources,
  useCreateKnowledgeSource,
  useDeleteKnowledgeSource,
  useRefreshKnowledgeSource,
} from "../hooks/use-knowledge-sources";
import { KnowledgeSource } from "../api/knowledge-api";

interface KnowledgeSourcesPanelProps {
  workspaceId: string;
  spaceId?: string;
  scope: "workspace" | "space";
  readOnly?: boolean;
}

export function KnowledgeSourcesPanel({
  workspaceId,
  spaceId,
  scope,
  readOnly = false,
}: KnowledgeSourcesPanelProps) {
  const { t } = useTranslation();
  const [opened, { open, close }] = useDisclosure(false);

  const { data: sources, isLoading } = useKnowledgeSources({
    workspaceId,
    spaceId: scope === "space" ? spaceId : undefined,
  });

  // Filter sources by scope
  const filteredSources = sources?.filter((s) => {
    if (scope === "workspace") {
      return s.scope === "workspace" || s.scope === "system";
    }
    return s.scope === "space" && s.spaceId === spaceId;
  });

  const workspaceSources = filteredSources?.filter((s) => s.scope === "workspace") || [];
  const systemSources = filteredSources?.filter((s) => s.scope === "system") || [];
  const spaceSources = filteredSources?.filter((s) => s.scope === "space") || [];

  if (isLoading) {
    return (
      <Stack align="center" py="xl">
        <Loader size="sm" />
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        {scope === "workspace"
          ? t("Add documentation and reference material that will be available to agents across all spaces.")
          : t("Add documentation specific to this space. Agents will also have access to workspace-level knowledge.")}
      </Text>

      {!readOnly && (
        <Button
          leftSection={<IconPlus size={16} />}
          variant="light"
          onClick={open}
          size="sm"
        >
          {t("Add Knowledge Source")}
        </Button>
      )}

      {scope === "workspace" && systemSources.length > 0 && (
        <Stack gap="xs">
          <Text size="sm" fw={600}>{t("System Knowledge")}</Text>
          <Text size="xs" c="dimmed">{t("Built-in documentation available to all workspaces")}</Text>
          {systemSources.map((source) => (
            <KnowledgeSourceCard
              key={source.id}
              source={source}
              readOnly={true}
            />
          ))}
        </Stack>
      )}

      {scope === "workspace" && workspaceSources.length > 0 && (
        <Stack gap="xs">
          <Text size="sm" fw={600}>{t("Workspace Knowledge")}</Text>
          {workspaceSources.map((source) => (
            <KnowledgeSourceCard
              key={source.id}
              source={source}
              readOnly={readOnly}
            />
          ))}
        </Stack>
      )}

      {scope === "space" && (
        <Stack gap="xs">
          {spaceSources.length > 0 ? (
            spaceSources.map((source) => (
              <KnowledgeSourceCard
                key={source.id}
                source={source}
                readOnly={readOnly}
              />
            ))
          ) : (
            <Text size="sm" c="dimmed" ta="center" py="md">
              {t("No space-specific knowledge sources yet")}
            </Text>
          )}
        </Stack>
      )}

      {scope === "workspace" && workspaceSources.length === 0 && (
        <Text size="sm" c="dimmed" ta="center" py="md">
          {t("No workspace knowledge sources yet")}
        </Text>
      )}

      <AddKnowledgeSourceModal
        opened={opened}
        onClose={close}
        workspaceId={workspaceId}
        spaceId={spaceId}
        scope={scope}
      />
    </Stack>
  );
}

function KnowledgeSourceCard({
  source,
  readOnly,
}: {
  source: KnowledgeSource;
  readOnly: boolean;
}) {
  const { t } = useTranslation();
  const deleteMutation = useDeleteKnowledgeSource();
  const refreshMutation = useRefreshKnowledgeSource();

  const getTypeIcon = () => {
    switch (source.type) {
      case "url":
        return <IconLink size={16} />;
      case "file":
        return <IconFile size={16} />;
      case "page":
        return <IconFileText size={16} />;
      default:
        return <IconFile size={16} />;
    }
  };

  const getStatusBadge = () => {
    switch (source.status) {
      case "ready":
        return (
          <Badge color="green" size="sm" leftSection={<IconCheck size={12} />}>
            {t("Ready")}
          </Badge>
        );
      case "processing":
        return (
          <Badge color="blue" size="sm" leftSection={<Loader size={10} />}>
            {t("Processing")}
          </Badge>
        );
      case "pending":
        return (
          <Badge color="gray" size="sm" leftSection={<IconClock size={12} />}>
            {t("Pending")}
          </Badge>
        );
      case "error":
        return (
          <Badge color="red" size="sm" leftSection={<IconAlertCircle size={12} />}>
            {t("Error")}
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <Card withBorder p="sm">
      <Group justify="space-between" wrap="nowrap">
        <Group gap="sm" wrap="nowrap" style={{ overflow: "hidden" }}>
          {getTypeIcon()}
          <Stack gap={2} style={{ overflow: "hidden" }}>
            <Text size="sm" fw={500} truncate>
              {source.name}
            </Text>
            {source.sourceUrl && (
              <Text size="xs" c="dimmed" truncate>
                {source.sourceUrl}
              </Text>
            )}
          </Stack>
        </Group>

        <Group gap="xs" wrap="nowrap">
          {getStatusBadge()}
          {source.chunkCount > 0 && (
            <Badge variant="light" size="sm">
              {source.chunkCount} {t("chunks")}
            </Badge>
          )}
          {!readOnly && source.scope !== "system" && (
            <Menu position="bottom-end" withinPortal>
              <Menu.Target>
                <ActionIcon variant="subtle" size="sm">
                  <IconDots size={16} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  leftSection={<IconRefresh size={14} />}
                  onClick={() => refreshMutation.mutate(source.id)}
                  disabled={refreshMutation.isPending}
                >
                  {t("Refresh")}
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconTrash size={14} />}
                  color="red"
                  onClick={() => deleteMutation.mutate(source.id)}
                  disabled={deleteMutation.isPending}
                >
                  {t("Delete")}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          )}
        </Group>
      </Group>

      {source.status === "error" && source.errorMessage && (
        <Alert color="red" mt="xs" p="xs">
          <Text size="xs">{source.errorMessage}</Text>
        </Alert>
      )}
    </Card>
  );
}

function AddKnowledgeSourceModal({
  opened,
  onClose,
  workspaceId,
  spaceId,
  scope,
}: {
  opened: boolean;
  onClose: () => void;
  workspaceId: string;
  spaceId?: string;
  scope: "workspace" | "space";
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [type, setType] = useState<"url" | "file" | "page">("url");
  const [sourceUrl, setSourceUrl] = useState("");

  const createMutation = useCreateKnowledgeSource();

  const handleSubmit = async () => {
    if (!name.trim()) return;

    await createMutation.mutateAsync({
      name: name.trim(),
      type,
      sourceUrl: type === "url" ? sourceUrl : undefined,
      scope,
      workspaceId,
      spaceId: scope === "space" ? spaceId : undefined,
    });

    setName("");
    setType("url");
    setSourceUrl("");
    onClose();
  };

  const handleClose = () => {
    setName("");
    setType("url");
    setSourceUrl("");
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={t("Add Knowledge Source")}
      size="md"
    >
      <Stack gap="md">
        <TextInput
          label={t("Name")}
          placeholder={t("e.g., API Documentation")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />

        <Select
          label={t("Type")}
          data={[
            { value: "url", label: t("URL") },
            // File and page types can be added later
            // { value: "file", label: t("File Upload") },
            // { value: "page", label: t("Internal Page") },
          ]}
          value={type}
          onChange={(value) => setType(value as "url" | "file" | "page")}
        />

        {type === "url" && (
          <TextInput
            label={t("URL")}
            placeholder="https://docs.example.com"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            required
          />
        )}

        <Group justify="flex-end" mt="md">
          <Button variant="subtle" onClick={handleClose}>
            {t("Cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            loading={createMutation.isPending}
            disabled={!name.trim() || (type === "url" && !sourceUrl.trim())}
          >
            {t("Add Source")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
