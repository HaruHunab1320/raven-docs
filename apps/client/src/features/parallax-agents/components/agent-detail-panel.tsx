import { useState } from "react";
import {
  Stack,
  Title,
  Group,
  Badge,
  Paper,
  Text,
  Button,
  Divider,
  SimpleGrid,
  ActionIcon,
  Tooltip,
  Collapse,
  Box,
} from "@mantine/core";
import {
  IconArrowLeft,
  IconShield,
  IconActivity,
  IconTrash,
  IconTerminal2,
  IconPlayerStop,
  IconChevronDown,
  IconChevronUp,
  IconInfoCircle,
} from "@tabler/icons-react";
import { AgentAvatar } from "./agent-avatar";
import { useTranslation } from "react-i18next";
import { ParallaxAgent, ParallaxAgentStatus } from "../services/parallax-agent-service";
import { AgentActivityFeed } from "./agent-activity-feed";
import {
  useAgentAssignments,
  useRevokeAgent,
  useUnassignAgent,
  useAgentTerminalSession,
  useTerminateTerminalSession,
} from "../queries/parallax-agent-query";
import { modals } from "@mantine/modals";
import dayjs from "dayjs";
import { WebTerminal } from "@/features/terminal";

const STATUS_COLORS: Record<ParallaxAgentStatus, string> = {
  pending: "yellow",
  approved: "green",
  denied: "red",
  revoked: "gray",
};

interface AgentDetailPanelProps {
  agent: ParallaxAgent;
  onBack: () => void;
}

export function AgentDetailPanel({ agent, onBack }: AgentDetailPanelProps) {
  const { t } = useTranslation();
  const { data: assignments } = useAgentAssignments(agent.id);
  const { data: terminalSession, isLoading: isLoadingSession } = useAgentTerminalSession(agent.id);
  const revokeAgent = useRevokeAgent();
  const unassignAgent = useUnassignAgent();
  const terminateTerminal = useTerminateTerminalSession();
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);

  const handleRevoke = () => {
    modals.openConfirmModal({
      title: t("Revoke Agent Access"),
      children: (
        <Text size="sm">
          {t("Are you sure you want to revoke access for")} "{agent.name}"?{" "}
          {t("This action will immediately terminate all agent sessions.")}
        </Text>
      ),
      labels: { confirm: t("Revoke"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: () => {
        revokeAgent.mutate(
          {
            agentId: agent.id,
            data: { reason: "Revoked by administrator" },
          },
          {
            onSuccess: () => onBack(),
          }
        );
      },
    });
  };

  const handleUnassign = (assignmentId: string) => {
    modals.openConfirmModal({
      title: t("Remove Assignment"),
      children: (
        <Text size="sm">{t("Are you sure you want to remove this assignment?")}</Text>
      ),
      labels: { confirm: t("Remove"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: () => {
        unassignAgent.mutate(assignmentId);
      },
    });
  };

  const projectAssignments = assignments?.filter((a) => a.assignmentType === "project") || [];
  const taskAssignments = assignments?.filter((a) => a.assignmentType === "task") || [];

  return (
    <Stack gap="lg">
      <Group>
        <ActionIcon variant="subtle" onClick={onBack}>
          <IconArrowLeft size={20} />
        </ActionIcon>
        <AgentAvatar
          name={agent.name}
          avatarUrl={agent.avatarUrl}
          size="lg"
        />
        <Title order={2}>{agent.name}</Title>
        <Badge color={STATUS_COLORS[agent.status]} size="lg">
          {t(agent.status)}
        </Badge>
      </Group>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        {/* Agent Info Card */}
        <Paper p="md" withBorder>
          <Stack gap="sm">
            <Group>
              <IconInfoCircle size={20} />
              <Title order={4}>{t("Agent Information")}</Title>
            </Group>
            <Divider />

            {agent.description && (
              <div>
                <Text size="sm" fw={500}>
                  {t("Description")}
                </Text>
                <Text size="sm" c="dimmed">
                  {agent.description}
                </Text>
              </div>
            )}

            <div>
              <Text size="sm" fw={500}>
                {t("Capabilities")}
              </Text>
              <Group gap={4} mt={4}>
                {agent.capabilities.map((cap) => (
                  <Badge key={cap} size="sm" variant="outline">
                    {cap}
                  </Badge>
                ))}
              </Group>
            </div>

            <div>
              <Text size="sm" fw={500}>
                {t("Registered")}
              </Text>
              <Text size="sm" c="dimmed">
                {dayjs(agent.createdAt).format("MMMM D, YYYY")} (
                {dayjs(agent.createdAt).fromNow()})
              </Text>
            </div>

            {agent.resolvedAt && (
              <div>
                <Text size="sm" fw={500}>
                  {agent.status === "approved" ? t("Approved") : t("Resolved")}
                </Text>
                <Text size="sm" c="dimmed">
                  {dayjs(agent.resolvedAt).format("MMMM D, YYYY")}
                </Text>
              </div>
            )}

            {agent.endpoint && (
              <div>
                <Text size="sm" fw={500}>
                  {t("Endpoint")}
                </Text>
                <Text size="sm" c="dimmed" style={{ wordBreak: "break-all" }}>
                  {agent.endpoint}
                </Text>
              </div>
            )}
          </Stack>
        </Paper>

        {/* Permissions Card */}
        <Paper p="md" withBorder>
          <Stack gap="sm">
            <Group justify="space-between">
              <Group>
                <IconShield size={20} />
                <Title order={4}>{t("Permissions")}</Title>
              </Group>
              <Badge variant="light">
                {agent.grantedPermissions?.length || 0} {t("granted")}
              </Badge>
            </Group>
            <Divider />

            {agent.grantedPermissions && agent.grantedPermissions.length > 0 ? (
              <Stack gap="xs">
                {agent.grantedPermissions.map((perm) => (
                  <Group key={perm} justify="space-between">
                    <Text size="sm">{perm}</Text>
                    <Badge size="xs" variant="light" color="green">
                      {t("granted")}
                    </Badge>
                  </Group>
                ))}
              </Stack>
            ) : (
              <Text size="sm" c="dimmed">
                {t("No permissions granted")}
              </Text>
            )}

            {agent.status === "approved" && (
              <Button
                variant="light"
                color="red"
                leftSection={<IconTrash size={16} />}
                onClick={handleRevoke}
                mt="md"
              >
                {t("Revoke Access")}
              </Button>
            )}
          </Stack>
        </Paper>
      </SimpleGrid>

      {/* Assignments Section */}
      <Paper p="md" withBorder>
        <Stack gap="sm">
          <Group>
            <IconActivity size={20} />
            <Title order={4}>{t("Current Assignments")}</Title>
          </Group>
          <Divider />

          {(!assignments || assignments.length === 0) ? (
            <Text size="sm" c="dimmed">
              {t("No active assignments")}
            </Text>
          ) : (
            <SimpleGrid cols={{ base: 1, md: 2 }}>
              {projectAssignments.length > 0 && (
                <div>
                  <Text size="sm" fw={500} mb="xs">
                    {t("Projects")} ({projectAssignments.length})
                  </Text>
                  <Stack gap="xs">
                    {projectAssignments.map((assignment) => (
                      <Group key={assignment.id} justify="space-between">
                        <Group gap="xs">
                          <Text size="sm">{assignment.projectId}</Text>
                          {assignment.role && (
                            <Badge size="xs">{assignment.role}</Badge>
                          )}
                        </Group>
                        <Tooltip label={t("Remove assignment")}>
                          <ActionIcon
                            size="sm"
                            color="red"
                            variant="subtle"
                            onClick={() => handleUnassign(assignment.id)}
                          >
                            <IconTrash size={14} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    ))}
                  </Stack>
                </div>
              )}

              {taskAssignments.length > 0 && (
                <div>
                  <Text size="sm" fw={500} mb="xs">
                    {t("Tasks")} ({taskAssignments.length})
                  </Text>
                  <Stack gap="xs">
                    {taskAssignments.map((assignment) => (
                      <Group key={assignment.id} justify="space-between">
                        <Text size="sm">{assignment.taskId}</Text>
                        <Tooltip label={t("Remove assignment")}>
                          <ActionIcon
                            size="sm"
                            color="red"
                            variant="subtle"
                            onClick={() => handleUnassign(assignment.id)}
                          >
                            <IconTrash size={14} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    ))}
                  </Stack>
                </div>
              )}
            </SimpleGrid>
          )}
        </Stack>
      </Paper>

      {/* Terminal Section */}
      {agent.status === "approved" && (
        <Paper p="md" withBorder>
          <Stack gap="sm">
            <Group justify="space-between">
              <Group>
                <IconTerminal2 size={20} />
                <Title order={4}>{t("Terminal")}</Title>
              </Group>
              <Group gap="xs">
                {terminalSession && terminalSession.status !== "terminated" ? (
                  <>
                    <Badge
                      color={
                        terminalSession.status === "active"
                          ? "green"
                          : terminalSession.status === "connecting"
                          ? "blue"
                          : terminalSession.status === "login_required"
                          ? "orange"
                          : "gray"
                      }
                      variant="light"
                    >
                      {terminalSession.status}
                    </Badge>
                    <Button
                      size="xs"
                      variant="light"
                      leftSection={isTerminalOpen ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
                      onClick={() => setIsTerminalOpen(!isTerminalOpen)}
                    >
                      {isTerminalOpen ? t("Hide Terminal") : t("Show Terminal")}
                    </Button>
                    <Tooltip label={t("Terminate Session")}>
                      <ActionIcon
                        color="red"
                        variant="light"
                        onClick={() => {
                          modals.openConfirmModal({
                            title: t("Terminate Terminal Session"),
                            children: (
                              <Text size="sm">
                                {t("Are you sure you want to terminate this terminal session?")}
                              </Text>
                            ),
                            labels: { confirm: t("Terminate"), cancel: t("Cancel") },
                            confirmProps: { color: "red" },
                            onConfirm: () => {
                              terminateTerminal.mutate(terminalSession.id);
                              setIsTerminalOpen(false);
                            },
                          });
                        }}
                      >
                        <IconPlayerStop size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </>
                ) : (
                  <Badge color="gray" variant="light">
                    {t("No Active Session")}
                  </Badge>
                )}
              </Group>
            </Group>
            <Divider />

            {terminalSession && terminalSession.status !== "terminated" ? (
              <Collapse in={isTerminalOpen}>
                <Box mt="sm">
                  <WebTerminal
                    sessionId={terminalSession.id}
                    height={400}
                    onClose={() => setIsTerminalOpen(false)}
                  />
                </Box>
              </Collapse>
            ) : (
              <Text size="sm" c="dimmed">
                {isLoadingSession
                  ? t("Checking for active terminal session...")
                  : t("No active terminal session. The agent runtime will create a session when the agent starts.")}
              </Text>
            )}
          </Stack>
        </Paper>
      )}

      {/* Activity Feed */}
      <Paper p="md" withBorder>
        <AgentActivityFeed agentId={agent.id} limit={20} />
      </Paper>
    </Stack>
  );
}
