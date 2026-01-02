import { useState } from "react";
import { Box, Container, Tabs, Text, Title } from "@mantine/core";
import { useTranslation } from "react-i18next";
import {
  IconLayoutKanban,
  IconList,
  IconCalendar,
  IconChartBar,
} from "@tabler/icons-react";
import { useProject } from "../hooks/use-projects";
import { useTasksByProject } from "../hooks/use-tasks";
import { TaskList } from "./task-list";
import { TaskKanban } from "./task-kanban";
import { TaskDrawer } from "./task-drawer";
import { useNavigate, useLocation, useParams } from "react-router-dom";

interface ProjectViewProps {
  projectId: string;
  spaceId: string;
}

export function ProjectView({ projectId, spaceId }: ProjectViewProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: project } = useProject(projectId);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [drawerOpened, setDrawerOpened] = useState(false);

  // Get the current view from the URL query params
  const searchParams = new URLSearchParams(location.search);
  const currentView = searchParams.get("view") || "list";

  // Function to change the view
  const changeView = (view: string) => {
    const newSearchParams = new URLSearchParams(searchParams);
    newSearchParams.set("view", view);
    navigate(`${location.pathname}?${newSearchParams.toString()}`);
  };

  // Handle task click
  const handleTaskClick = (taskId: string) => {
    setSelectedTaskId(taskId);
    setDrawerOpened(true);
  };

  // Handle task drawer close
  const handleDrawerClose = () => {
    setDrawerOpened(false);
  };

  // Handle opening task as page
  const handleOpenTaskAsPage = (taskId: string) => {
    // Here you would navigate to the task page
    setDrawerOpened(false);
    navigate(`/spaces/${spaceId}/p/${taskId}`);
  };

  return (
    <Box>
      {project && (
        <>
          <Title order={3} mb="md">
            {project.name}
          </Title>

          <Tabs value={currentView} onChange={changeView}>
            <Tabs.List>
              <Tabs.Tab value="list" leftSection={<IconList size={16} />}>
                {t("List")}
              </Tabs.Tab>
              <Tabs.Tab
                value="kanban"
                leftSection={<IconLayoutKanban size={16} />}
              >
                {t("Kanban")}
              </Tabs.Tab>
              <Tabs.Tab
                value="calendar"
                leftSection={<IconCalendar size={16} />}
              >
                {t("Calendar")}
              </Tabs.Tab>
              <Tabs.Tab
                value="dashboard"
                leftSection={<IconChartBar size={16} />}
              >
                {t("Dashboard")}
              </Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="list" pt="md">
              <TaskList
                projectId={projectId}
                onTaskClick={handleTaskClick}
                spaceId={spaceId}
              />
            </Tabs.Panel>

            <Tabs.Panel value="kanban" pt="md">
              <TaskKanban
                projectId={projectId}
                onTaskClick={handleTaskClick}
                spaceId={spaceId}
              />
            </Tabs.Panel>

            <Tabs.Panel value="calendar" pt="md">
              <Text>{t("Calendar view coming soon")}</Text>
            </Tabs.Panel>

            <Tabs.Panel value="dashboard" pt="md">
              <Text>{t("Dashboard view coming soon")}</Text>
            </Tabs.Panel>
          </Tabs>

          {/* Task Drawer */}
          <TaskDrawer
            taskId={selectedTaskId}
            opened={drawerOpened}
            onClose={handleDrawerClose}
            spaceId={spaceId}
          />
        </>
      )}
    </Box>
  );
}
