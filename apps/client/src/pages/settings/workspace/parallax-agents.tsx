import { Container, Text, Alert, Stack } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { AgentManagementPanel } from "@/features/parallax-agents";
import SettingsTitle from "@/components/settings/settings-title";
import useUserRole from "@/hooks/use-user-role";

export default function ParallaxAgentsSettings() {
  const { t } = useTranslation();
  const { isAdmin, isOwner } = useUserRole();

  // Only admins and owners can manage Parallax agents
  if (!isAdmin && !isOwner) {
    return (
      <Container>
        <Alert icon={<IconInfoCircle />} color="yellow">
          <Text size="sm">
            {t("You don't have permission to manage agents")}
          </Text>
        </Alert>
      </Container>
    );
  }

  return (
    <Container fluid>
      <Stack gap="xl">
        <div>
          <SettingsTitle title={t("Agents")} />
          <Text c="dimmed" size="sm" mt="xs">
            {t(
              "Manage AI agents that can access and interact with your workspace"
            )}
          </Text>
        </div>

        <AgentManagementPanel />
      </Stack>
    </Container>
  );
}
