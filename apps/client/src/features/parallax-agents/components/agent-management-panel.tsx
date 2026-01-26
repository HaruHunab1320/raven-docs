import { Tabs, Stack, Title, Group, Badge, Paper } from "@mantine/core";
import { IconRobot, IconClock, IconActivity, IconList, IconTicket } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { PendingAgentsList } from "./pending-agents-list";
import { AgentList } from "./agent-list";
import { AgentActivityFeed } from "./agent-activity-feed";
import { InvitesList } from "./invites-list";
import { usePendingRequests, useWorkspaceAgents, useActiveInvites } from "../queries/parallax-agent-query";
import { useState } from "react";
import { ParallaxAgent } from "../services/parallax-agent-service";
import { AgentDetailPanel } from "./agent-detail-panel";

export function AgentManagementPanel() {
  const { t } = useTranslation();
  const { data: pendingAgents } = usePendingRequests();
  const { data: allAgents } = useWorkspaceAgents();
  const { data: activeInvites } = useActiveInvites();
  const [selectedAgent, setSelectedAgent] = useState<ParallaxAgent | null>(null);

  const pendingCount = pendingAgents?.length || 0;
  const totalAgents = allAgents?.length || 0;
  const approvedCount = allAgents?.filter((a) => a.status === "approved").length || 0;
  const inviteCount = activeInvites?.length || 0;

  if (selectedAgent) {
    return (
      <AgentDetailPanel
        agent={selectedAgent}
        onBack={() => setSelectedAgent(null)}
      />
    );
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Group>
          <IconRobot size={28} />
          <Title order={2}>{t("Agents")}</Title>
        </Group>
        <Group gap="xs">
          <Badge variant="light" color="green">
            {approvedCount} {t("active")}
          </Badge>
          <Badge variant="light" color="blue">
            {totalAgents} {t("total")}
          </Badge>
          {pendingCount > 0 && (
            <Badge variant="filled" color="yellow">
              {pendingCount} {t("pending")}
            </Badge>
          )}
        </Group>
      </Group>

      <Tabs defaultValue={pendingCount > 0 ? "pending" : "agents"}>
        <Tabs.List>
          <Tabs.Tab
            value="pending"
            leftSection={<IconClock size={16} />}
            rightSection={
              pendingCount > 0 ? (
                <Badge size="xs" variant="filled" color="yellow">
                  {pendingCount}
                </Badge>
              ) : null
            }
          >
            {t("Pending Requests")}
          </Tabs.Tab>
          <Tabs.Tab value="agents" leftSection={<IconList size={16} />}>
            {t("All Agents")}
          </Tabs.Tab>
          <Tabs.Tab
            value="invites"
            leftSection={<IconTicket size={16} />}
            rightSection={
              inviteCount > 0 ? (
                <Badge size="xs" variant="light" color="blue">
                  {inviteCount}
                </Badge>
              ) : null
            }
          >
            {t("Invites")}
          </Tabs.Tab>
          <Tabs.Tab value="activity" leftSection={<IconActivity size={16} />}>
            {t("Activity Feed")}
          </Tabs.Tab>
        </Tabs.List>

        <Paper p="md" mt="md">
          <Tabs.Panel value="pending">
            <PendingAgentsList />
          </Tabs.Panel>

          <Tabs.Panel value="agents">
            <AgentList onSelectAgent={setSelectedAgent} />
          </Tabs.Panel>

          <Tabs.Panel value="invites">
            <InvitesList />
          </Tabs.Panel>

          <Tabs.Panel value="activity">
            <AgentActivityFeed showTitle={false} />
          </Tabs.Panel>
        </Paper>
      </Tabs>
    </Stack>
  );
}
