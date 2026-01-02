import { useState } from "react";
import { Box, Button, Flex, Stack, Text, useMantineTheme } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useTranslation } from "react-i18next";
import { Project } from "../../../types";
import { useDashboardData } from "../dashboard-hooks";
import { DashboardHeader } from "./DashboardHeader";
import { DashboardMetrics } from "./DashboardMetrics";
import { DashboardCharts } from "./DashboardCharts";
import { ProjectFormModal } from "./ProjectFormModal";

interface DashboardProps {
  spaceId: string;
  onSelectProject: (project: Project) => void;
}

export function Dashboard({ spaceId, onSelectProject }: DashboardProps) {
  const { t } = useTranslation();
  const theme = useMantineTheme();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null
  );
  const [currentView, setCurrentView] = useState<string>("overview");
  const [opened, { open, close }] = useDisclosure(false);

  // Get dashboard data using the custom hook
  const {
    projects,
    taskStats,
    projectWithMostTasks,
    projectCompletionRates,
    taskDistributionByOwner,
    isLoading,
  } = useDashboardData({ spaceId });

  // Handle project selection
  const handleProjectSelect = (project: Project) => {
    setSelectedProjectId(project.id);
    onSelectProject(project);
  };

  // Function to handle view changes
  const handleViewChange = (view: string) => {
    setCurrentView(view);
  };

  // Conditional rendering based on whether a project is selected
  if (selectedProjectId) {
    return (
      <Flex>
        {/* Project File Sidebar - shown when a project is selected */}
        <Box
          w={260}
          style={{ borderRight: `1px solid ${theme.colors.gray[3]}` }}
        ></Box>

        {/* Main Content */}
        <Box flex={1} p="md">
          <Text>
            {t("Project detail view - {{view}}", { view: currentView })}
          </Text>
          <Button mt="md" onClick={() => setSelectedProjectId(null)}>
            {t("Back to projects list")}
          </Button>
        </Box>
      </Flex>
    );
  }

  // Original dashboard view when no project is selected
  return (
    <Flex>
      {/* Main Content */}
      <Box flex={1} p="md">
        <Stack gap="xl">
          {/* Header */}
          <DashboardHeader onCreateProject={open} />

          {/* Summary cards */}
          <DashboardMetrics
            taskStats={taskStats}
            projectCount={projects.length}
            spaceId={spaceId}
          />

          {/* Project metrics and charts */}
          <DashboardCharts
            projectCompletionRates={projectCompletionRates}
            projectWithMostTasks={projectWithMostTasks}
            taskStats={taskStats}
            taskDistributionByOwner={taskDistributionByOwner}
          />
        </Stack>
      </Box>

      {/* Project Creation Modal */}
      <ProjectFormModal opened={opened} onClose={close} spaceId={spaceId} />
    </Flex>
  );
}
