import { Group, Title, Button } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { logger } from "@/lib/logger";

interface DashboardHeaderProps {
  onCreateProject: () => void;
  onViewProjects?: () => void;
  onQuickAddTask?: () => void;
  onGenerateRecaps?: () => void;
}

export function DashboardHeader({
  onCreateProject,
  onViewProjects,
  onQuickAddTask,
  onGenerateRecaps,
}: DashboardHeaderProps) {
  const { t } = useTranslation();

  return (
    <Group justify="space-between">
      <Title order={2}>{t("Project Dashboard")}</Title>
      <Group gap="xs">
        {onViewProjects && (
          <Button variant="light" onClick={onViewProjects} size="sm">
            {t("View projects")}
          </Button>
        )}
        {onQuickAddTask && (
          <Button variant="light" onClick={onQuickAddTask} size="sm">
            {t("Add task")}
          </Button>
        )}
        {onGenerateRecaps && (
          <Button variant="light" onClick={onGenerateRecaps} size="sm">
            {t("Generate recaps")}
          </Button>
        )}
        <Button
          leftSection={<IconPlus size={16} />}
          onClick={() => {
            logger.log("Create Project button clicked");
            onCreateProject();
          }}
          size="sm"
        >
          {t("Create Project")}
        </Button>
      </Group>
    </Group>
  );
}
