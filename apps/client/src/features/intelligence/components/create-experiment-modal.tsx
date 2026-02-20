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
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useCreatePageMutation } from "@/features/page/queries/page-query";
import {
  useHypothesesList,
  INTELLIGENCE_KEYS,
} from "../hooks/use-intelligence-queries";

interface Props {
  opened: boolean;
  onClose: () => void;
  spaceId: string;
}

const STATUS_OPTIONS = [
  { value: "planned", label: "Planned" },
  { value: "running", label: "Running" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
];

export function CreateExperimentModal({ opened, onClose, spaceId }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const createPageMutation = useCreatePageMutation();
  const { data: hypotheses } = useHypothesesList(spaceId);

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
    },
    validate: {
      title: (v) => (v.trim() ? null : "Title is required"),
    },
  });

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
        },
      } as any);

      if (page) {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: INTELLIGENCE_KEYS.stats(spaceId),
          }),
          queryClient.invalidateQueries({
            queryKey: INTELLIGENCE_KEYS.experiments(spaceId),
          }),
        ]);
        form.reset();
        onClose();
        navigate(`/p/${page.slugId}`);
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

          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={createPageMutation.isPending}>
              Create Experiment
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
