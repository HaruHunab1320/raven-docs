import { Container, Text, Alert, Stack } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { TeamManagementPanel } from "@/features/teams";
import SettingsTitle from "@/components/settings/settings-title";
import useUserRole from "@/hooks/use-user-role";

export default function TeamsSettings() {
  const { t } = useTranslation();
  const { isAdmin, isOwner } = useUserRole();

  if (!isAdmin && !isOwner) {
    return (
      <Container>
        <Alert icon={<IconInfoCircle />} color="yellow">
          <Text size="sm">
            {t("You don't have permission to manage teams")}
          </Text>
        </Alert>
      </Container>
    );
  }

  return (
    <Container fluid>
      <Stack gap="xl">
        <div>
          <SettingsTitle title={t("Teams")} />
          <Text c="dimmed" size="sm" mt="xs">
            {t(
              "Manage team templates and deployments. Deploy coordinated AI agent teams to your spaces.",
            )}
          </Text>
        </div>

        <TeamManagementPanel />
      </Stack>
    </Container>
  );
}
