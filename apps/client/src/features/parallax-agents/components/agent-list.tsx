import {
  Table,
  Text,
  Group,
  Badge,
  ActionIcon,
  Tooltip,
  Paper,
  ScrollArea,
  Menu,
  Loader,
  Center,
  SegmentedControl,
  Stack,
} from "@mantine/core";
import {
  IconDotsVertical,
  IconTrash,
  IconSettings,
  IconActivity,
} from "@tabler/icons-react";
import { AgentAvatar } from "./agent-avatar";
import { useWorkspaceAgents, useRevokeAgent } from "../queries/parallax-agent-query";
import { ParallaxAgent, ParallaxAgentStatus } from "../services/parallax-agent-service";
import { modals } from "@mantine/modals";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useState } from "react";

dayjs.extend(relativeTime);

const STATUS_COLORS: Record<ParallaxAgentStatus, string> = {
  pending: "yellow",
  approved: "green",
  denied: "red",
  revoked: "gray",
};

interface AgentListProps {
  onSelectAgent?: (agent: ParallaxAgent) => void;
}

export function AgentList({ onSelectAgent }: AgentListProps) {
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { data: agents, isLoading } = useWorkspaceAgents(
    statusFilter === "all" ? undefined : (statusFilter as ParallaxAgentStatus)
  );
  const revokeAgent = useRevokeAgent();

  const handleRevoke = (agent: ParallaxAgent) => {
    modals.openConfirmModal({
      title: t("Revoke Agent Access"),
      children: (
        <Stack gap="sm">
          <Text size="sm">
            {t("Are you sure you want to revoke access for")} "{agent.name}"?
          </Text>
          <Text size="sm" c="dimmed">
            {t("This will immediately terminate all agent sessions and remove all assignments.")}
          </Text>
        </Stack>
      ),
      labels: { confirm: t("Revoke"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: () => {
        revokeAgent.mutate({
          agentId: agent.id,
          data: { reason: "Revoked by administrator" },
        });
      },
    });
  };

  if (isLoading) {
    return (
      <Center py="xl">
        <Loader />
      </Center>
    );
  }

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <SegmentedControl
          value={statusFilter}
          onChange={setStatusFilter}
          data={[
            { label: t("All"), value: "all" },
            { label: t("Approved"), value: "approved" },
            { label: t("Pending"), value: "pending" },
            { label: t("Denied"), value: "denied" },
            { label: t("Revoked"), value: "revoked" },
          ]}
        />
      </Group>

      {!agents || agents.length === 0 ? (
        <Paper p="lg" withBorder>
          <Text size="sm" c="dimmed" ta="center">
            {statusFilter === "all"
              ? t("No agents registered in this workspace")
              : t("No agents with status: {{status}}", { status: statusFilter })}
          </Text>
        </Paper>
      ) : (
        <ScrollArea>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("Agent")}</Table.Th>
                <Table.Th>{t("Status")}</Table.Th>
                <Table.Th>{t("Capabilities")}</Table.Th>
                <Table.Th>{t("Permissions")}</Table.Th>
                <Table.Th>{t("Added")}</Table.Th>
                <Table.Th>{t("Actions")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {agents.map((agent) => (
                <Table.Tr
                  key={agent.id}
                  style={{ cursor: onSelectAgent ? "pointer" : "default" }}
                  onClick={() => onSelectAgent?.(agent)}
                >
                  <Table.Td>
                    <Group gap="sm">
                      <AgentAvatar
                        name={agent.name}
                        avatarUrl={agent.avatarUrl}
                        size="sm"
                      />
                      <div>
                        <Text fw={500}>{agent.name}</Text>
                        {agent.description && (
                          <Text size="xs" c="dimmed" lineClamp={1}>
                            {agent.description}
                          </Text>
                        )}
                      </div>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={STATUS_COLORS[agent.status]} variant="light">
                      {t(agent.status)}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4}>
                      {agent.capabilities.slice(0, 2).map((cap) => (
                        <Badge key={cap} size="xs" variant="outline">
                          {cap}
                        </Badge>
                      ))}
                      {agent.capabilities.length > 2 && (
                        <Tooltip
                          label={agent.capabilities.slice(2).join(", ")}
                        >
                          <Badge size="xs" variant="outline">
                            +{agent.capabilities.length - 2}
                          </Badge>
                        </Tooltip>
                      )}
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">
                      {agent.grantedPermissions?.length || 0} {t("granted")}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {dayjs(agent.createdAt).fromNow()}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Menu withinPortal position="bottom-end" shadow="sm">
                      <Menu.Target>
                        <ActionIcon
                          variant="subtle"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <IconDotsVertical size={16} />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item
                          leftSection={<IconActivity size={14} />}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectAgent?.(agent);
                          }}
                        >
                          {t("View Activity")}
                        </Menu.Item>
                        <Menu.Item
                          leftSection={<IconSettings size={14} />}
                          onClick={(e) => {
                            e.stopPropagation();
                            // TODO: Open permissions modal
                          }}
                        >
                          {t("Manage Permissions")}
                        </Menu.Item>
                        {agent.status === "approved" && (
                          <>
                            <Menu.Divider />
                            <Menu.Item
                              color="red"
                              leftSection={<IconTrash size={14} />}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRevoke(agent);
                              }}
                            >
                              {t("Revoke Access")}
                            </Menu.Item>
                          </>
                        )}
                      </Menu.Dropdown>
                    </Menu>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      )}
    </Stack>
  );
}
