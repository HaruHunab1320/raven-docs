import { useEffect, useState } from "react";
import { Modal, Stack, Text, TextInput, Group, Button } from "@mantine/core";
import { useRenameDeploymentMutation } from "../hooks/use-team-queries";

interface Props {
  opened: boolean;
  onClose: () => void;
  deploymentId?: string;
  currentName?: string;
}

export function RenameTeamModal({
  opened,
  onClose,
  deploymentId,
  currentName,
}: Props) {
  const renameMutation = useRenameDeploymentMutation();
  const [teamName, setTeamName] = useState(currentName || "");

  useEffect(() => {
    if (opened) {
      setTeamName(currentName || "");
    }
  }, [opened, currentName]);

  const handleRename = async () => {
    const next = teamName.trim();
    if (!deploymentId || !next || next === (currentName || "").trim()) {
      onClose();
      return;
    }

    await renameMutation.mutateAsync({
      deploymentId,
      teamName: next,
    });
    onClose();
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Rename Team" size="sm">
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Set a human-friendly name for this team deployment.
        </Text>

        <TextInput
          label="Team Name"
          placeholder="Enter a team name"
          value={teamName}
          onChange={(e) => setTeamName(e.currentTarget.value)}
          autoFocus
        />

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleRename}
            loading={renameMutation.isPending}
            disabled={!teamName.trim()}
          >
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
