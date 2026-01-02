import { Button, Group, Modal, TextInput, Textarea } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useTranslation } from "react-i18next";
import { useCreateProjectMutation } from "../../../hooks/use-projects";

interface ProjectFormModalProps {
  opened: boolean;
  onClose: () => void;
  spaceId: string;
}

export function ProjectFormModal({
  opened,
  onClose,
  spaceId,
}: ProjectFormModalProps) {
  const { t } = useTranslation();
  const createProjectMutation = useCreateProjectMutation();

  const form = useForm({
    initialValues: {
      name: "",
      description: "",
    },
    validate: {
      name: (value) => (value.trim().length < 1 ? t("Name is required") : null),
    },
  });

  const handleCreateProject = (values: {
    name: string;
    description: string;
  }) => {
    createProjectMutation.mutate(
      {
        name: values.name,
        description: values.description,
        spaceId,
      },
      {
        onSuccess: () => {
          onClose();
          form.reset();
        },
      }
    );
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("Create new project")}
      centered
    >
      <form onSubmit={form.onSubmit(handleCreateProject)}>
        <TextInput
          label={t("Project name")}
          placeholder={t("Enter project name")}
          required
          mb="md"
          {...form.getInputProps("name")}
        />
        <Textarea
          label={t("Description")}
          placeholder={t("Enter project description")}
          mb="xl"
          {...form.getInputProps("description")}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button type="submit" loading={createProjectMutation.isPending}>
            {t("Create")}
          </Button>
        </Group>
      </form>
    </Modal>
  );
}
