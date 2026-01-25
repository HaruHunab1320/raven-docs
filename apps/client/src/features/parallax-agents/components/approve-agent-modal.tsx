import {
  Modal,
  Text,
  Stack,
  Checkbox,
  Group,
  Button,
  Alert,
  Badge,
  Paper,
} from "@mantine/core";
import { IconAlertCircle, IconRobot } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ParallaxAgent } from "../services/parallax-agent-service";
import { useApproveAgent } from "../queries/parallax-agent-query";

// Permission descriptions for better UX
const PERMISSION_DESCRIPTIONS: Record<string, string> = {
  "read:pages": "Read page content",
  "write:pages": "Create and edit pages",
  "delete:pages": "Delete pages",
  "read:tasks": "View tasks",
  "write:tasks": "Create and update tasks",
  "delete:tasks": "Delete tasks",
  "read:projects": "View projects",
  "write:projects": "Create and update projects",
  "read:spaces": "View spaces",
  "write:spaces": "Create and update spaces",
  "read:comments": "View comments",
  "write:comments": "Create comments",
  "read:attachments": "View attachments",
  "write:attachments": "Upload attachments",
  "execute:search": "Search content",
  "execute:ai": "Use AI features",
};

interface ApproveAgentModalProps {
  agent: ParallaxAgent;
  opened: boolean;
  onClose: () => void;
}

export function ApproveAgentModal({ agent, opened, onClose }: ApproveAgentModalProps) {
  const { t } = useTranslation();
  const approveAgent = useApproveAgent();
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>(
    agent.requestedPermissions
  );

  const handlePermissionToggle = (permission: string) => {
    setSelectedPermissions((prev) =>
      prev.includes(permission)
        ? prev.filter((p) => p !== permission)
        : [...prev, permission]
    );
  };

  const handleApprove = () => {
    approveAgent.mutate(
      {
        agentId: agent.id,
        data: { grantedPermissions: selectedPermissions },
      },
      {
        onSuccess: () => {
          onClose();
        },
      }
    );
  };

  // Group permissions by category
  const permissionsByCategory = agent.requestedPermissions.reduce(
    (acc, perm) => {
      const [action, resource] = perm.split(":");
      const category = resource || "other";
      if (!acc[category]) acc[category] = [];
      acc[category].push(perm);
      return acc;
    },
    {} as Record<string, string[]>
  );

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group>
          <IconRobot size={20} />
          <Text fw={500}>{t("Approve Agent Access")}</Text>
        </Group>
      }
      size="lg"
    >
      <Stack gap="md">
        <Paper p="md" withBorder>
          <Group mb="xs">
            <Text fw={500}>{agent.name}</Text>
            <Badge size="sm" variant="light">
              {agent.capabilities.length} {t("capabilities")}
            </Badge>
          </Group>
          {agent.description && (
            <Text size="sm" c="dimmed">
              {agent.description}
            </Text>
          )}
        </Paper>

        <Alert icon={<IconAlertCircle size={16} />} color="blue">
          {t(
            "Select which permissions to grant this agent. You can modify these later."
          )}
        </Alert>

        <Stack gap="sm">
          <Text fw={500}>{t("Permissions")}</Text>
          {Object.entries(permissionsByCategory).map(([category, permissions]) => (
            <Paper key={category} p="sm" withBorder>
              <Text size="sm" fw={500} tt="capitalize" mb="xs">
                {category}
              </Text>
              <Stack gap="xs">
                {permissions.map((perm) => (
                  <Checkbox
                    key={perm}
                    label={
                      <Group gap="xs">
                        <Text size="sm">{PERMISSION_DESCRIPTIONS[perm] || perm}</Text>
                        <Badge size="xs" variant="outline">
                          {perm}
                        </Badge>
                      </Group>
                    }
                    checked={selectedPermissions.includes(perm)}
                    onChange={() => handlePermissionToggle(perm)}
                  />
                ))}
              </Stack>
            </Paper>
          ))}
        </Stack>

        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button
            color="green"
            onClick={handleApprove}
            loading={approveAgent.isPending}
            disabled={selectedPermissions.length === 0}
          >
            {t("Approve with")} {selectedPermissions.length} {t("permissions")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
