import {
  Modal,
  Button,
  TextInput,
  Textarea,
  Group,
  Stack,
  Select,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useCurrentWorkspace } from "@/features/workspace/hooks/use-current-workspace";
import { useActiveExperiments } from "../hooks/use-intelligence-queries";
import { useExecuteSwarmMutation } from "../hooks/use-swarm-queries";

interface Props {
  opened: boolean;
  onClose: () => void;
  spaceId: string;
  experimentId?: string;
  experimentTitle?: string;
}

const AGENT_TYPES = [
  { value: "claude-code", label: "Claude Code" },
  { value: "gemini-cli", label: "Gemini CLI" },
  { value: "aider", label: "Aider" },
  { value: "codex", label: "Codex" },
];

export function LaunchSwarmModal({
  opened,
  onClose,
  spaceId,
  experimentId,
  experimentTitle,
}: Props) {
  const { data: workspace } = useCurrentWorkspace();
  const { data: experiments } = useActiveExperiments(spaceId);
  const executeMutation = useExecuteSwarmMutation();

  const experimentOptions = (experiments ?? []).map((e) => ({
    value: e.id,
    label: e.title || "Untitled",
  }));

  const form = useForm({
    initialValues: {
      taskDescription: experimentTitle
        ? `Work on: ${experimentTitle}`
        : "",
      repoUrl: "",
      agentType: "claude-code",
      baseBranch: "main",
      branchName: "",
      experimentId: experimentId || (null as string | null),
    },
    validate: {
      taskDescription: (v) =>
        v.trim() ? null : "Task description is required",
    },
  });

  const handleSubmit = form.onSubmit(async (values) => {
    if (!workspace) return;

    try {
      await executeMutation.mutateAsync({
        repoUrl: values.repoUrl || undefined,
        taskDescription: values.taskDescription,
        agentType: values.agentType,
        baseBranch: values.repoUrl ? values.baseBranch || "main" : undefined,
        branchName: values.repoUrl ? values.branchName || undefined : undefined,
        experimentId: values.experimentId || undefined,
        spaceId,
      });

      notifications.show({
        title: "Agent launched",
        message: "Coding agent is starting up in the background.",
        color: "green",
      });
      form.reset();
      onClose();
    } catch {
      notifications.show({
        title: "Error",
        message: "Failed to launch coding agent.",
        color: "red",
      });
    }
  });

  return (
    <Modal opened={opened} onClose={onClose} title="Launch Coding Agent" size="lg">
      <form onSubmit={handleSubmit}>
        <Stack gap="md">
          <Textarea
            required
            label="Task Description"
            placeholder="Describe what the agent should do..."
            minRows={3}
            {...form.getInputProps("taskDescription")}
          />

          <TextInput
            label="Repository URL"
            description="Leave empty for research-only agents that don't need a codebase"
            placeholder="https://github.com/org/repo.git"
            {...form.getInputProps("repoUrl")}
          />

          <Select
            label="Agent Type"
            data={AGENT_TYPES}
            {...form.getInputProps("agentType")}
          />

          {form.values.repoUrl && (
            <>
              <TextInput
                label="Base Branch"
                placeholder="main"
                {...form.getInputProps("baseBranch")}
              />

              <TextInput
                label="Branch Name"
                placeholder="Auto-generated if empty"
                {...form.getInputProps("branchName")}
              />
            </>
          )}

          <Select
            label="Experiment"
            placeholder="Link to an experiment (optional)"
            data={experimentOptions}
            clearable
            searchable
            {...form.getInputProps("experimentId")}
          />

          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={executeMutation.isPending}>
              Launch Agent
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
