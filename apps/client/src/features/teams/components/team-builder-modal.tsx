import {
  Modal,
  Button,
  TextInput,
  Textarea,
  NumberInput,
  Select,
  Switch,
  Stack,
  Group,
  Text,
  Paper,
  ActionIcon,
  TagsInput,
  Divider,
  Tabs,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { OrgChartMermaidPreview } from "./org-chart-mermaid-preview";
import {
  useCreateTemplateMutation,
  useUpdateTemplateMutation,
} from "../hooks/use-team-queries";
import type {
  TeamTemplate,
  OrgPattern,
  OrgRole,
  WorkflowStep,
} from "../types/team.types";

interface RoleFormValue {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  reportsTo: string;
  minInstances: number;
  maxInstances: number;
  singleton: boolean;
}

interface StepFormValue {
  type: string;
  role: string;
  task: string;
  reviewer: string;
  approver: string;
  subject: string;
  method: string;
  sources: string[];
  check: string;
  condition: string;
  timeout: number | undefined;
  criteria: string;
}

interface FormValues {
  name: string;
  description: string;
  version: string;
  roles: RoleFormValue[];
  steps: StepFormValue[];
}

interface Props {
  opened: boolean;
  onClose: () => void;
  template?: TeamTemplate | null;
}

const STEP_TYPES = [
  { value: "assign", label: "Assign" },
  { value: "parallel", label: "Parallel" },
  { value: "sequential", label: "Sequential" },
  { value: "select", label: "Select" },
  { value: "review", label: "Review" },
  { value: "approve", label: "Approve" },
  { value: "aggregate", label: "Aggregate" },
  { value: "condition", label: "Condition" },
  { value: "wait", label: "Wait" },
];

const AGGREGATE_METHODS = [
  { value: "consensus", label: "Consensus" },
  { value: "majority", label: "Majority" },
  { value: "merge", label: "Merge" },
  { value: "best", label: "Best" },
];

const SELECT_CRITERIA = [
  { value: "availability", label: "Availability" },
  { value: "expertise", label: "Expertise" },
  { value: "round_robin", label: "Round Robin" },
  { value: "best", label: "Best" },
];

function emptyRole(): RoleFormValue {
  return {
    id: `role_${Date.now()}`,
    name: "",
    description: "",
    capabilities: [],
    reportsTo: "",
    minInstances: 1,
    maxInstances: 1,
    singleton: false,
  };
}

function emptyStep(): StepFormValue {
  return {
    type: "assign",
    role: "",
    task: "",
    reviewer: "",
    approver: "",
    subject: "",
    method: "merge",
    sources: [],
    check: "",
    condition: "",
    timeout: undefined,
    criteria: "best",
  };
}

function parseExistingTemplate(template: TeamTemplate): FormValues {
  const pattern: OrgPattern =
    typeof template.orgPattern === "string"
      ? JSON.parse(template.orgPattern)
      : template.orgPattern;

  const roles: RoleFormValue[] = Object.entries(
    pattern.structure?.roles || {},
  ).map(([id, role]) => ({
    id,
    name: role.name || id,
    description: role.description || "",
    capabilities: role.capabilities || [],
    reportsTo: role.reportsTo || "",
    minInstances: role.minInstances || 1,
    maxInstances: role.maxInstances || 1,
    singleton: role.singleton || false,
  }));

  const steps: StepFormValue[] = (pattern.workflow?.steps || []).map(
    (step) => ({
      type: step.type,
      role: step.role || "",
      task: step.task || "",
      reviewer: step.reviewer || "",
      approver: step.approver || "",
      subject: step.subject || "",
      method: step.method || "merge",
      sources: step.sources || [],
      check: step.check || "",
      condition: step.condition || "",
      timeout: step.timeout,
      criteria: step.criteria || "best",
    }),
  );

  return {
    name: template.name,
    description: template.description || "",
    version: template.version || "1.0.0",
    roles,
    steps,
  };
}

function buildOrgPattern(values: FormValues): OrgPattern {
  const roles: Record<string, OrgRole> = {};
  for (const role of values.roles) {
    roles[role.id] = {
      name: role.name,
      description: role.description || undefined,
      capabilities: role.capabilities,
      reportsTo: role.reportsTo || undefined,
      minInstances: role.minInstances,
      maxInstances: role.maxInstances,
      singleton: role.singleton,
    };
  }

  const steps: WorkflowStep[] = values.steps.map((step) => {
    const base: any = { type: step.type };
    switch (step.type) {
      case "assign":
        base.role = step.role;
        base.task = step.task;
        if (step.timeout) base.timeout = step.timeout;
        break;
      case "select":
        base.role = step.role;
        base.criteria = step.criteria;
        break;
      case "review":
        base.reviewer = step.reviewer;
        base.subject = step.subject;
        break;
      case "approve":
        base.approver = step.approver;
        base.subject = step.subject;
        break;
      case "aggregate":
        base.method = step.method;
        if (step.sources.length > 0) base.sources = step.sources;
        break;
      case "condition":
        base.check = step.check;
        break;
      case "wait":
        if (step.condition) base.condition = step.condition;
        if (step.timeout) base.timeout = step.timeout;
        break;
      case "parallel":
      case "sequential":
        base.steps = [];
        break;
    }
    return base;
  });

  return {
    name: values.name,
    version: values.version,
    description: values.description || undefined,
    structure: {
      name: values.name,
      description: values.description || undefined,
      roles,
    },
    workflow: {
      name: `${values.name} Workflow`,
      steps,
    },
  };
}

export function TeamBuilderModal({ opened, onClose, template }: Props) {
  const createMutation = useCreateTemplateMutation();
  const updateMutation = useUpdateTemplateMutation();
  const isEditing = !!template;

  const form = useForm<FormValues>({
    initialValues: template
      ? parseExistingTemplate(template)
      : {
          name: "",
          description: "",
          version: "1.0.0",
          roles: [emptyRole()],
          steps: [emptyStep()],
        },
    validate: {
      name: (value) => (value.trim() ? null : "Name is required"),
      roles: {
        name: (value) => (value.trim() ? null : "Role name is required"),
        id: (value) => (value.trim() ? null : "Role ID is required"),
      },
    },
  });

  const roleOptions = form.values.roles.map((r) => ({
    value: r.id,
    label: r.name || r.id,
  }));

  const livePattern = buildOrgPattern(form.values);

  const handleSubmit = async (values: FormValues) => {
    const orgPattern = buildOrgPattern(values);

    if (isEditing && template) {
      await updateMutation.mutateAsync({
        templateId: template.id,
        name: values.name,
        description: values.description || undefined,
        version: values.version,
        orgPattern,
      });
    } else {
      await createMutation.mutateAsync({
        name: values.name,
        description: values.description || undefined,
        version: values.version,
        orgPattern,
      });
    }
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={isEditing ? "Edit Template" : "Create Template"}
      size="xl"
    >
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Tabs defaultValue="basics">
          <Tabs.List>
            <Tabs.Tab value="basics">Basics</Tabs.Tab>
            <Tabs.Tab value="roles">
              Roles ({form.values.roles.length})
            </Tabs.Tab>
            <Tabs.Tab value="workflow">
              Workflow ({form.values.steps.length})
            </Tabs.Tab>
            <Tabs.Tab value="preview">Preview</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="basics" pt="md">
            <Stack gap="sm">
              <TextInput
                label="Name"
                placeholder="e.g. Research Team"
                required
                {...form.getInputProps("name")}
              />
              <Textarea
                label="Description"
                placeholder="What does this team do?"
                rows={3}
                {...form.getInputProps("description")}
              />
              <TextInput
                label="Version"
                placeholder="1.0.0"
                {...form.getInputProps("version")}
              />
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="roles" pt="md">
            <Stack gap="md">
              {form.values.roles.map((role, index) => (
                <Paper key={index} withBorder p="sm" radius="sm">
                  <Stack gap="xs">
                    <Group justify="space-between">
                      <Text fw={600} size="sm">
                        Role {index + 1}
                      </Text>
                      {form.values.roles.length > 1 && (
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          size="sm"
                          onClick={() => form.removeListItem("roles", index)}
                        >
                          <IconTrash size={14} />
                        </ActionIcon>
                      )}
                    </Group>
                    <Group grow>
                      <TextInput
                        label="ID"
                        placeholder="e.g. lead"
                        size="xs"
                        {...form.getInputProps(`roles.${index}.id`)}
                      />
                      <TextInput
                        label="Name"
                        placeholder="e.g. Lead Researcher"
                        size="xs"
                        {...form.getInputProps(`roles.${index}.name`)}
                      />
                    </Group>
                    <TextInput
                      label="Description"
                      placeholder="What this role does"
                      size="xs"
                      {...form.getInputProps(`roles.${index}.description`)}
                    />
                    <TagsInput
                      label="Capabilities"
                      placeholder="Add capability"
                      size="xs"
                      {...form.getInputProps(`roles.${index}.capabilities`)}
                    />
                    <Group grow>
                      <Select
                        label="Reports To"
                        placeholder="None"
                        data={roleOptions.filter(
                          (r) => r.value !== role.id,
                        )}
                        clearable
                        size="xs"
                        {...form.getInputProps(`roles.${index}.reportsTo`)}
                      />
                      <NumberInput
                        label="Min Instances"
                        min={1}
                        max={10}
                        size="xs"
                        {...form.getInputProps(`roles.${index}.minInstances`)}
                      />
                      <NumberInput
                        label="Max Instances"
                        min={1}
                        max={10}
                        size="xs"
                        {...form.getInputProps(`roles.${index}.maxInstances`)}
                      />
                    </Group>
                    <Switch
                      label="Singleton"
                      size="xs"
                      {...form.getInputProps(`roles.${index}.singleton`, {
                        type: "checkbox",
                      })}
                    />
                  </Stack>
                </Paper>
              ))}
              <Button
                variant="light"
                leftSection={<IconPlus size={14} />}
                size="xs"
                onClick={() => form.insertListItem("roles", emptyRole())}
              >
                Add Role
              </Button>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="workflow" pt="md">
            <Stack gap="md">
              {form.values.steps.map((step, index) => (
                <Paper key={index} withBorder p="sm" radius="sm">
                  <Stack gap="xs">
                    <Group justify="space-between">
                      <Text fw={600} size="sm">
                        Step {index + 1}
                      </Text>
                      {form.values.steps.length > 1 && (
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          size="sm"
                          onClick={() => form.removeListItem("steps", index)}
                        >
                          <IconTrash size={14} />
                        </ActionIcon>
                      )}
                    </Group>
                    <Select
                      label="Type"
                      data={STEP_TYPES}
                      size="xs"
                      {...form.getInputProps(`steps.${index}.type`)}
                    />

                    {step.type === "assign" && (
                      <>
                        <Select
                          label="Role"
                          data={roleOptions}
                          size="xs"
                          {...form.getInputProps(`steps.${index}.role`)}
                        />
                        <TextInput
                          label="Task"
                          placeholder="What should this role do?"
                          size="xs"
                          {...form.getInputProps(`steps.${index}.task`)}
                        />
                        <NumberInput
                          label="Timeout (seconds)"
                          size="xs"
                          {...form.getInputProps(`steps.${index}.timeout`)}
                        />
                      </>
                    )}

                    {step.type === "select" && (
                      <>
                        <Select
                          label="Role"
                          data={roleOptions}
                          size="xs"
                          {...form.getInputProps(`steps.${index}.role`)}
                        />
                        <Select
                          label="Criteria"
                          data={SELECT_CRITERIA}
                          size="xs"
                          {...form.getInputProps(`steps.${index}.criteria`)}
                        />
                      </>
                    )}

                    {step.type === "review" && (
                      <>
                        <Select
                          label="Reviewer"
                          data={roleOptions}
                          size="xs"
                          {...form.getInputProps(`steps.${index}.reviewer`)}
                        />
                        <TextInput
                          label="Subject"
                          placeholder="What is being reviewed?"
                          size="xs"
                          {...form.getInputProps(`steps.${index}.subject`)}
                        />
                      </>
                    )}

                    {step.type === "approve" && (
                      <>
                        <Select
                          label="Approver"
                          data={roleOptions}
                          size="xs"
                          {...form.getInputProps(`steps.${index}.approver`)}
                        />
                        <TextInput
                          label="Subject"
                          placeholder="What is being approved?"
                          size="xs"
                          {...form.getInputProps(`steps.${index}.subject`)}
                        />
                      </>
                    )}

                    {step.type === "aggregate" && (
                      <>
                        <Select
                          label="Method"
                          data={AGGREGATE_METHODS}
                          size="xs"
                          {...form.getInputProps(`steps.${index}.method`)}
                        />
                        <TagsInput
                          label="Sources"
                          placeholder="Add source role"
                          size="xs"
                          {...form.getInputProps(`steps.${index}.sources`)}
                        />
                      </>
                    )}

                    {step.type === "condition" && (
                      <TextInput
                        label="Check"
                        placeholder="e.g. quality_score >= 0.8"
                        size="xs"
                        {...form.getInputProps(`steps.${index}.check`)}
                      />
                    )}

                    {step.type === "wait" && (
                      <>
                        <TextInput
                          label="Condition"
                          placeholder="Wait condition"
                          size="xs"
                          {...form.getInputProps(`steps.${index}.condition`)}
                        />
                        <NumberInput
                          label="Timeout (seconds)"
                          size="xs"
                          {...form.getInputProps(`steps.${index}.timeout`)}
                        />
                      </>
                    )}

                    {(step.type === "parallel" ||
                      step.type === "sequential") && (
                      <Text size="xs" c="dimmed">
                        Container step. Nested steps will use the roles
                        defined above.
                      </Text>
                    )}
                  </Stack>
                </Paper>
              ))}
              <Button
                variant="light"
                leftSection={<IconPlus size={14} />}
                size="xs"
                onClick={() => form.insertListItem("steps", emptyStep())}
              >
                Add Step
              </Button>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="preview" pt="md">
            <Stack gap="md">
              <Text fw={600} size="sm">
                Org Chart Preview
              </Text>
              <OrgChartMermaidPreview orgPattern={livePattern} />
              <Divider />
              <Text fw={600} size="sm">
                Workflow Steps
              </Text>
              {form.values.steps.map((step, i) => (
                <Text key={i} size="xs" c="dimmed">
                  {i + 1}. {step.type}
                  {step.role ? ` (${step.role})` : ""}
                  {step.task ? `: ${step.task}` : ""}
                  {step.reviewer ? ` by ${step.reviewer}` : ""}
                  {step.approver ? ` by ${step.approver}` : ""}
                </Text>
              ))}
            </Stack>
          </Tabs.Panel>
        </Tabs>

        <Divider my="md" />

        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            loading={createMutation.isPending || updateMutation.isPending}
          >
            {isEditing ? "Update Template" : "Create Template"}
          </Button>
        </Group>
      </form>
    </Modal>
  );
}
