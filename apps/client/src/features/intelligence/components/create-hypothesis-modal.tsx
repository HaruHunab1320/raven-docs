import {
  Modal,
  Button,
  TextInput,
  Textarea,
  Group,
  Stack,
  Select,
  TagsInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useCreatePageMutation } from "@/features/page/queries/page-query";
import { INTELLIGENCE_KEYS } from "../hooks/use-intelligence-queries";

interface Props {
  opened: boolean;
  onClose: () => void;
  spaceId: string;
}

const STATUS_OPTIONS = [
  { value: "proposed", label: "Proposed" },
  { value: "testing", label: "Testing" },
  { value: "validated", label: "Validated" },
  { value: "refuted", label: "Refuted" },
  { value: "inconclusive", label: "Inconclusive" },
  { value: "superseded", label: "Superseded" },
];

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

export function CreateHypothesisModal({ opened, onClose, spaceId }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const createPageMutation = useCreatePageMutation();

  const form = useForm({
    initialValues: {
      title: "",
      formalStatement: "",
      status: "proposed",
      priority: "medium",
      domainTags: [] as string[],
      predictions: [] as string[],
      successCriteria: "",
    },
    validate: {
      title: (v) => (v.trim() ? null : "Title is required"),
      formalStatement: (v) => (v.trim() ? null : "Formal statement is required"),
    },
  });

  const handleSubmit = form.onSubmit(async (values) => {
    try {
      const page = await createPageMutation.mutateAsync({
        title: values.title,
        spaceId,
        pageType: "hypothesis",
        metadata: {
          status: values.status,
          formalStatement: values.formalStatement,
          predictions: values.predictions,
          prerequisites: [],
          priority: values.priority,
          domainTags: values.domainTags,
          successCriteria: values.successCriteria || null,
          registeredBy: null,
          approvedBy: null,
        },
      } as any);

      if (page) {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: INTELLIGENCE_KEYS.stats(spaceId),
          }),
          queryClient.invalidateQueries({
            queryKey: INTELLIGENCE_KEYS.hypotheses(spaceId),
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
      title="New Hypothesis"
      size="lg"
    >
      <form onSubmit={handleSubmit}>
        <Stack gap="md">
          <TextInput
            required
            label="Title"
            placeholder="Enter hypothesis title"
            {...form.getInputProps("title")}
          />

          <Textarea
            required
            label="Formal Statement"
            placeholder="The core claim to be tested"
            minRows={3}
            {...form.getInputProps("formalStatement")}
          />

          <Group grow>
            <Select
              label="Status"
              data={STATUS_OPTIONS}
              {...form.getInputProps("status")}
            />
            <Select
              label="Priority"
              data={PRIORITY_OPTIONS}
              {...form.getInputProps("priority")}
            />
          </Group>

          <TagsInput
            label="Domain Tags"
            placeholder="Add tags and press Enter"
            {...form.getInputProps("domainTags")}
          />

          <TagsInput
            label="Predictions"
            placeholder="Add testable predictions and press Enter"
            {...form.getInputProps("predictions")}
          />

          <Textarea
            label="Success Criteria"
            placeholder="How will this hypothesis be validated? (optional)"
            minRows={2}
            {...form.getInputProps("successCriteria")}
          />

          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={createPageMutation.isPending}>
              Create Hypothesis
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
