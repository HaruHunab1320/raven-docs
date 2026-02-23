import {
  Modal,
  Button,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useState } from "react";
import { useTeamTemplates, useDeployTeamMutation } from "../hooks/use-team-queries";

interface Props {
  opened: boolean;
  onClose: () => void;
  spaceId: string;
  preselectedTemplateId?: string;
}

export function DeployTeamModal({
  opened,
  onClose,
  spaceId,
  preselectedTemplateId,
}: Props) {
  const { data: templates } = useTeamTemplates();
  const deployMutation = useDeployTeamMutation();
  const [templateId, setTemplateId] = useState<string | null>(
    preselectedTemplateId || null,
  );
  const [teamName, setTeamName] = useState("");

  const templateOptions = (templates || []).map((t) => ({
    value: t.id,
    label: `${t.name}${t.isSystem ? " (System)" : ""}`,
  }));

  const handleDeploy = async () => {
    if (!templateId || !spaceId) return;
    await deployMutation.mutateAsync({
      templateId,
      spaceId,
      teamName: teamName.trim() || undefined,
    });
    onClose();
    setTemplateId(null);
    setTeamName("");
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Deploy Team" size="md">
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Deploy a team from a template to the current space.
        </Text>

        <Select
          label="Template"
          placeholder="Select a team template"
          data={templateOptions}
          value={templateId}
          onChange={setTemplateId}
          searchable
        />

        <TextInput
          label="Team Name"
          placeholder="Optional human-friendly team name"
          value={teamName}
          onChange={(e) => setTeamName(e.currentTarget.value)}
        />

        <Button
          onClick={handleDeploy}
          loading={deployMutation.isPending}
          disabled={!templateId}
          fullWidth
        >
          Deploy Team
        </Button>
      </Stack>
    </Modal>
  );
}
