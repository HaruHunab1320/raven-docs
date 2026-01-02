import React from "react";
import { Task } from "../types";
import { ProjectMetricsView } from "./metrics";

interface ProjectMetricsProps {
  tasks: Task[];
  users: any[];
}

export function ProjectMetrics({ tasks, users }: ProjectMetricsProps) {
  return <ProjectMetricsView tasks={tasks} users={users} />;
}
