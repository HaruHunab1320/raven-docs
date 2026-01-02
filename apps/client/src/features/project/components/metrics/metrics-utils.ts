import { Task, TaskStatus, TaskPriority } from "../../types";
import dayjs from "dayjs";

export const priorityColors = {
  urgent: "red",
  high: "orange",
  medium: "yellow",
  low: "green",
};

export interface MetricsData {
  totalTasks: number;
  completedTasks: number;
  completionPercentage: number;
  tasksByStatus: Record<string, number>;
  tasksByPriority: Record<string, number>;
  tasksByUser: Map<string, { count: number; completed: number; user: any }>;
  tasksByAssignee: [string, { count: number; completed: number; user: any }][];
  overdueTasks: Task[];
  upcomingDeadlines: Task[];
  tasksWithoutDueDate: number;
  recentlyCompletedTasks: number;
  recentlyCreatedTasks: number;
}

export function calculateMetrics(tasks: Task[], users: any[]): MetricsData {
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((task) => task.status === "done").length;
  const completionPercentage =
    totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

  // Tasks by status
  const tasksByStatus = tasks.reduce(
    (acc, task) => {
      acc[task.status] = (acc[task.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  // Tasks by priority
  const tasksByPriority = tasks.reduce(
    (acc, task) => {
      acc[task.priority] = (acc[task.priority] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  // Tasks by user/assignee
  const tasksByUser = new Map<
    string,
    { count: number; completed: number; user: any }
  >();

  // Initialize with "unassigned"
  tasksByUser.set("unassigned", { count: 0, completed: 0, user: null });

  // Process each task
  tasks.forEach((task) => {
    const assigneeId = task.assigneeId || "unassigned";
    if (!tasksByUser.has(assigneeId) && assigneeId !== "unassigned") {
      const user = users.find((u) => u.id === assigneeId);
      tasksByUser.set(assigneeId, { count: 0, completed: 0, user });
    }

    const userData = tasksByUser.get(assigneeId)!;
    userData.count += 1;
    if (task.status === "done") {
      userData.completed += 1;
    }
  });

  // Convert to array and sort by count
  const tasksByAssignee = Array.from(tasksByUser.entries())
    .filter(([_, data]) => data.count > 0)
    .sort((a, b) => b[1].count - a[1].count);

  // Due date analysis
  const now = dayjs();
  const overdueTasks = tasks.filter(
    (task) =>
      task.dueDate &&
      dayjs(task.dueDate).isBefore(now) &&
      task.status !== "done"
  );

  const upcomingDeadlines = tasks
    .filter(
      (task) =>
        task.dueDate &&
        dayjs(task.dueDate).isAfter(now) &&
        dayjs(task.dueDate).diff(now, "day") <= 7 &&
        task.status !== "done"
    )
    .sort((a, b) => dayjs(a.dueDate).diff(dayjs(b.dueDate)));

  const tasksWithoutDueDate = tasks.filter((task) => !task.dueDate).length;

  // Recent activity
  const lastWeek = dayjs().subtract(7, "day");
  const lastMonth = dayjs().subtract(30, "day");

  const recentlyCompletedTasks = tasks.filter(
    (task) =>
      task.status === "done" &&
      task.completedAt &&
      dayjs(task.completedAt).isAfter(lastWeek)
  ).length;

  const recentlyCreatedTasks = tasks.filter((task) =>
    dayjs(task.createdAt).isAfter(lastMonth)
  ).length;

  return {
    totalTasks,
    completedTasks,
    completionPercentage,
    tasksByStatus,
    tasksByPriority,
    tasksByUser,
    tasksByAssignee,
    overdueTasks,
    upcomingDeadlines,
    tasksWithoutDueDate,
    recentlyCompletedTasks,
    recentlyCreatedTasks,
  };
}
