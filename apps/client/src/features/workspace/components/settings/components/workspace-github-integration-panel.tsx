import { useTranslation } from "react-i18next";
import {
  Avatar,
  Badge,
  Button,
  Group,
  Loader,
  Stack,
  Text,
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  authorizeGitHub,
  disconnectGitHub,
  getGitHubStatus,
} from "@/features/workspace/services/workspace-service";
import { notifications } from "@mantine/notifications";
import { useSearchParams } from "react-router-dom";
import { useEffect, useRef } from "react";
import { IconBrandGithub } from "@tabler/icons-react";

export function WorkspaceGitHubIntegrationPanel() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const notifiedRef = useRef(false);

  const statusQuery = useQuery({
    queryKey: ["github-status"],
    queryFn: () => getGitHubStatus(),
  });

  // Handle OAuth callback redirect params
  useEffect(() => {
    const githubParam = searchParams.get("github");
    if (!githubParam || notifiedRef.current) return;

    notifiedRef.current = true;

    if (githubParam === "connected") {
      notifications.show({
        title: t("GitHub connected"),
        message: t("Your GitHub account has been linked to this workspace."),
        color: "green",
      });
      queryClient.invalidateQueries({ queryKey: ["github-status"] });
    } else if (githubParam === "error") {
      notifications.show({
        title: t("GitHub connection failed"),
        message: t(
          "Could not connect your GitHub account. Please try again.",
        ),
        color: "red",
      });
    }

    // Clean up URL params
    searchParams.delete("github");
    searchParams.delete("reason");
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams, queryClient, t]);

  const connectMutation = useMutation({
    mutationFn: () => authorizeGitHub(),
    onSuccess: (data) => {
      window.location.href = data.authorizationUrl;
    },
    onError: () => {
      notifications.show({
        title: t("Error"),
        message: t("Failed to start GitHub authorization."),
        color: "red",
      });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: () => disconnectGitHub(),
    onSuccess: () => {
      notifications.show({
        title: t("Disconnected"),
        message: t("GitHub account has been disconnected."),
        color: "green",
      });
      queryClient.invalidateQueries({ queryKey: ["github-status"] });
    },
    onError: () => {
      notifications.show({
        title: t("Error"),
        message: t("Failed to disconnect GitHub account."),
        color: "red",
      });
    },
  });

  const status = statusQuery.data;

  if (statusQuery.isLoading) {
    return (
      <Group justify="center" py="md">
        <Loader size="sm" />
      </Group>
    );
  }

  if (status?.connected) {
    return (
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          {t(
            "Connect your GitHub account to allow coding agents to clone private repos and create pull requests.",
          )}
        </Text>
        <Group gap="sm">
          <Avatar
            src={status.githubAvatarUrl}
            size="sm"
            radius="xl"
          />
          <Stack gap={0}>
            <Text size="sm" fw={500}>
              {status.githubUsername}
            </Text>
            <Text size="xs" c="dimmed">
              {t("Connected")}
              {status.connectedAt &&
                ` ${new Date(status.connectedAt).toLocaleDateString()}`}
            </Text>
          </Stack>
          {status.scopes && status.scopes.length > 0 && (
            <Group gap={4}>
              {status.scopes.map((scope) => (
                <Badge key={scope} size="xs" variant="light">
                  {scope}
                </Badge>
              ))}
            </Group>
          )}
        </Group>
        <Group justify="flex-end">
          <Button
            variant="light"
            color="red"
            size="xs"
            loading={disconnectMutation.isPending}
            onClick={() => disconnectMutation.mutate()}
          >
            {t("Disconnect GitHub")}
          </Button>
        </Group>
      </Stack>
    );
  }

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t(
          "Connect your GitHub account to allow coding agents to clone private repos and create pull requests.",
        )}
      </Text>
      <Group justify="flex-start">
        <Button
          leftSection={<IconBrandGithub size={16} />}
          loading={connectMutation.isPending}
          onClick={() => connectMutation.mutate()}
        >
          {t("Connect GitHub")}
        </Button>
      </Group>
    </Stack>
  );
}
