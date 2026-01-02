import { useEffect, useState } from "react";
import {
  Box,
  Group,
  Title,
  Text,
  Stack,
  Paper,
  Divider,
  Button,
  Flex,
  Badge,
  ActionIcon,
  Card,
  LoadingOverlay,
  Menu,
  Grid,
  Tabs,
  Input,
  ScrollArea,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import {
  IconArrowLeft,
  IconDots,
  IconEdit,
  IconPlus,
  IconTrash,
  IconLayoutDashboard,
  IconList,
  IconTable,
  IconFileText,
  IconPhoto,
  IconVideo,
  IconCode,
  IconLink,
} from "@tabler/icons-react";
import {
  useProject,
  useArchiveProjectMutation,
  useDeleteProjectMutation,
} from "../hooks/use-projects";
import { Project, Task } from "../types";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { useNavigate } from "react-router-dom";
import { ProjectTree } from "./project-tree";
import { useTask } from "../hooks/use-tasks";
import { formatDate } from "@/lib/utils/format-utils";
import { ProjectBoard } from "./project-board";

// Define block types for document-based project view
type BlockType =
  | "text"
  | "image"
  | "video"
  | "table"
  | "code"
  | "task-list"
  | "embed";

interface Block {
  id: string;
  type: BlockType;
  content: any;
}

interface ProjectDetailProps {
  projectId: string;
  spaceId: string;
  onBack: () => void;
}

export function ProjectDetail({
  projectId,
  spaceId,
  onBack,
}: ProjectDetailProps) {
  const { t } = useTranslation();
  const { data: project, isLoading } = useProject(projectId);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const { data: selectedTask } = useTask(selectedTaskId || "");
  const archiveProjectMutation = useArchiveProjectMutation();
  const deleteProjectMutation = useDeleteProjectMutation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<string | null>("document");

  // For document-like functionality
  const [blocks, setBlocks] = useState<Block[]>([
    {
      id: "1",
      type: "text",
      content: { text: "Project overview and main description goes here..." },
    },
  ]);

  const handleTaskSelect = (taskId: string) => {
    setSelectedTaskId(taskId);
  };

  const handleArchiveProject = () => {
    if (!project) return;

    archiveProjectMutation.mutate(
      { projectId: project.id, isArchived: !project.isArchived },
      {
        onSuccess: () => {
          notifications.show({
            title: project.isArchived
              ? t("Project unarchived")
              : t("Project archived"),
            message: project.isArchived
              ? t("The project has been unarchived")
              : t("The project has been archived"),
            color: "green",
          });
        },
      }
    );
  };

  const handleDeleteProject = () => {
    if (!project) return;

    if (window.confirm(t("Are you sure you want to delete this project?"))) {
      deleteProjectMutation.mutate(
        { projectId: project.id, projectName: project.name },
        {
          onSuccess: () => {
            notifications.show({
              title: t("Project deleted"),
              message: t("The project has been deleted"),
              color: "green",
            });
            onBack();
          },
        }
      );
    }
  };

  const addBlock = (type: BlockType) => {
    const newBlock: Block = {
      id: Date.now().toString(),
      type,
      content:
        type === "text"
          ? { text: "New text block" }
          : type === "image"
            ? { url: "", caption: "" }
            : type === "video"
              ? { url: "", caption: "" }
              : type === "table"
                ? { rows: 3, cols: 3, data: [] }
                : type === "code"
                  ? { language: "javascript", code: "" }
                  : type === "task-list"
                    ? { tasks: [] }
                    : { url: "", title: "" },
    };

    setBlocks([...blocks, newBlock]);
  };

  const renderBlockContent = (block: Block) => {
    switch (block.type) {
      case "text":
        return (
          <Paper withBorder p="md" mb="md" style={{ position: "relative" }}>
            <Text>{block.content.text}</Text>
            <ActionIcon
              style={{ position: "absolute", top: 5, right: 5 }}
              color="gray"
              variant="subtle"
            >
              <IconEdit size={16} />
            </ActionIcon>
          </Paper>
        );
      case "image":
        return (
          <Paper withBorder p="md" mb="md">
            <Text>Image Placeholder</Text>
          </Paper>
        );
      case "video":
        return (
          <Paper withBorder p="md" mb="md">
            <Text>Video Placeholder</Text>
          </Paper>
        );
      case "table":
        return (
          <Paper withBorder p="md" mb="md">
            <Text>Table Placeholder</Text>
          </Paper>
        );
      case "code":
        return (
          <Paper withBorder p="md" mb="md">
            <Text>Code Block Placeholder</Text>
          </Paper>
        );
      case "task-list":
        return (
          <Paper withBorder p="md" mb="md">
            <Text>Task List Placeholder</Text>
          </Paper>
        );
      case "embed":
        return (
          <Paper withBorder p="md" mb="md">
            <Text>Embed Placeholder</Text>
          </Paper>
        );
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <Box pos="relative" h="100%">
        <LoadingOverlay visible />
      </Box>
    );
  }

  if (!project) {
    return (
      <Stack align="center" justify="center" h="100%">
        <Text>{t("Project not found")}</Text>
        <Button onClick={onBack}>{t("Go back")}</Button>
      </Stack>
    );
  }

  return (
    <Box>
      <Stack gap="md">
        {/* Header */}
        <Group justify="space-between">
          <Group>
            <ActionIcon variant="subtle" onClick={onBack}>
              <IconArrowLeft size={18} />
            </ActionIcon>
            <Title order={2}>{project.name}</Title>
            {project.isArchived && <Badge color="gray">{t("Archived")}</Badge>}
          </Group>

          <Menu position="bottom-end" shadow="md">
            <Menu.Target>
              <ActionIcon>
                <IconDots size={18} />
              </ActionIcon>
            </Menu.Target>

            <Menu.Dropdown>
              <Menu.Item leftSection={<IconEdit size={14} />}>
                {t("Edit project")}
              </Menu.Item>
              <Menu.Item
                leftSection={<IconPlus size={14} />}
                onClick={() => {}}
              >
                {t("Add task")}
              </Menu.Item>
              <Menu.Divider />
              <Menu.Item
                leftSection={<IconEdit size={14} />}
                onClick={handleArchiveProject}
              >
                {project.isArchived
                  ? t("Unarchive project")
                  : t("Archive project")}
              </Menu.Item>
              <Menu.Item
                leftSection={<IconTrash size={14} />}
                color="red"
                onClick={handleDeleteProject}
              >
                {t("Delete project")}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>

        {/* Project Info */}
        <Paper p="md" withBorder>
          <Stack gap="xs">
            {project.description && (
              <Text size="sm">{project.description}</Text>
            )}
            <Group gap="xl">
              {project.startDate && (
                <Text size="sm" color="dimmed">
                  {t("Start Date")}: {formatDate(new Date(project.startDate))}
                </Text>
              )}
              {project.endDate && (
                <Text size="sm" color="dimmed">
                  {t("End Date")}: {formatDate(new Date(project.endDate))}
                </Text>
              )}
              {project.creator && (
                <Text size="sm" color="dimmed">
                  {t("Created by")}: {project.creator.name}
                </Text>
              )}
            </Group>
          </Stack>
        </Paper>

        {/* View Tabs */}
        <Tabs value={activeTab} onChange={setActiveTab}>
          <Tabs.List>
            <Tabs.Tab value="document" leftSection={<IconFileText size={16} />}>
              {t("Document")}
            </Tabs.Tab>
            <Tabs.Tab value="tasks" leftSection={<IconList size={16} />}>
              {t("Tasks")}
            </Tabs.Tab>
            <Tabs.Tab
              value="board"
              leftSection={<IconLayoutDashboard size={16} />}
            >
              {t("Board")}
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="document" pt="md">
            <ScrollArea h="calc(100vh - 350px)" scrollbarSize={6}>
              {/* Document-like content */}
              <Stack>
                {blocks.map((block) => (
                  <Box key={block.id}>{renderBlockContent(block)}</Box>
                ))}

                {/* Add new block button */}
                <Group justify="center" mt="md">
                  <Menu>
                    <Menu.Target>
                      <Button
                        leftSection={<IconPlus size={16} />}
                        variant="light"
                      >
                        {t("Add Block")}
                      </Button>
                    </Menu.Target>

                    <Menu.Dropdown>
                      <Menu.Item
                        leftSection={<IconFileText size={16} />}
                        onClick={() => addBlock("text")}
                      >
                        {t("Text")}
                      </Menu.Item>
                      <Menu.Item
                        leftSection={<IconPhoto size={16} />}
                        onClick={() => addBlock("image")}
                      >
                        {t("Image")}
                      </Menu.Item>
                      <Menu.Item
                        leftSection={<IconVideo size={16} />}
                        onClick={() => addBlock("video")}
                      >
                        {t("Video")}
                      </Menu.Item>
                      <Menu.Item
                        leftSection={<IconTable size={16} />}
                        onClick={() => addBlock("table")}
                      >
                        {t("Table")}
                      </Menu.Item>
                      <Menu.Item
                        leftSection={<IconCode size={16} />}
                        onClick={() => addBlock("code")}
                      >
                        {t("Code")}
                      </Menu.Item>
                      <Menu.Item
                        leftSection={<IconList size={16} />}
                        onClick={() => addBlock("task-list")}
                      >
                        {t("Task List")}
                      </Menu.Item>
                      <Menu.Item
                        leftSection={<IconLink size={16} />}
                        onClick={() => addBlock("embed")}
                      >
                        {t("Embed / Link")}
                      </Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                </Group>
              </Stack>
            </ScrollArea>
          </Tabs.Panel>

          <Tabs.Panel value="tasks" pt="md">
            {/* Task Tree and Task Detail */}
            <Flex gap="md">
              {/* Task Tree */}
              <Box w={350} h="calc(100vh - 350px)">
                <Card withBorder h="100%">
                  <Card.Section withBorder inheritPadding py="xs">
                    <Group justify="space-between">
                      <Title order={4}>{t("Tasks")}</Title>
                      <Button
                        size="xs"
                        variant="light"
                        leftSection={<IconPlus size={14} />}
                      >
                        {t("Add")}
                      </Button>
                    </Group>
                  </Card.Section>
                  <Box h="calc(100% - 50px)" pt="sm">
                    <ScrollArea h="100%" scrollbarSize={6}>
                      <ProjectTree
                        projectId={project.id}
                        spaceId={spaceId}
                        onTaskSelect={handleTaskSelect}
                      />
                    </ScrollArea>
                  </Box>
                </Card>
              </Box>

              {/* Task Detail */}
              <Box flex={1} h="calc(100vh - 350px)">
                <Card withBorder h="100%">
                  {selectedTask ? (
                    <>
                      <Card.Section withBorder inheritPadding py="xs">
                        <Group justify="space-between">
                          <Title order={4}>{selectedTask.title}</Title>
                          <Badge
                            color={
                              selectedTask.status === "done"
                                ? "green"
                                : selectedTask.status === "in_progress"
                                  ? "blue"
                                  : selectedTask.status === "blocked"
                                    ? "red"
                                    : "gray"
                            }
                          >
                            {selectedTask.status}
                          </Badge>
                        </Group>
                      </Card.Section>
                      <ScrollArea
                        h="calc(100% - 50px)"
                        p="md"
                        scrollbarSize={6}
                      >
                        <Stack gap="md">
                          {selectedTask.description && (
                            <>
                              <Text fw={500}>{t("Description")}</Text>
                              <Text size="sm">{selectedTask.description}</Text>
                              <Divider />
                            </>
                          )}

                          <Group>
                            <Stack gap={5}>
                              <Text fw={500} size="sm">
                                {t("Priority")}
                              </Text>
                              <Badge
                                color={
                                  selectedTask.priority === "urgent"
                                    ? "red"
                                    : selectedTask.priority === "high"
                                      ? "orange"
                                      : selectedTask.priority === "medium"
                                        ? "yellow"
                                        : "blue"
                                }
                              >
                                {selectedTask.priority}
                              </Badge>
                            </Stack>

                            {selectedTask.dueDate && (
                              <Stack gap={5}>
                                <Text fw={500} size="sm">
                                  {t("Due Date")}
                                </Text>
                                <Text size="sm">
                                  {formatDate(new Date(selectedTask.dueDate))}
                                </Text>
                              </Stack>
                            )}

                            {selectedTask.assignee && (
                              <Stack gap={5}>
                                <Text fw={500} size="sm">
                                  {t("Assignee")}
                                </Text>
                                <Text size="sm">
                                  {selectedTask.assignee.name}
                                </Text>
                              </Stack>
                            )}
                          </Group>
                        </Stack>
                      </ScrollArea>
                    </>
                  ) : (
                    <Stack align="center" justify="center" h="100%">
                      <Text color="dimmed">
                        {t("Select a task to view details")}
                      </Text>
                    </Stack>
                  )}
                </Card>
              </Box>
            </Flex>
          </Tabs.Panel>

          <Tabs.Panel value="board" pt="md">
            <Box h="calc(100vh - 350px)">
              {project && <ProjectBoard project={project} onBack={() => {}} />}
            </Box>
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </Box>
  );
}
