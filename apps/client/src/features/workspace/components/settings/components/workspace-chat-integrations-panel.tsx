import { useTranslation } from "react-i18next";
import {
  Button,
  Group,
  Stack,
  TextInput,
  Text,
  Switch,
  Divider,
  Select,
  Table,
  ActionIcon,
  Paper,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  getWorkspaceIntegrations,
  updateWorkspaceIntegrations,
  getSlackChannelMappings,
  addSlackChannelMapping,
  removeSlackChannelMapping,
  getDiscordChannelMappings,
  addDiscordChannelMapping,
  removeDiscordChannelMapping,
  IDiscordChannelMapping,
} from "@/features/workspace/services/workspace-service";
import { getSpaces } from "@/features/space/services/space-service";
import { notifications } from "@mantine/notifications";
import { IconTrash } from "@tabler/icons-react";
import { IChannelMapping } from "@/features/workspace/types/workspace.types";

type SlackForm = {
  slackEnabled: boolean;
  slackTeamId: string;
  slackBotToken: string;
  slackSigningSecret: string;
  slackDefaultChannelId: string;
  slackDefaultUserId: string;
};

type DiscordForm = {
  discordEnabled: boolean;
  discordGuildId: string;
  discordBotToken: string;
  discordPublicKey: string;
  discordApplicationId: string;
  discordDefaultChannelId: string;
  discordDefaultUserId: string;
};

export function WorkspaceChatIntegrationsPanel() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [newSlackChannelId, setNewSlackChannelId] = useState("");
  const [newSlackSpaceId, setNewSlackSpaceId] = useState<string | null>(null);
  const [newDiscordChannelId, setNewDiscordChannelId] = useState("");
  const [newDiscordSpaceId, setNewDiscordSpaceId] = useState<string | null>(null);

  const integrationsQuery = useQuery({
    queryKey: ["workspace-integrations"],
    queryFn: () => getWorkspaceIntegrations(),
  });

  const spacesQuery = useQuery({
    queryKey: ["spaces", { limit: 100 }],
    queryFn: () => getSpaces({ limit: 100 }),
  });

  const channelMappingsQuery = useQuery({
    queryKey: ["slack-channel-mappings"],
    queryFn: () => getSlackChannelMappings(),
    enabled: !!integrationsQuery.data?.slack?.enabled,
  });

  const addSlackMappingMutation = useMutation({
    mutationFn: addSlackChannelMapping,
    onSuccess: () => {
      notifications.show({
        title: t("Saved"),
        message: t("Channel mapping added"),
        color: "green",
      });
      queryClient.invalidateQueries({ queryKey: ["slack-channel-mappings"] });
      setNewSlackChannelId("");
      setNewSlackSpaceId(null);
    },
    onError: () => {
      notifications.show({
        title: t("Error"),
        message: t("Failed to add channel mapping"),
        color: "red",
      });
    },
  });

  const removeSlackMappingMutation = useMutation({
    mutationFn: removeSlackChannelMapping,
    onSuccess: () => {
      notifications.show({
        title: t("Removed"),
        message: t("Channel mapping removed"),
        color: "green",
      });
      queryClient.invalidateQueries({ queryKey: ["slack-channel-mappings"] });
    },
    onError: () => {
      notifications.show({
        title: t("Error"),
        message: t("Failed to remove channel mapping"),
        color: "red",
      });
    },
  });

  // Discord channel mappings
  const discordChannelMappingsQuery = useQuery({
    queryKey: ["discord-channel-mappings"],
    queryFn: () => getDiscordChannelMappings(),
    enabled: !!integrationsQuery.data?.discord?.enabled,
  });

  const addDiscordMappingMutation = useMutation({
    mutationFn: addDiscordChannelMapping,
    onSuccess: () => {
      notifications.show({
        title: t("Saved"),
        message: t("Channel mapping added"),
        color: "green",
      });
      queryClient.invalidateQueries({ queryKey: ["discord-channel-mappings"] });
      setNewDiscordChannelId("");
      setNewDiscordSpaceId(null);
    },
    onError: () => {
      notifications.show({
        title: t("Error"),
        message: t("Failed to add channel mapping"),
        color: "red",
      });
    },
  });

  const removeDiscordMappingMutation = useMutation({
    mutationFn: removeDiscordChannelMapping,
    onSuccess: () => {
      notifications.show({
        title: t("Removed"),
        message: t("Channel mapping removed"),
        color: "green",
      });
      queryClient.invalidateQueries({ queryKey: ["discord-channel-mappings"] });
    },
    onError: () => {
      notifications.show({
        title: t("Error"),
        message: t("Failed to remove channel mapping"),
        color: "red",
      });
    },
  });

  const form = useForm<SlackForm & DiscordForm>({
    initialValues: {
      slackEnabled: false,
      slackTeamId: "",
      slackBotToken: "",
      slackSigningSecret: "",
      slackDefaultChannelId: "",
      slackDefaultUserId: "",
      discordEnabled: false,
      discordGuildId: "",
      discordBotToken: "",
      discordPublicKey: "",
      discordApplicationId: "",
      discordDefaultChannelId: "",
      discordDefaultUserId: "",
    },
  });

  const updateMutation = useMutation({
    mutationFn: (values: SlackForm & DiscordForm) =>
      updateWorkspaceIntegrations({
        slack: {
          enabled: values.slackEnabled,
          teamId: values.slackTeamId || undefined,
          botToken: values.slackBotToken || undefined,
          signingSecret: values.slackSigningSecret || undefined,
          defaultChannelId: values.slackDefaultChannelId || undefined,
          defaultUserId: values.slackDefaultUserId || undefined,
        },
        discord: {
          enabled: values.discordEnabled,
          guildId: values.discordGuildId || undefined,
          botToken: values.discordBotToken || undefined,
          publicKey: values.discordPublicKey || undefined,
          applicationId: values.discordApplicationId || undefined,
          defaultChannelId: values.discordDefaultChannelId || undefined,
          defaultUserId: values.discordDefaultUserId || undefined,
        },
      }),
    onSuccess: () => {
      notifications.show({
        title: t("Saved"),
        message: t("Chat integrations updated"),
        color: "green",
      });
      queryClient.invalidateQueries({ queryKey: ["workspace-integrations"] });
    },
    onError: () => {
      notifications.show({
        title: t("Error"),
        message: t("Failed to update chat integrations"),
        color: "red",
      });
    },
  });

  const slack = integrationsQuery.data?.slack;
  const discord = integrationsQuery.data?.discord;

  useEffect(() => {
    if (!integrationsQuery.data) return;
    form.setValues((current) => ({
      ...current,
      slackEnabled:
        integrationsQuery.data?.slack?.enabled ?? current.slackEnabled,
      slackTeamId: integrationsQuery.data?.slack?.teamId ?? current.slackTeamId,
      slackDefaultChannelId:
        integrationsQuery.data?.slack?.defaultChannelId ??
        current.slackDefaultChannelId,
      slackDefaultUserId:
        integrationsQuery.data?.slack?.defaultUserId ??
        current.slackDefaultUserId,
      discordEnabled:
        integrationsQuery.data?.discord?.enabled ?? current.discordEnabled,
      discordGuildId:
        integrationsQuery.data?.discord?.guildId ?? current.discordGuildId,
      discordDefaultChannelId:
        integrationsQuery.data?.discord?.defaultChannelId ??
        current.discordDefaultChannelId,
      discordDefaultUserId:
        integrationsQuery.data?.discord?.defaultUserId ??
        current.discordDefaultUserId,
    }));
  }, [integrationsQuery.data]);

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t(
          "Connect Slack or Discord to run agent commands, research, and approvals from chat."
        )}
      </Text>

      <Text fw={600}>{t("Slack")}</Text>
      <Switch
        label={t("Enable Slack")}
        checked={form.values.slackEnabled}
        onChange={(event) =>
          form.setFieldValue("slackEnabled", event.currentTarget.checked)
        }
      />
      <TextInput
        label={t("Slack team ID")}
        placeholder="T0123456"
        {...form.getInputProps("slackTeamId")}
      />
      {slack?.teamId ? (
        <Text size="xs" c="dimmed">
          {t("Slack team configured")}: {slack.teamId}
        </Text>
      ) : null}
      <TextInput
        label={t("Slack bot token")}
        placeholder="xoxb-..."
        type="password"
        {...form.getInputProps("slackBotToken")}
      />
      <TextInput
        label={t("Slack signing secret")}
        placeholder="..."
        type="password"
        {...form.getInputProps("slackSigningSecret")}
      />
      {slack?.configured ? (
        <Text size="xs" c="dimmed">
          {t("Slack credentials saved")}
        </Text>
      ) : null}
      <TextInput
        label={t("Default channel ID")}
        placeholder="C0123456"
        {...form.getInputProps("slackDefaultChannelId")}
      />
      <TextInput
        label={t("Default Raven user ID")}
        placeholder="UUID"
        {...form.getInputProps("slackDefaultUserId")}
      />

      {form.values.slackEnabled && (
        <>
          <Divider my="sm" />
          <Text fw={600}>{t("Channel → Space Mappings")}</Text>
          <Text size="xs" c="dimmed">
            {t("Map Slack channels to Raven spaces. When users run commands in a channel, docs will be created in the mapped space.")}
          </Text>

          {channelMappingsQuery.data?.mappings && channelMappingsQuery.data.mappings.length > 0 && (
            <Paper withBorder p="xs">
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t("Slack Channel ID")}</Table.Th>
                    <Table.Th>{t("Space")}</Table.Th>
                    <Table.Th w={50}></Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {channelMappingsQuery.data.mappings.map((mapping: IChannelMapping) => {
                    const space = spacesQuery.data?.items?.find(s => s.id === mapping.spaceId);
                    return (
                      <Table.Tr key={mapping.slackChannelId}>
                        <Table.Td>
                          <Text size="sm" ff="monospace">{mapping.slackChannelId}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">{space?.name || mapping.spaceName || mapping.spaceId}</Text>
                        </Table.Td>
                        <Table.Td>
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            size="sm"
                            onClick={() => removeSlackMappingMutation.mutate({ slackChannelId: mapping.slackChannelId })}
                            loading={removeSlackMappingMutation.isPending}
                          >
                            <IconTrash size={16} />
                          </ActionIcon>
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </Paper>
          )}

          <Group gap="sm" align="flex-end">
            <TextInput
              label={t("Channel ID")}
              placeholder="C0123456"
              value={newSlackChannelId}
              onChange={(e) => setNewSlackChannelId(e.currentTarget.value)}
              style={{ flex: 1 }}
            />
            <Select
              label={t("Space")}
              placeholder={t("Select a space")}
              value={newSlackSpaceId}
              onChange={setNewSlackSpaceId}
              data={spacesQuery.data?.items?.map(space => ({
                value: space.id,
                label: space.name,
              })) || []}
              style={{ flex: 1 }}
              searchable
            />
            <Button
              onClick={() => {
                if (newSlackChannelId && newSlackSpaceId) {
                  addSlackMappingMutation.mutate({
                    slackChannelId: newSlackChannelId,
                    spaceId: newSlackSpaceId,
                  });
                }
              }}
              disabled={!newSlackChannelId || !newSlackSpaceId}
              loading={addSlackMappingMutation.isPending}
            >
              {t("Add Mapping")}
            </Button>
          </Group>
        </>
      )}

      <Divider my="sm" />

      <Text fw={600}>{t("Discord")}</Text>
      <Switch
        label={t("Enable Discord")}
        checked={form.values.discordEnabled}
        onChange={(event) =>
          form.setFieldValue("discordEnabled", event.currentTarget.checked)
        }
      />
      <TextInput
        label={t("Discord guild ID")}
        placeholder="1234567890"
        {...form.getInputProps("discordGuildId")}
      />
      {discord?.guildId ? (
        <Text size="xs" c="dimmed">
          {t("Discord guild configured")}: {discord.guildId}
        </Text>
      ) : null}
      <TextInput
        label={t("Discord bot token")}
        placeholder="..."
        type="password"
        {...form.getInputProps("discordBotToken")}
      />
      <TextInput
        label={t("Discord public key")}
        placeholder="..."
        type="password"
        {...form.getInputProps("discordPublicKey")}
      />
      <TextInput
        label={t("Discord application ID")}
        placeholder="1234567890"
        {...form.getInputProps("discordApplicationId")}
      />
      {discord?.configured ? (
        <Text size="xs" c="dimmed">
          {t("Discord credentials saved")}
        </Text>
      ) : null}
      <TextInput
        label={t("Default channel ID")}
        placeholder="1234567890"
        {...form.getInputProps("discordDefaultChannelId")}
      />
      <TextInput
        label={t("Default Raven user ID")}
        placeholder="UUID"
        {...form.getInputProps("discordDefaultUserId")}
      />

      {form.values.discordEnabled && (
        <>
          <Divider my="sm" />
          <Text fw={600}>{t("Channel → Space Mappings")}</Text>
          <Text size="xs" c="dimmed">
            {t("Map Discord channels to Raven spaces. When users run commands in a channel, docs will be created in the mapped space.")}
          </Text>

          {discordChannelMappingsQuery.data?.mappings && discordChannelMappingsQuery.data.mappings.length > 0 && (
            <Paper withBorder p="xs">
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t("Discord Channel ID")}</Table.Th>
                    <Table.Th>{t("Space")}</Table.Th>
                    <Table.Th w={50}></Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {discordChannelMappingsQuery.data.mappings.map((mapping: IDiscordChannelMapping) => {
                    const space = spacesQuery.data?.items?.find(s => s.id === mapping.spaceId);
                    return (
                      <Table.Tr key={mapping.discordChannelId}>
                        <Table.Td>
                          <Text size="sm" ff="monospace">{mapping.discordChannelId}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">{space?.name || mapping.spaceName || mapping.spaceId}</Text>
                        </Table.Td>
                        <Table.Td>
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            size="sm"
                            onClick={() => removeDiscordMappingMutation.mutate({ discordChannelId: mapping.discordChannelId })}
                            loading={removeDiscordMappingMutation.isPending}
                          >
                            <IconTrash size={16} />
                          </ActionIcon>
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </Paper>
          )}

          <Group gap="sm" align="flex-end">
            <TextInput
              label={t("Channel ID")}
              placeholder="1234567890"
              value={newDiscordChannelId}
              onChange={(e) => setNewDiscordChannelId(e.currentTarget.value)}
              style={{ flex: 1 }}
            />
            <Select
              label={t("Space")}
              placeholder={t("Select a space")}
              value={newDiscordSpaceId}
              onChange={setNewDiscordSpaceId}
              data={spacesQuery.data?.items?.map(space => ({
                value: space.id,
                label: space.name,
              })) || []}
              style={{ flex: 1 }}
              searchable
            />
            <Button
              onClick={() => {
                if (newDiscordChannelId && newDiscordSpaceId) {
                  addDiscordMappingMutation.mutate({
                    discordChannelId: newDiscordChannelId,
                    spaceId: newDiscordSpaceId,
                  });
                }
              }}
              disabled={!newDiscordChannelId || !newDiscordSpaceId}
              loading={addDiscordMappingMutation.isPending}
            >
              {t("Add Mapping")}
            </Button>
          </Group>
        </>
      )}

      <Group justify="flex-end">
        <Button
          loading={updateMutation.isPending}
          onClick={() => updateMutation.mutate(form.values)}
        >
          {t("Save chat integrations")}
        </Button>
      </Group>
    </Stack>
  );
}
