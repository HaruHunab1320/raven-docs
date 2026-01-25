import { Modal, Text, Stack, Textarea, Group, Button, Paper } from "@mantine/core";
import { IconRobot, IconX } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ParallaxAgent } from "../services/parallax-agent-service";
import { useDenyAgent } from "../queries/parallax-agent-query";

interface DenyAgentModalProps {
  agent: ParallaxAgent;
  opened: boolean;
  onClose: () => void;
}

export function DenyAgentModal({ agent, opened, onClose }: DenyAgentModalProps) {
  const { t } = useTranslation();
  const denyAgent = useDenyAgent();
  const [reason, setReason] = useState("");

  const handleDeny = () => {
    denyAgent.mutate(
      {
        agentId: agent.id,
        data: { reason: reason || "Access denied by administrator" },
      },
      {
        onSuccess: () => {
          onClose();
          setReason("");
        },
      }
    );
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group>
          <IconX size={20} color="red" />
          <Text fw={500}>{t("Deny Agent Access")}</Text>
        </Group>
      }
    >
      <Stack gap="md">
        <Paper p="md" withBorder>
          <Group mb="xs">
            <IconRobot size={20} />
            <Text fw={500}>{agent.name}</Text>
          </Group>
          {agent.description && (
            <Text size="sm" c="dimmed">
              {agent.description}
            </Text>
          )}
        </Paper>

        <Textarea
          label={t("Reason for denial")}
          description={t("This will be sent to the Parallax control plane")}
          placeholder={t("Enter reason...")}
          value={reason}
          onChange={(e) => setReason(e.currentTarget.value)}
          minRows={3}
        />

        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button
            color="red"
            onClick={handleDeny}
            loading={denyAgent.isPending}
            leftSection={<IconX size={16} />}
          >
            {t("Deny Access")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
