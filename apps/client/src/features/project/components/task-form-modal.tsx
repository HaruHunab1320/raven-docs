import { useEffect, useRef, useState } from "react";
import {
  Modal,
  Button,
  TextInput,
  Textarea,
  Group,
  Stack,
  Select,
  ActionIcon,
  Flex,
  Box,
  Text,
  Tabs,
  Switch,
  Divider,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import {
  useCreateTaskMutation,
  useUpdateTaskMutation,
  useAssignTaskMutation,
} from "../hooks/use-tasks";
import { Task, TaskPriority, TaskStatus } from "../types";
import { useTranslation } from "react-i18next";
import {
  IconSearch,
  IconUserCircle,
  IconX,
  IconArticle,
  IconChecklist,
} from "@tabler/icons-react";
import { useSearchUsers } from "@/features/user/hooks/use-search-users";
import { UserSelect } from "@/features/user/components/user-select";
import { useCreatePageMutation } from "@/features/page/queries/page-query";
import { useCurrentWorkspace } from "@/features/workspace/hooks/use-current-workspace";
import { useNavigate } from "react-router-dom";
import { logger } from "@/lib/logger";

interface TaskFormModalProps {
  opened: boolean;
  onClose: () => void;
  projectId: string;
  spaceId: string;
  task?: Task | null;
}

const STATUS_OPTIONS = [
  { value: "todo", label: "To Do" },
  { value: "in_progress", label: "In Progress" },
  { value: "in_review", label: "In Review" },
  { value: "done", label: "Done" },
  { value: "blocked", label: "Blocked" },
];

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

export default function TaskFormModal({
  opened,
  onClose,
  projectId,
  spaceId,
  task,
}: TaskFormModalProps) {
  const { t } = useTranslation();
  const createTaskMutation = useCreateTaskMutation();
  const updateTaskMutation = useUpdateTaskMutation();
  const assignTaskMutation = useAssignTaskMutation();
  const [assigneeId, setAssigneeId] = useState<string | null>(
    task?.assigneeId || null
  );
  const [isCreatingPage, setIsCreatingPage] = useState(true);
  const currentWorkspace = useCurrentWorkspace();
  const createPageMutation = useCreatePageMutation();
  const navigate = useNavigate();

  const isEditing = !!task;

  const form = useForm({
    initialValues: {
      title: task?.title || "",
      description: task?.description || "",
      status: task?.status || ("todo" as TaskStatus),
      priority: task?.priority || ("medium" as TaskPriority),
      dueDate: task?.dueDate ? new Date(task.dueDate) : null,
      estimatedTime: task?.estimatedTime || undefined,
    },
    validate: {
      title: (value) => (value ? null : t("Title is required")),
    },
  });

  useEffect(() => {
    if (task) {
      form.setValues({
        title: task.title,
        description: task.description || "",
        status: task.status || "todo",
        priority: task.priority || "medium",
        dueDate: task.dueDate ? new Date(task.dueDate) : null,
        estimatedTime: task.estimatedTime,
      });
      setAssigneeId(task.assigneeId || null);
    } else {
      form.reset();
      setAssigneeId(null);
    }
  }, [task]);

  useEffect(() => {
    if (opened && !isEditing) {
      form.reset();
      setAssigneeId(null);
    }
  }, [opened, isEditing]);

  const handleSubmit = form.onSubmit(async (values) => {
    // Validate status
    const validStatus = STATUS_OPTIONS.some(
      (option) => option.value === values.status
    )
      ? values.status
      : "todo";

    if (isEditing && task) {
      // Update existing task
      updateTaskMutation.mutate(
        {
          taskId: task.id,
          title: values.title,
          description: values.description,
          status: validStatus,
          priority: values.priority,
          dueDate: values.dueDate,
          estimatedTime: values.estimatedTime,
          pageId: task.pageId, // Preserve existing pageId when updating
        },
        {
          onSuccess: (data) => {
            logger.log("Task updated successfully:", data);
            // Handle assignee update if changed
            if (assigneeId !== task.assigneeId) {
              assignTaskMutation.mutate(
                {
                  taskId: task.id,
                  assigneeId: assigneeId,
                },
                {
                  onSuccess: () => {
                    logger.log("Assignee updated successfully");
                    onClose();
                  },
                  onError: (error) => {
                    logger.error("Error updating assignee:", error);
                  },
                }
              );
            } else {
              onClose();
            }
          },
          onError: (error) => {
            logger.error("Error updating task:", error);
          },
        }
      );
    } else {
      // Create new task
      if (isCreatingPage) {
        try {
          // First create a new page
          const pageData = {
            title: values.title,
            content: JSON.stringify({
              type: "doc",
              content: [
                {
                  type: "paragraph",
                  content: values.description
                    ? [{ type: "text", text: values.description }]
                    : [],
                },
              ],
            }),
            spaceId,
            parentPageId: "", // Could link to project page in the future
            icon: "📝",
          };

          const newPage = await createPageMutation.mutateAsync(pageData);

          if (newPage) {
            // Then create a task linked to the page
            const taskData = {
              title: values.title,
              description: values.description,
              status: validStatus,
              priority: values.priority,
              dueDate: values.dueDate,
              projectId,
              spaceId,
              assigneeId: assigneeId || undefined,
              estimatedTime: values.estimatedTime,
              pageId: newPage.id, // Link the task to the page directly
            };

            const newTask = await createTaskMutation.mutateAsync(taskData);

            // Make sure to close the form
            onClose();

            // Navigate to the new page
            if (newPage.slugId) {
              navigate(`/s/${spaceId}/p/${newPage.slugId}`);
            }
          }
        } catch (error) {
          logger.error("Error creating task and page:", error);
        }
      } else {
        // Create task only without a page
        createTaskMutation.mutate(
          {
            title: values.title,
            description: values.description,
            status: validStatus,
            priority: values.priority,
            dueDate: values.dueDate,
            projectId,
            spaceId,
            assigneeId: assigneeId || undefined,
            estimatedTime: values.estimatedTime,
          },
          {
            onSuccess: (data) => {
              logger.log("Task created successfully:", data);
              onClose();
            },
            onError: (error) => {
              logger.error("Error creating task:", error);
            },
          }
        );
      }
    }
  });

  const handleUserSelect = (userId: string) => {
    setAssigneeId(userId);
  };

  const clearAssignee = () => {
    setAssigneeId(null);
  };

  const loading =
    createTaskMutation.isPending ||
    updateTaskMutation.isPending ||
    assignTaskMutation.isPending ||
    createPageMutation.isPending;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={isEditing ? t("Edit Task") : t("Create New Task")}
      size="md"
    >
      <form onSubmit={handleSubmit}>
        <Stack gap="md">
          <TextInput
            required
            label={t("Task Title")}
            placeholder={t("Enter task title")}
            {...form.getInputProps("title")}
          />

          <Textarea
            label={t("Description")}
            placeholder={t("Enter task description (optional)")}
            minRows={3}
            {...form.getInputProps("description")}
          />

          <Group grow>
            <Select
              label={t("Status")}
              placeholder={t("Select status")}
              data={STATUS_OPTIONS}
              {...form.getInputProps("status")}
            />

            <Select
              label={t("Priority")}
              placeholder={t("Select priority")}
              data={PRIORITY_OPTIONS}
              {...form.getInputProps("priority")}
            />
          </Group>

          <Box>
            <TextInput
              label={t("Due Date")}
              placeholder={t("YYYY-MM-DD")}
              {...form.getInputProps("dueDate")}
            />
          </Box>

          <Box>
            <Flex justify="space-between" align="center" mb={5}>
              <Text fw={500} size="sm">
                {t("Assignee")}
              </Text>
              {assigneeId && (
                <ActionIcon
                  size="xs"
                  onClick={clearAssignee}
                  color="gray"
                  variant="subtle"
                >
                  <IconX size={12} />
                </ActionIcon>
              )}
            </Flex>
            <UserSelect
              value={assigneeId}
              onChange={handleUserSelect}
              placeholder={t("Assign to...")}
              leftSection={<IconUserCircle size={16} />}
            />
          </Box>

          {!isEditing && (
            <>
              <Divider label={t("Task Type")} labelPosition="center" />

              <Group justify="space-between">
                <Flex align="center" gap="md">
                  {isCreatingPage ? (
                    <IconArticle size={18} />
                  ) : (
                    <IconChecklist size={18} />
                  )}
                  <Text size="sm">
                    {isCreatingPage
                      ? t("Create as page (like Notion)")
                      : t("Create as simple task")}
                  </Text>
                </Flex>
                <Switch
                  checked={isCreatingPage}
                  onChange={(e) => setIsCreatingPage(e.currentTarget.checked)}
                  size="md"
                />
              </Group>

              {isCreatingPage && (
                <Text size="xs" color="dimmed">
                  {t(
                    "This will create a dedicated page for this task with its own content editor."
                  )}
                </Text>
              )}
            </>
          )}

          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={onClose}>
              {t("Cancel")}
            </Button>
            <Button type="submit" loading={loading}>
              {isEditing ? t("Update Task") : t("Create Task")}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
