import { useTranslation } from "react-i18next";
import { Button, Group, Stack, TextInput, Text, Switch, Divider } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  getWorkspaceIntegrations,
  updateWorkspaceIntegrations,
} from "@/features/workspace/services/workspace-service";
import { notifications } from "@mantine/notifications";

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

  const integrationsQuery = useQuery({
    queryKey: ["workspace-integrations"],
    queryFn: () => getWorkspaceIntegrations(),
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
      slackEnabled: integrationsQuery.data?.slack?.enabled ?? current.slackEnabled,
      slackTeamId: integrationsQuery.data?.slack?.teamId ?? current.slackTeamId,
      slackDefaultChannelId:
        integrationsQuery.data?.slack?.defaultChannelId ?? current.slackDefaultChannelId,
      slackDefaultUserId:
        integrationsQuery.data?.slack?.defaultUserId ?? current.slackDefaultUserId,
      discordEnabled: integrationsQuery.data?.discord?.enabled ?? current.discordEnabled,
      discordGuildId:
        integrationsQuery.data?.discord?.guildId ?? current.discordGuildId,
      discordDefaultChannelId:
        integrationsQuery.data?.discord?.defaultChannelId ?? current.discordDefaultChannelId,
      discordDefaultUserId:
        integrationsQuery.data?.discord?.defaultUserId ?? current.discordDefaultUserId,
    }));
  }, [integrationsQuery.data, form]);

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
