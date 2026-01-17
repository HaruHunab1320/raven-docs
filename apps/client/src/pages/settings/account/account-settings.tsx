import AccountNameForm from "@/features/user/components/account-name-form";
import ChangeEmail from "@/features/user/components/change-email";
import ChangePassword from "@/features/user/components/change-password";
import { Button, Divider, Stack, Text } from "@mantine/core";
import AccountAvatar from "@/features/user/components/account-avatar";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import {getAppName} from "@/lib/config.ts";
import {Helmet} from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { useAtom } from "jotai";
import { currentUserAtom } from "@/features/user/atoms/current-user-atom";
import { useMutation } from "@tanstack/react-query";
import { agentMemoryService } from "@/features/agent-memory/services/agent-memory-service";
import { notifications } from "@mantine/notifications";

export default function AccountSettings() {
  const { t } = useTranslation();
  const [currentUser] = useAtom(currentUserAtom);
  const workspaceId = currentUser?.workspace?.id;
  const userId = currentUser?.id;

  const eraseMutation = useMutation({
    mutationFn: () =>
      agentMemoryService.delete({
        workspaceId: workspaceId || "",
        tags: userId ? [`user:${userId}`] : [],
      }),
    onSuccess: (data) => {
      notifications.show({
        title: "Data erased",
        message: `Removed ${data.deleted} memory entries.`,
        color: "green",
      });
    },
    onError: () => {
      notifications.show({
        title: "Error",
        message: "Failed to erase data",
        color: "red",
      });
    },
  });

  return (
    <>
        <Helmet>
            <title>{t("My Profile")} - {getAppName()}</title>
        </Helmet>
      <SettingsTitle title={t("My Profile")} />

      <AccountAvatar />

      <AccountNameForm />

      <Divider my="lg" />

      <ChangeEmail />

      <Divider my="lg" />

      <ChangePassword />

      <Divider my="lg" />

      <SettingsTitle title={t("Data & Privacy")} />
      <Stack gap="xs">
        <Text size="sm" c="dimmed">
          Erase all agent memory entries tied to your account in this workspace.
        </Text>
        <Button
          size="sm"
          color="red"
          variant="light"
          loading={eraseMutation.isPending}
          disabled={!workspaceId || !userId}
          onClick={() => {
            const confirmed = window.confirm(
              "Erase all agent memory entries for your account? This cannot be undone.",
            );
            if (confirmed) {
              eraseMutation.mutate();
            }
          }}
        >
          Erase my data
        </Button>
      </Stack>
    </>
  );
}
