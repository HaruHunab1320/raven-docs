import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Box,
  Container,
  Group,
  Text,
  Breadcrumbs,
  Anchor,
  Button,
  Modal,
  Stack,
  Checkbox,
  ScrollArea,
  NumberInput,
} from "@mantine/core";
import { ProjectList } from "../components/project-list";
import { ProjectBoard } from "../components/project-board";
import { Project } from "../types/index";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useCurrentSpace } from "@/features/space/hooks/use-current-space";
import { useCurrentWorkspace } from "@/features/workspace/hooks/use-current-workspace";
import { DashboardMetrics } from "../components/dashboard/components/DashboardMetrics";
import { DashboardCharts } from "../components/dashboard/components/DashboardCharts";
import { useDashboardData } from "../components/dashboard/dashboard-hooks";
import { DashboardHeader } from "../components/dashboard/components/DashboardHeader";
import { useDisclosure } from "@mantine/hooks";
import ProjectFormModal from "../components/project-form-modal";
import { QuickTaskModal } from "../components/quick-task-modal";
import APP_ROUTE from "@/lib/app-route";
import { usePageTabs } from "@/features/page/hooks/use-page-tabs";
import { BreadcrumbBar } from "@/features/page/components/breadcrumbs/breadcrumb-bar";
import breadcrumbClasses from "@/features/page/components/breadcrumbs/breadcrumb.module.css";
import { useQuery } from "@tanstack/react-query";
import { agentMemoryService } from "@/features/agent-memory/services/agent-memory-service";
import {
  buildActivityStats,
  ActivityStats,
} from "@/features/agent-memory/utils/activity-metrics";
import { logger } from "@/lib/logger";
import { notifications } from "@mantine/notifications";
import { projectService } from "@/features/project/services/project-service";

export function ProjectManagementPage() {
  const { t } = useTranslation();
  const { spaceId } = useParams<{ spaceId: string }>();
  const { data: spaceData } = useCurrentSpace();
  const { data: workspaceData } = useCurrentWorkspace();
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [showDashboard, setShowDashboard] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();
  const [quickTaskOpened, setQuickTaskOpened] = useState(false);
  const [quickTaskProjectId, setQuickTaskProjectId] = useState<string | null>(
    null
  );
  const [recapModalOpened, recapModalHandlers] = useDisclosure(false);
  const [recapAllProjects, setRecapAllProjects] = useState(true);
  const [recapProjectIds, setRecapProjectIds] = useState<string[]>([]);
  const [recapDays, setRecapDays] = useState<number | string>(7);
  const [includeOpenTasks, setIncludeOpenTasks] = useState(true);
  const [isGeneratingRecaps, setIsGeneratingRecaps] = useState(false);
  const { upsertTab } = usePageTabs();

  // Use useDisclosure with a stable reference
  const [createModalOpened, createModalHandlers] = useDisclosure(false);

  // Create stable callback references to prevent re-renders
  const openCreateModal = useCallback(() => {
    logger.log("Opening create project modal with spaceId:", spaceId);
    createModalHandlers.open();
  }, [spaceId, createModalHandlers]);

  const closeCreateModal = useCallback(() => {
    createModalHandlers.close();
  }, [createModalHandlers]);


  const {
    projects,
    taskStats,
    projectWithMostTasks,
    projectCompletionRates,
    taskDistributionByOwner,
    isLoading,
  } = useDashboardData({ spaceId });

  const activeProjects = useMemo(
    () => (projects || []).filter((project) => !project.isArchived),
    [projects],
  );

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

  const spaceActivityQuery = useQuery({
    queryKey: ["space-activity", workspaceData?.id, spaceId],
    queryFn: () =>
      agentMemoryService.query({
        workspaceId: workspaceData?.id || "",
        spaceId: spaceId || undefined,
        sources: ["page.view", "project.view", "activity.view"],
        from: activityRange.from30,
        limit: 500,
      }),
    enabled: !!workspaceData?.id && !!spaceId,
  });

  const spaceActivityStats = useMemo<ActivityStats>(
    () => buildActivityStats(spaceActivityQuery.data),
    [spaceActivityQuery.data],
  );

  const spaceActivityStats7d = useMemo<ActivityStats>(() => {
    const entries = spaceActivityQuery.data || [];
    const cutoff = Date.parse(activityRange.from7);
    const filtered = entries.filter((entry) => {
      const ts = new Date(entry.timestamp || 0).getTime();
      return Number.isFinite(ts) && ts >= cutoff;
    });
    return buildActivityStats(filtered);
  }, [spaceActivityQuery.data, activityRange.from7]);

  // Monitor URL for project ID
  useEffect(() => {
    const projectId = new URLSearchParams(location.search).get("projectId");
    if (projectId) {
      const project = projects.find((p) => p.id === projectId);
      if (project) {
        setSelectedProject(project);
        setShowDashboard(false);
      }
      return;
    }

    setSelectedProject(null);
    setShowDashboard(true);
  }, [location.search, projects]);

  useEffect(() => {
    if (!spaceId) return;

    // Check URL for projectId to avoid timing issues with selectedProject state
    const projectIdFromUrl = new URLSearchParams(location.search).get("projectId");

    // When viewing a specific project, create a tab for that project only
    // Don't create a dashboard tab - the user navigated directly to a project
    if (selectedProject) {
      upsertTab({
        id: `project:${selectedProject.id}`,
        title: selectedProject.name || t("Project"),
        url: APP_ROUTE.SPACE.PROJECTS(spaceId) + `?projectId=${selectedProject.id}`,
        icon: selectedProject.icon || "📁",
      });
      return;
    }

    // If URL has projectId but project data hasn't loaded yet, don't create dashboard tab
    // Wait for the project to be loaded and selectedProject to be set
    if (projectIdFromUrl) {
      return;
    }

    // For the projects dashboard/list (same page, different views), use one consistent tab ID
    upsertTab({
      id: `projects:${spaceId}`,
      title: t("Projects"),
      url: APP_ROUTE.SPACE.PROJECTS(spaceId),
      icon: "🗂️",
    });
  }, [selectedProject, spaceId, t, upsertTab, location.search]);

  // Debug logging
  logger.log("ProjectManagementPage - spaceId:", spaceId);
  logger.log("ProjectManagementPage - spaceData:", spaceData);
  logger.log("ProjectManagementPage - workspaceData:", workspaceData);
  logger.log("ProjectManagementPage - showDashboard:", showDashboard);

  const handleSelectProject = (project: Project) => {
    setSelectedProject(project);
    setShowDashboard(false);
  };

  const handleBackToProjects = () => {
    setSelectedProject(null);
  };

  const openRecapModal = () => {
    recapModalHandlers.open();
  };

  const closeRecapModal = () => {
    recapModalHandlers.close();
  };

  const handleGenerateRecaps = async () => {
    const days = typeof recapDays === "number" ? recapDays : Number(recapDays);
    const clampedDays = Number.isFinite(days)
      ? Math.min(Math.max(days, 1), 90)
      : 7;
    const selected = recapAllProjects
      ? activeProjects
      : activeProjects.filter((project) => recapProjectIds.includes(project.id));

    if (!selected.length) {
      notifications.show({
        title: t("No projects selected"),
        message: t("Select at least one project to generate recaps."),
        color: "yellow",
      });
      return;
    }

    setIsGeneratingRecaps(true);
    const failures: string[] = [];
    for (const project of selected) {
      try {
        await projectService.generateProjectRecap({
          projectId: project.id,
          days: clampedDays,
          includeOpenTasks,
        });
      } catch {
        failures.push(project.name);
      }
    }
    setIsGeneratingRecaps(false);

    if (failures.length) {
      notifications.show({
        title: t("Some recaps failed"),
        message: t("Failed to recap: {{names}}", {
          names: failures.join(", "),
        }),
        color: "red",
      });
    } else {
      notifications.show({
        title: t("Recaps created"),
        message: t("Generated recaps for {{count}} projects.", {
          count: selected.length,
        }),
        color: "green",
      });
    }

    closeRecapModal();
  };

  const handleToggleDashboard = () => {
    setShowDashboard(!showDashboard);
  };

  const openQuickTask = (projectId?: string | null) => {
    setQuickTaskProjectId(projectId || null);
    setQuickTaskOpened(true);
  };

  const renderBreadcrumbs = () => {
    const items = [
      { title: workspaceData?.name || "Workspace", href: "/dashboard" },
      { title: spaceData?.name || "Space", href: APP_ROUTE.SPACE.TODAY(spaceId) },
      {
        title: t("Projects"),
        href: `/spaces/${spaceId}/projects`,
        onClick: () => {
          setSelectedProject(null);
          setShowDashboard(false);
          navigate(`/spaces/${spaceId}/projects`);
        },
      },
    ];

    return (
      <BreadcrumbBar>
        <Breadcrumbs className={breadcrumbClasses.breadcrumbs}>
          {items.map((item, index) => (
            <Anchor
              key={index}
              href={item.href}
              onClick={(e) => {
                e.preventDefault();
                if (item.onClick) {
                  item.onClick();
                  return;
                }
                if (item.href && item.href !== "#") {
                  navigate(item.href);
                }
              }}
            >
              {item.title}
            </Anchor>
          ))}
        </Breadcrumbs>
      </BreadcrumbBar>
    );
  };

  const renderContent = () => {
    if (selectedProject) {
      return (
        <Box>
          <ProjectBoard
            project={selectedProject}
            onBack={handleBackToProjects}
          />
        </Box>
      );
    }

    if (showDashboard) {
      return (
        <Box p="md">
          <Group justify="space-between">
            <DashboardHeader
              onCreateProject={openCreateModal}
              onViewProjects={() => setShowDashboard(false)}
              onQuickAddTask={() => openQuickTask()}
              onGenerateRecaps={openRecapModal}
            />
          </Group>
          <Box mt="xl">
            <DashboardMetrics
              taskStats={taskStats}
              projectCount={projects.length}
              spaceId={spaceId}
              activityStats={spaceActivityStats}
              activityStats7d={spaceActivityStats7d}
            />
          </Box>
          <Box mt="xl">
            <DashboardCharts
              projectCompletionRates={projectCompletionRates}
              projectWithMostTasks={projectWithMostTasks}
              taskStats={taskStats}
              taskDistributionByOwner={taskDistributionByOwner || []}
              onOpenProject={handleSelectProject}
              onAddTask={(project) => openQuickTask(project.id)}
            />
          </Box>
        </Box>
      );
    }

    return (
      <ProjectList
        spaceId={spaceId}
        workspaceId={workspaceData.id}
        onSelectProject={handleSelectProject}
        onShowDashboard={() => setShowDashboard(true)}
      />
    );
  };

  // Memoize the ProjectFormModal to prevent unnecessary re-renders
  const projectFormModalMemo = useMemo(
    () => (
      <ProjectFormModal
        opened={createModalOpened}
        onClose={closeCreateModal}
        spaceId={spaceId}
        workspaceId={workspaceData?.id || ""}
      />
    ),
    [createModalOpened, closeCreateModal, spaceId, workspaceData?.id]
  );

  // Return early if data is missing
  if (!spaceId || !spaceData || !workspaceData) {
    return (
      <Container mt={0} mb="xl">
        <Text>{t("Loading...")}</Text>
      </Container>
    );
  }

  return (
    <>
      {/* Breadcrumbs provide navigation between workspace, space, project list, and current project */}
      {renderBreadcrumbs()}
      <Container size="xl" mt={0} mb="xl" pt="sm">
        {renderContent()}

        {/* Use memoized modal */}
        {projectFormModalMemo}
        <Modal
          opened={recapModalOpened}
          onClose={closeRecapModal}
          title={t("Generate project recaps")}
          size="md"
        >
          <Stack gap="md">
            <Checkbox
              checked={recapAllProjects}
              label={t("All active projects")}
              onChange={(event) => {
                const nextValue = event.currentTarget.checked;
                setRecapAllProjects(nextValue);
                if (nextValue) {
                  setRecapProjectIds([]);
                }
              }}
            />
            {!recapAllProjects && (
              <ScrollArea h={200} type="auto">
                <Stack gap="xs">
                  {activeProjects.map((project) => (
                    <Checkbox
                      key={project.id}
                      checked={recapProjectIds.includes(project.id)}
                      label={project.name}
                      onChange={(event) => {
                        setRecapProjectIds((prev) =>
                          event.currentTarget.checked
                            ? [...prev, project.id]
                            : prev.filter((id) => id !== project.id)
                        );
                      }}
                    />
                  ))}
                  {!activeProjects.length && (
                    <Text size="sm" c="dimmed">
                      {t("No active projects available.")}
                    </Text>
                  )}
                </Stack>
              </ScrollArea>
            )}
            <Group grow>
              <NumberInput
                label={t("Days")}
                min={1}
                max={90}
                value={recapDays}
                onChange={setRecapDays}
              />
              <Checkbox
                checked={includeOpenTasks}
                label={t("Include open tasks")}
                onChange={(event) =>
                  setIncludeOpenTasks(event.currentTarget.checked)
                }
                mt={24}
              />
            </Group>
            <Group justify="flex-end">
              <Button variant="subtle" onClick={closeRecapModal}>
                {t("Cancel")}
              </Button>
              <Button
                onClick={handleGenerateRecaps}
                loading={isGeneratingRecaps}
              >
                {t("Generate recaps")}
              </Button>
            </Group>
          </Stack>
        </Modal>
        <QuickTaskModal
          opened={quickTaskOpened}
          onClose={() => setQuickTaskOpened(false)}
          spaceId={spaceId}
          projects={projects}
          defaultProjectId={quickTaskProjectId}
        />
      </Container>
    </>
  );
}
