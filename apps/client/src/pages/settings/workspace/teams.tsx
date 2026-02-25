import {
  Container,
  Text,
  Alert,
  Stack,
  Card,
  Group,
  Select,
  Button,
} from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { TeamManagementPanel } from "@/features/teams";
import SettingsTitle from "@/components/settings/settings-title";
import useUserRole from "@/hooks/use-user-role";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { useEffect, useState } from "react";
import {
  getWorkspaceIntelligenceSettings,
  updateWorkspaceIntelligenceSettings,
} from "@/features/workspace/services/workspace-service";
import { TEAM_AGENT_TYPE_OPTIONS } from "@/features/teams/constants/agent-types";

export default function TeamsSettings() {
  const { t } = useTranslation();
  const { isAdmin, isOwner } = useUserRole();
  const queryClient = useQueryClient();
  const [defaultAgentType, setDefaultAgentType] = useState("claude");

  const intelligenceQuery = useQuery({
    queryKey: ["workspace-intelligence-settings"],
    queryFn: getWorkspaceIntelligenceSettings,
  });

  useEffect(() => {
    const nextValue = intelligenceQuery.data?.defaultTeamAgentType || "claude";
    setDefaultAgentType(nextValue);
  }, [intelligenceQuery.data?.defaultTeamAgentType]);

  const updateIntelligenceMutation = useMutation({
    mutationFn: (agentType: string) =>
      updateWorkspaceIntelligenceSettings({
        defaultTeamAgentType: agentType,
      }),
    onSuccess: () => {
      notifications.show({
        title: "Updated",
        message: "Default team coding adapter saved",
        color: "green",
      });
      queryClient.invalidateQueries({
        queryKey: ["workspace-intelligence-settings"],
      });
    },
    onError: () => {
      notifications.show({
        title: "Error",
        message: "Failed to save team settings",
        color: "red",
      });
    },
  });

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

        <Card withBorder radius="md" p="md">
          <Stack gap="sm">
            <Group justify="space-between" align="end">
              <div>
                <Text fw={600} size="sm">
                  Default Team Coding Adapter
                </Text>
                <Text c="dimmed" size="xs">
                  Used when a role in the org chart does not specify an adapter.
                </Text>
              </div>
              <Button
                size="xs"
                onClick={() =>
                  updateIntelligenceMutation.mutate(defaultAgentType)
                }
                loading={updateIntelligenceMutation.isPending}
                disabled={!isAdmin && !isOwner}
              >
                Save
              </Button>
            </Group>
            <Select
              data={TEAM_AGENT_TYPE_OPTIONS}
              value={defaultAgentType}
              onChange={(value) => setDefaultAgentType(value || "claude")}
              disabled={intelligenceQuery.isLoading}
            />
          </Stack>
        </Card>

        <TeamManagementPanel />
      </Stack>
    </Container>
  );
}
