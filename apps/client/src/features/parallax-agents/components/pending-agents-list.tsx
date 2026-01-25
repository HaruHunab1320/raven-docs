import {
  Card,
  Text,
  Group,
  Badge,
  Button,
  Stack,
  Paper,
  Loader,
  Center,
  Title,
  Tooltip,
} from "@mantine/core";
import { IconRobot, IconCheck, IconX } from "@tabler/icons-react";
import { usePendingRequests } from "../queries/parallax-agent-query";
import { ParallaxAgent } from "../services/parallax-agent-service";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useState } from "react";
import { ApproveAgentModal } from "./approve-agent-modal";
import { DenyAgentModal } from "./deny-agent-modal";

dayjs.extend(relativeTime);

export function PendingAgentsList() {
  const { t } = useTranslation();
  const { data: agents, isLoading } = usePendingRequests();
  const [selectedAgent, setSelectedAgent] = useState<ParallaxAgent | null>(null);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showDenyModal, setShowDenyModal] = useState(false);

  if (isLoading) {
    return (
      <Center py="xl">
        <Loader />
      </Center>
    );
  }

  if (!agents || agents.length === 0) {
    return (
      <Paper p="lg" withBorder>
        <Text size="sm" c="dimmed" ta="center">
          {t("No pending agent access requests")}
        </Text>
      </Paper>
    );
  }

  const handleApprove = (agent: ParallaxAgent) => {
    setSelectedAgent(agent);
    setShowApproveModal(true);
  };

  const handleDeny = (agent: ParallaxAgent) => {
    setSelectedAgent(agent);
    setShowDenyModal(true);
  };

  return (
    <>
      <Stack gap="md">
        <Title order={4}>{t("Pending Access Requests")}</Title>
        {agents.map((agent) => (
          <Card key={agent.id} shadow="sm" padding="lg" radius="md" withBorder>
            <Group justify="space-between" mb="xs">
              <Group>
                <IconRobot size={24} />
                <Text fw={500}>{agent.name}</Text>
              </Group>
              <Badge color="yellow" variant="light">
                {t("Pending")}
              </Badge>
            </Group>

            {agent.description && (
              <Text size="sm" c="dimmed" mb="md">
                {agent.description}
              </Text>
            )}

            <Stack gap="xs" mb="md">
              <Group gap="xs">
                <Text size="sm" fw={500}>
                  {t("Capabilities")}:
                </Text>
                <Group gap={4}>
                  {agent.capabilities.map((cap) => (
                    <Badge key={cap} size="xs" variant="outline">
                      {cap}
                    </Badge>
                  ))}
                </Group>
              </Group>

              <Group gap="xs">
                <Text size="sm" fw={500}>
                  {t("Requested Permissions")}:
                </Text>
                <Group gap={4}>
                  {agent.requestedPermissions.map((perm) => (
                    <Tooltip key={perm} label={perm}>
                      <Badge size="xs" color="blue" variant="light">
                        {perm.split(":")[0]}
                      </Badge>
                    </Tooltip>
                  ))}
                </Group>
              </Group>

              <Text size="xs" c="dimmed">
                {t("Requested")} {dayjs(agent.requestedAt).fromNow()}
              </Text>
            </Stack>

            <Group>
              <Button
                size="sm"
                color="green"
                leftSection={<IconCheck size={16} />}
                onClick={() => handleApprove(agent)}
              >
                {t("Approve")}
              </Button>
              <Button
                size="sm"
                color="red"
                variant="outline"
                leftSection={<IconX size={16} />}
                onClick={() => handleDeny(agent)}
              >
                {t("Deny")}
              </Button>
            </Group>
          </Card>
        ))}
      </Stack>

      {selectedAgent && (
        <>
          <ApproveAgentModal
            agent={selectedAgent}
            opened={showApproveModal}
            onClose={() => {
              setShowApproveModal(false);
              setSelectedAgent(null);
            }}
          />
          <DenyAgentModal
            agent={selectedAgent}
            opened={showDenyModal}
            onClose={() => {
              setShowDenyModal(false);
              setSelectedAgent(null);
            }}
          />
        </>
      )}
    </>
  );
}
