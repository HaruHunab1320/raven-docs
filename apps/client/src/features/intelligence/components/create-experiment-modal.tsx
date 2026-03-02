import {
  Modal,
  Button,
  TextInput,
  Textarea,
  Group,
  Stack,
  Select,
  Checkbox,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCreatePageMutation } from "@/features/page/queries/page-query";
import {
  useHypothesesList,
  INTELLIGENCE_KEYS,
} from "../hooks/use-intelligence-queries";
import { notifications } from "@mantine/notifications";

interface Props {
  opened: boolean;
  onClose: () => void;
  spaceId: string;
  onLaunchSwarm?: (experimentId: string, title: string, repoUrl?: string) => void;
}

const STATUS_OPTIONS = [
  { value: "planned", label: "Planned" },
  { value: "running", label: "Running" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
];

export function CreateExperimentModal({ opened, onClose, spaceId, onLaunchSwarm }: Props) {
  const queryClient = useQueryClient();
  const createPageMutation = useCreatePageMutation();
  const { data: hypotheses } = useHypothesesList(spaceId);
  const [launchAgent, setLaunchAgent] = useState(false);
  const addAnotherRef = useRef(false);

  const hypothesisOptions = (hypotheses ?? []).map((h) => ({
    value: h.id,
    label: h.title || "Untitled",
  }));

  const form = useForm({
    initialValues: {
      title: "",
      hypothesisId: null as string | null,
      status: "planned",
      method: "",
      codeRef: "",
      repoUrl: "",
    },
    validate: {
      title: (v) => (v.trim() ? null : "Title is required"),
    },
  });

  useEffect(() => {
    const selectedId = form.values.hypothesisId;
    if (!selectedId || form.isTouched("repoUrl")) return;
    const hypothesis = (hypotheses ?? []).find((h) => h.id === selectedId);
    const repoUrl = (hypothesis?.metadata as any)?.repoUrl;
    if (repoUrl) {
      form.setFieldValue("repoUrl", repoUrl);
    }
  }, [form.values.hypothesisId, hypotheses, form]);

  const invalidateQueries = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: INTELLIGENCE_KEYS.stats(spaceId),
      }),
      queryClient.invalidateQueries({
        queryKey: INTELLIGENCE_KEYS.experiments(spaceId),
      }),
      queryClient.invalidateQueries({
        queryKey: INTELLIGENCE_KEYS.timeline(spaceId),
      }),
    ]);

  const handleSubmit = form.onSubmit(async (values) => {
    try {
      const page = await createPageMutation.mutateAsync({
        title: values.title,
        spaceId,
        pageType: "experiment",
        metadata: {
          status: values.status,
          hypothesisId: values.hypothesisId || null,
          method: values.method || null,
          metrics: {},
          results: {},
          passedPredictions: null,
          unexpectedObservations: [],
          suggestedFollowUps: [],
          codeRef: values.codeRef || null,
          repoUrl: values.repoUrl || null,
        },
      } as any);

      if (page) {
        await invalidateQueries();
        const title = values.title;
        notifications.show({
          message: `Experiment "${title}" created`,
          color: "green",
        });
        form.reset();
        setLaunchAgent(false);

        if (launchAgent && onLaunchSwarm) {
          onClose();
          onLaunchSwarm(page.id, title, values.repoUrl || undefined);
        } else if (!addAnotherRef.current) {
          onClose();
        }
        addAnotherRef.current = false;
      }
    } catch {
      // Error handled by mutation
    }
  });

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="New Experiment"
      size="lg"
    >
      <form onSubmit={handleSubmit}>
        <Stack gap="md">
          <TextInput
            required
            label="Title"
            placeholder="Enter experiment title"
            {...form.getInputProps("title")}
          />

          <Select
            label="Hypothesis"
            placeholder="Link to a hypothesis (optional)"
            data={hypothesisOptions}
            clearable
            searchable
            {...form.getInputProps("hypothesisId")}
          />

          <Select
            label="Status"
            data={STATUS_OPTIONS}
            {...form.getInputProps("status")}
          />

          <Textarea
            label="Method"
            placeholder="Describe the methodology (optional)"
            minRows={3}
            {...form.getInputProps("method")}
          />

          <TextInput
            label="Code Reference"
            placeholder="Link to code or notebook (optional)"
            {...form.getInputProps("codeRef")}
          />

          <TextInput
            label="Repository URL"
            placeholder="https://github.com/org/repo.git (optional)"
            {...form.getInputProps("repoUrl")}
          />

          {onLaunchSwarm && (
            <Checkbox
              label="Launch coding agent after creation"
              checked={launchAgent}
              onChange={(e) => setLaunchAgent(e.currentTarget.checked)}
            />
          )}

          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            {!launchAgent && (
              <Button
                variant="light"
                type="submit"
                loading={createPageMutation.isPending}
                onClick={() => {
                  addAnotherRef.current = true;
                }}
              >
                Create & Add Another
              </Button>
            )}
            <Button type="submit" loading={createPageMutation.isPending}>
              {launchAgent ? "Create & Launch Agent" : "Create Experiment"}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
