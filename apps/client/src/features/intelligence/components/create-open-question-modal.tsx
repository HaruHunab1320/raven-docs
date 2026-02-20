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
import { useQueryClient } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { useCreateTaskMutation } from "@/features/project/hooks/use-tasks";
import {
  useTaskLabels,
  useCreateTaskLabel,
  useAssignTaskLabel,
} from "@/features/project/hooks/use-task-labels";
import { useCurrentWorkspace } from "@/features/workspace/hooks/use-current-workspace";
import { INTELLIGENCE_KEYS } from "../hooks/use-intelligence-queries";

interface Props {
  opened: boolean;
  onClose: () => void;
  spaceId: string;
}

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

export function CreateOpenQuestionModal({ opened, onClose, spaceId }: Props) {
  const queryClient = useQueryClient();
  const { data: workspace } = useCurrentWorkspace();
  const createTaskMutation = useCreateTaskMutation();
  const { data: labels } = useTaskLabels();
  const createLabelMutation = useCreateTaskLabel();
  const assignLabelMutation = useAssignTaskLabel();

  const form = useForm({
    initialValues: {
      title: "",
      description: "",
      priority: "medium",
    },
    validate: {
      title: (v) => (v.trim() ? null : "Title is required"),
    },
  });

  const handleSubmit = form.onSubmit(async (values) => {
    if (!workspace?.id) return;

    try {
      const task = await createTaskMutation.mutateAsync({
        title: values.title,
        description: values.description || undefined,
        status: "todo",
        priority: values.priority as any,
        spaceId,
      });

      // Find or create "open-question" label
      let labelId: string | undefined;
      const existing = labels?.find(
        (l: any) => l.name.toLowerCase() === "open-question" || l.name.toLowerCase() === "open question",
      );

      if (existing) {
        labelId = existing.id;
      } else {
        const newLabel = await createLabelMutation.mutateAsync({
          name: "open-question",
          color: "blue",
          workspaceId: workspace.id,
        });
        labelId = newLabel.id;
      }

      if (labelId && task?.id) {
        await assignLabelMutation.mutateAsync({
          taskId: task.id,
          labelId,
        });
      }

      await queryClient.invalidateQueries({
        queryKey: INTELLIGENCE_KEYS.openQuestions(spaceId),
      });
      await queryClient.invalidateQueries({
        queryKey: INTELLIGENCE_KEYS.stats(spaceId),
      });

      form.reset();
      onClose();
    } catch {
      notifications.show({
        message: "Failed to create open question",
        color: "red",
      });
    }
  });

  const loading =
    createTaskMutation.isPending ||
    createLabelMutation.isPending ||
    assignLabelMutation.isPending;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="New Open Question"
      size="md"
    >
      <form onSubmit={handleSubmit}>
        <Stack gap="md">
          <TextInput
            required
            label="Question"
            placeholder="What do you want to investigate?"
            {...form.getInputProps("title")}
          />

          <Textarea
            label="Description"
            placeholder="Additional context (optional)"
            minRows={3}
            {...form.getInputProps("description")}
          />

          <Select
            label="Priority"
            data={PRIORITY_OPTIONS}
            {...form.getInputProps("priority")}
          />

          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={loading}>
              Create Question
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
