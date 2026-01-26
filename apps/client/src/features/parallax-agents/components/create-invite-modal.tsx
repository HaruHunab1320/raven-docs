import {
  Modal,
  Stack,
  TextInput,
  Textarea,
  MultiSelect,
  NumberInput,
  Button,
  Group,
  Switch,
  Text,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useForm } from "@mantine/form";
import { useTranslation } from "react-i18next";
import { useCreateInvite } from "../queries/parallax-agent-query";

// Available permissions for agents
const AVAILABLE_PERMISSIONS = [
  { value: "read:pages", label: "Read Pages" },
  { value: "write:pages", label: "Write Pages" },
  { value: "read:tasks", label: "Read Tasks" },
  { value: "write:tasks", label: "Write Tasks" },
  { value: "read:projects", label: "Read Projects" },
  { value: "write:projects", label: "Write Projects" },
  { value: "read:comments", label: "Read Comments" },
  { value: "write:comments", label: "Write Comments" },
  { value: "search", label: "Search Content" },
];

interface CreateInviteModalProps {
  opened: boolean;
  onClose: () => void;
}

export function CreateInviteModal({ opened, onClose }: CreateInviteModalProps) {
  const { t } = useTranslation();
  const createInvite = useCreateInvite();

  const form = useForm({
    initialValues: {
      name: "",
      description: "",
      permissions: [] as string[],
      limitUses: false,
      usesRemaining: 1,
      hasExpiration: false,
      expiresAt: null as Date | null,
    },
    validate: {
      name: (value) => (value.trim() ? null : t("Name is required")),
      permissions: (value) =>
        value.length > 0 ? null : t("At least one permission is required"),
    },
  });

  const handleSubmit = form.onSubmit((values) => {
    createInvite.mutate(
      {
        name: values.name,
        description: values.description || undefined,
        permissions: values.permissions,
        usesRemaining: values.limitUses ? values.usesRemaining : undefined,
        expiresAt: values.hasExpiration && values.expiresAt
          ? values.expiresAt.toISOString()
          : undefined,
      },
      {
        onSuccess: () => {
          form.reset();
          onClose();
        },
      }
    );
  });

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("Create Agent Invite")}
      size="md"
    >
      <form onSubmit={handleSubmit}>
        <Stack gap="md">
          <TextInput
            label={t("Invite Name")}
            placeholder={t("e.g., Development Team Agent")}
            required
            {...form.getInputProps("name")}
          />

          <Textarea
            label={t("Description")}
            placeholder={t("Optional description for this invite")}
            {...form.getInputProps("description")}
          />

          <MultiSelect
            label={t("Permissions")}
            description={t("Agents using this invite will receive these permissions")}
            placeholder={t("Select permissions")}
            data={AVAILABLE_PERMISSIONS}
            required
            searchable
            {...form.getInputProps("permissions")}
          />

          <Stack gap="xs">
            <Switch
              label={t("Limit number of uses")}
              {...form.getInputProps("limitUses", { type: "checkbox" })}
            />
            {form.values.limitUses && (
              <NumberInput
                label={t("Maximum uses")}
                min={1}
                {...form.getInputProps("usesRemaining")}
              />
            )}
          </Stack>

          <Stack gap="xs">
            <Switch
              label={t("Set expiration date")}
              {...form.getInputProps("hasExpiration", { type: "checkbox" })}
            />
            {form.values.hasExpiration && (
              <DatePickerInput
                label={t("Expires on")}
                placeholder={t("Select date")}
                minDate={new Date()}
                {...form.getInputProps("expiresAt")}
              />
            )}
          </Stack>

          <Text size="xs" c="dimmed">
            {t("Agents that register using this invite will be automatically approved with the selected permissions.")}
          </Text>

          <Group justify="flex-end" mt="md">
            <Button variant="subtle" onClick={onClose}>
              {t("Cancel")}
            </Button>
            <Button type="submit" loading={createInvite.isPending}>
              {t("Create Invite")}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
