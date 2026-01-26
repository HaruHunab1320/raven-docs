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
  Stack,
  Button,
  CopyButton,
  Code,
} from "@mantine/core";
import {
  IconDotsVertical,
  IconTrash,
  IconBan,
  IconCopy,
  IconCheck,
  IconPlus,
} from "@tabler/icons-react";
import { useWorkspaceInvites, useRevokeInvite, useDeleteInvite } from "../queries/parallax-agent-query";
import { AgentInvite } from "../services/parallax-agent-service";
import { modals } from "@mantine/modals";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useState } from "react";
import { CreateInviteModal } from "./create-invite-modal";

dayjs.extend(relativeTime);

function getInviteStatus(invite: AgentInvite): { label: string; color: string } {
  if (invite.revokedAt) {
    return { label: "Revoked", color: "gray" };
  }
  if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
    return { label: "Expired", color: "red" };
  }
  if (invite.usesRemaining !== null && invite.usesRemaining <= 0) {
    return { label: "Exhausted", color: "orange" };
  }
  return { label: "Active", color: "green" };
}

export function InvitesList() {
  const { t } = useTranslation();
  const [createModalOpened, setCreateModalOpened] = useState(false);
  const { data: invites, isLoading } = useWorkspaceInvites();
  const revokeInviteMutation = useRevokeInvite();
  const deleteInviteMutation = useDeleteInvite();

  const handleRevoke = (invite: AgentInvite) => {
    modals.openConfirmModal({
      title: t("Revoke Invite"),
      children: (
        <Text size="sm">
          {t("Are you sure you want to revoke")} "{invite.name}"?{" "}
          {t("Agents will no longer be able to use this invite to register.")}
        </Text>
      ),
      labels: { confirm: t("Revoke"), cancel: t("Cancel") },
      confirmProps: { color: "orange" },
      onConfirm: () => revokeInviteMutation.mutate(invite.id),
    });
  };

  const handleDelete = (invite: AgentInvite) => {
    modals.openConfirmModal({
      title: t("Delete Invite"),
      children: (
        <Text size="sm">
          {t("Are you sure you want to delete")} "{invite.name}"?{" "}
          {t("This action cannot be undone.")}
        </Text>
      ),
      labels: { confirm: t("Delete"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: () => deleteInviteMutation.mutate(invite.id),
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
    <>
      <Stack gap="md">
        <Group justify="flex-end">
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={() => setCreateModalOpened(true)}
          >
            {t("Create Invite")}
          </Button>
        </Group>

        {!invites || invites.length === 0 ? (
          <Paper p="lg" withBorder>
            <Text size="sm" c="dimmed" ta="center">
              {t("No agent invites created yet. Create an invite to allow agents to register.")}
            </Text>
          </Paper>
        ) : (
          <ScrollArea>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t("Name")}</Table.Th>
                  <Table.Th>{t("Status")}</Table.Th>
                  <Table.Th>{t("Permissions")}</Table.Th>
                  <Table.Th>{t("Uses")}</Table.Th>
                  <Table.Th>{t("Expires")}</Table.Th>
                  <Table.Th>{t("Token")}</Table.Th>
                  <Table.Th>{t("Actions")}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {invites.map((invite) => {
                  const status = getInviteStatus(invite);
                  const isActive = status.label === "Active";

                  return (
                    <Table.Tr key={invite.id}>
                      <Table.Td>
                        <div>
                          <Text fw={500}>{invite.name}</Text>
                          {invite.description && (
                            <Text size="xs" c="dimmed" lineClamp={1}>
                              {invite.description}
                            </Text>
                          )}
                        </div>
                      </Table.Td>
                      <Table.Td>
                        <Badge color={status.color} variant="light">
                          {t(status.label)}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Group gap={4}>
                          {invite.permissions.slice(0, 2).map((perm) => (
                            <Badge key={perm} size="xs" variant="outline">
                              {perm}
                            </Badge>
                          ))}
                          {invite.permissions.length > 2 && (
                            <Tooltip
                              label={invite.permissions.slice(2).join(", ")}
                            >
                              <Badge size="xs" variant="outline">
                                +{invite.permissions.length - 2}
                              </Badge>
                            </Tooltip>
                          )}
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">
                          {invite.usesCount}
                          {invite.usesRemaining !== null && (
                            <Text span c="dimmed">
                              {" / "}
                              {invite.usesCount + invite.usesRemaining}
                            </Text>
                          )}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" c="dimmed">
                          {invite.expiresAt
                            ? dayjs(invite.expiresAt).fromNow()
                            : t("Never")}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs">
                          <Code style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>
                            {invite.token.slice(0, 20)}...
                          </Code>
                          <CopyButton value={invite.token}>
                            {({ copied, copy }) => (
                              <Tooltip label={copied ? t("Copied") : t("Copy token")}>
                                <ActionIcon
                                  size="sm"
                                  variant="subtle"
                                  color={copied ? "green" : "gray"}
                                  onClick={copy}
                                >
                                  {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                                </ActionIcon>
                              </Tooltip>
                            )}
                          </CopyButton>
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Menu withinPortal position="bottom-end" shadow="sm">
                          <Menu.Target>
                            <ActionIcon variant="subtle">
                              <IconDotsVertical size={16} />
                            </ActionIcon>
                          </Menu.Target>
                          <Menu.Dropdown>
                            {isActive && (
                              <Menu.Item
                                leftSection={<IconBan size={14} />}
                                color="orange"
                                onClick={() => handleRevoke(invite)}
                              >
                                {t("Revoke")}
                              </Menu.Item>
                            )}
                            <Menu.Item
                              leftSection={<IconTrash size={14} />}
                              color="red"
                              onClick={() => handleDelete(invite)}
                            >
                              {t("Delete")}
                            </Menu.Item>
                          </Menu.Dropdown>
                        </Menu>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        )}
      </Stack>

      <CreateInviteModal
        opened={createModalOpened}
        onClose={() => setCreateModalOpened(false)}
      />
    </>
  );
}
