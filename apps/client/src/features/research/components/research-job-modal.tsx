import {
  Button,
  Checkbox,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  TextInput,
  Textarea,
} from "@mantine/core";
import { useMutation } from "@tanstack/react-query";
import { createResearchJob } from "@/features/research/services/research-service";
import { CreateResearchJobInput, ResearchJob } from "@/features/research/types/research.types";
import { notifications } from "@mantine/notifications";
import { useEffect, useState } from "react";
import { queryClient } from "@/main";

type ResearchJobModalProps = {
  opened: boolean;
  onClose: () => void;
  workspaceId: string;
  spaceId: string;
  initialTopic?: string;
  reportPageId?: string;
  onCreated?: (job: ResearchJob) => void;
};

export function ResearchJobModal({
  opened,
  onClose,
  workspaceId,
  spaceId,
  initialTopic,
  reportPageId,
  onCreated,
}: ResearchJobModalProps) {
  const [topic, setTopic] = useState(initialTopic || "");
  const [goal, setGoal] = useState("");
  const [timeBudgetMinutes, setTimeBudgetMinutes] = useState<number | undefined>(30);
  const [outputMode, setOutputMode] = useState<"longform" | "brief">("longform");
  const [sources, setSources] = useState({
    docs: true,
    web: true,
    repo: false,
  });

  useEffect(() => {
    setTopic(initialTopic || "");
  }, [initialTopic]);

  const createMutation = useMutation({
    mutationFn: (input: CreateResearchJobInput) => createResearchJob(input),
    onSuccess: (job) => {
      queryClient.invalidateQueries({ queryKey: ["research-jobs", spaceId] });
      notifications.show({
        title: "Research started",
        message: "Deep research is running in the background.",
        color: "green",
      });
      setGoal("");
      setTopic(initialTopic || "");
      onCreated?.(job);
      onClose();
    },
    onError: () => {
      notifications.show({
        title: "Error",
        message: "Failed to start research job",
        color: "red",
      });
    },
  });

  const handleSubmit = () => {
    if (!topic.trim()) {
      notifications.show({
        title: "Missing topic",
        message: "Add a topic before starting research.",
        color: "yellow",
      });
      return;
    }

    createMutation.mutate({
      workspaceId,
      spaceId,
      topic: topic.trim(),
      goal: goal.trim() || undefined,
      timeBudgetMinutes: timeBudgetMinutes || undefined,
      outputMode,
      sources,
      reportPageId,
    });
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Start deep research">
      <Stack gap="sm">
        <TextInput
          label="Topic"
          value={topic}
          onChange={(event) => setTopic(event.currentTarget.value)}
          placeholder="Research topic"
        />
        <Textarea
          label="Goal"
          value={goal}
          onChange={(event) => setGoal(event.currentTarget.value)}
          placeholder="Optional outcome or questions"
          minRows={3}
        />
        <NumberInput
          label="Time budget (minutes)"
          min={5}
          max={120}
          value={timeBudgetMinutes}
          onChange={(value) =>
            setTimeBudgetMinutes(typeof value === "number" ? value : undefined)
          }
        />
        <Select
          label="Output mode"
          data={[
            { value: "longform", label: "Longform report" },
            { value: "brief", label: "Brief summary" },
          ]}
          value={outputMode}
          onChange={(value) =>
            setOutputMode((value as "longform" | "brief") || "longform")
          }
        />
        <Stack gap="xs">
          <Checkbox
            label="Use docs in this space"
            checked={!!sources.docs}
            onChange={(event) =>
              setSources((prev) => ({ ...prev, docs: event.currentTarget.checked }))
            }
          />
          <Checkbox
            label="Use web sources"
            checked={!!sources.web}
            onChange={(event) =>
              setSources((prev) => ({ ...prev, web: event.currentTarget.checked }))
            }
          />
          <Checkbox
            label="Use repo sources"
            checked={!!sources.repo}
            onChange={(event) =>
              setSources((prev) => ({ ...prev, repo: event.currentTarget.checked }))
            }
          />
        </Stack>
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={createMutation.isPending}>
            Start research
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
