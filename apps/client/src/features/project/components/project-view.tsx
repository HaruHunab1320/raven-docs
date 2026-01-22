import { useMemo, useState } from "react";
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
import { useCurrentWorkspace } from "@/features/workspace/hooks/use-current-workspace";
import { useWorkspaceUsers } from "@/features/user/hooks/use-workspace-users";
import { ProjectMetricsView } from "./metrics";
import { useQuery } from "@tanstack/react-query";
import { agentMemoryService } from "@/features/agent-memory/services/agent-memory-service";
import {
  buildActivityStats,
  ActivityStats,
} from "@/features/agent-memory/utils/activity-metrics";

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
  const { data: workspace } = useCurrentWorkspace();
  const { data: tasksData } = useTasksByProject({
    projectId,
    page: 1,
    limit: 500,
  });
  const { data: workspaceUsersData } = useWorkspaceUsers({
    workspaceId: workspace?.id || "",
  });
  const workspaceUsers = workspaceUsersData?.items || [];

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

  const activityRange = useMemo(() => {
    const now = new Date();
    const from30 = new Date(now);
    from30.setDate(from30.getDate() - 30);
    const from7 = new Date(now);
    from7.setDate(from7.getDate() - 7);
    return {
      from30: from30.toISOString(),
      from7: from7.toISOString(),
    };
  }, []);

  const projectActivityQuery = useQuery({
    queryKey: ["project-activity", workspace?.id, projectId],
    queryFn: () =>
      agentMemoryService.query({
        workspaceId: workspace?.id || "",
        spaceId,
        sources: ["page.view", "project.view", "activity.view"],
        tags: [`project:${projectId}`],
        from: activityRange.from30,
        limit: 300,
      }),
    enabled: !!workspace?.id && !!projectId,
  });

  const projectActivityStats = useMemo<ActivityStats>(
    () => buildActivityStats(projectActivityQuery.data),
    [projectActivityQuery.data],
  );

  const projectActivityStats7d = useMemo<ActivityStats>(() => {
    const entries = projectActivityQuery.data || [];
    const cutoff = Date.parse(activityRange.from7);
    const filtered = entries.filter((entry) => {
      const ts = new Date(entry.timestamp || 0).getTime();
      return Number.isFinite(ts) && ts >= cutoff;
    });
    return buildActivityStats(filtered);
  }, [projectActivityQuery.data, activityRange.from7]);

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
              <ProjectMetricsView
                tasks={tasksData?.items || []}
                users={workspaceUsers}
                activityStats={projectActivityStats}
                activityStats7d={projectActivityStats7d}
              />
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
