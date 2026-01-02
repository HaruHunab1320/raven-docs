import { Dashboard } from "./dashboard";
import { Project } from "../types";

interface ProjectDashboardProps {
  spaceId: string;
  onSelectProject: (project: Project) => void;
}

export function ProjectDashboard({
  spaceId,
  onSelectProject,
}: ProjectDashboardProps) {
  return <Dashboard spaceId={spaceId} onSelectProject={onSelectProject} />;
}
