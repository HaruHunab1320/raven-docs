import { useMemo, useCallback } from "react";
import {
  useTasksByProject,
  useUpdateTaskMutation,
  useUpdateTaskPositionMutation,
} from "../../hooks/use-tasks";
import {
  Task,
  TaskPriority,
  TaskStatus,
  Label,
  UpdateTaskParams,
} from "../../types";
import { useWorkspaceUsers } from "@/features/user/hooks/use-workspace-users";
import dayjs from "dayjs";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";
import { useBoardContext } from "./board-context";
import { logger } from "@/lib/logger";

// Add dayjs plugins
dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);

// Define query key constants to match the ones in use-tasks.ts
export const TASKS_KEY = "tasks";
export const TASKS_BY_PROJECT_KEY = "project-tasks";
export const TASKS_BY_SPACE_KEY = "space-tasks";

/**
 * Custom hook to get filtered and sorted tasks for a project
 */
export function useFilteredTasks({
  projectId,
  statusFilter,
  priorityFilter,
  assigneeFilter,
  labelFilter,
  searchTerm,
  showCompletedTasks,
  dateRangeFilter,
  sortBy,
  sortOrder,
}: {
  projectId: string;
  statusFilter: TaskStatus[];
  priorityFilter: TaskPriority[];
  assigneeFilter: string[];
  labelFilter: string[];
  searchTerm: string;
  showCompletedTasks: boolean;
  dateRangeFilter: [Date | null, Date | null];
  sortBy: "priority" | "dueDate" | "createdAt" | "title" | "position";
  sortOrder: "asc" | "desc";
}) {
  const { data: tasksData, isLoading: isTasksLoading } = useTasksByProject({
    projectId,
  });

  const filteredTasks = useMemo(() => {
    logger.log(
      `FILTER/SORT: Applying filters/sort. SortBy: ${sortBy}, SortOrder: ${sortOrder}`
    );
    if (!tasksData) return [];
    let filtered = [...tasksData.items];

    // Apply filters
    if (statusFilter.length > 0) {
      filtered = filtered.filter((task) => statusFilter.includes(task.status));
    }

    if (priorityFilter.length > 0) {
      filtered = filtered.filter(
        (task) => task.priority && priorityFilter.includes(task.priority)
      );
    }

    if (assigneeFilter.length > 0) {
      filtered = filtered.filter(
        (task) => task.assigneeId && assigneeFilter.includes(task.assigneeId)
      );
    }

    if (labelFilter.length > 0) {
      filtered = filtered.filter(
        (task) =>
          (task as any).labels &&
          (task as any).labels.some((label) => labelFilter.includes(label.id))
      );
    }

    if (!showCompletedTasks) {
      filtered = filtered.filter((task) => task.status !== "done");
    }

    // Apply search term
    if (searchTerm.trim() !== "") {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (task) =>
          task.title.toLowerCase().includes(term) ||
          (task.description && task.description.toLowerCase().includes(term))
      );
    }

    // Apply date range filter
    if (dateRangeFilter[0] && dateRangeFilter[1]) {
      const startDate = dayjs(dateRangeFilter[0]);
      const endDate = dayjs(dateRangeFilter[1]);

      filtered = filtered.filter((task) => {
        if (!task.dueDate) return false;
        const taskDate = dayjs(task.dueDate);
        return (
          taskDate.isSameOrAfter(startDate, "day") &&
          taskDate.isSameOrBefore(endDate, "day")
        );
      });
    } else if (dateRangeFilter[0]) {
      const startDate = dayjs(dateRangeFilter[0]);
      filtered = filtered.filter((task) => {
        if (!task.dueDate) return false;
        return dayjs(task.dueDate).isSameOrAfter(startDate, "day");
      });
    } else if (dateRangeFilter[1]) {
      const endDate = dayjs(dateRangeFilter[1]);
      filtered = filtered.filter((task) => {
        if (!task.dueDate) return false;
        return dayjs(task.dueDate).isSameOrBefore(endDate, "day");
      });
    }

    // Apply sorting
    logger.log(
      `FILTER/SORT: Sorting ${filtered.length} tasks by ${sortBy} (${sortOrder})`
    );
    filtered.sort((a, b) => {
      if (sortBy === "priority") {
        const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
        const aPriority = a.priority ? priorityOrder[a.priority] || 0 : 0;
        const bPriority = b.priority ? priorityOrder[b.priority] || 0 : 0;
        return sortOrder === "asc"
          ? aPriority - bPriority
          : bPriority - aPriority;
      } else if (sortBy === "dueDate") {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return sortOrder === "asc" ? 1 : -1;
        if (!b.dueDate) return sortOrder === "asc" ? -1 : 1;

        const aDate = new Date(a.dueDate).getTime();
        const bDate = new Date(b.dueDate).getTime();
        return sortOrder === "asc" ? aDate - bDate : bDate - aDate;
      } else if (sortBy === "createdAt") {
        const aDate = new Date((a as any).createdAt || Date.now()).getTime();
        const bDate = new Date((b as any).createdAt || Date.now()).getTime();
        return sortOrder === "asc" ? aDate - bDate : bDate - aDate;
      } else if (sortBy === "position") {
        // Use position if available, otherwise fall back to ID
        const aPos = (a as any).position || a.id;
        const bPos = (b as any).position || b.id;
        // Position is always sorted ascending (lexicographically)
        return aPos.localeCompare(bPos);
      } else {
        // title
        return sortOrder === "asc"
          ? a.title.localeCompare(b.title)
          : b.title.localeCompare(a.title);
      }
    });

    logger.log(
      `FILTER/SORT: Final filtered/sorted task count: ${filtered.length}`
    );
    return filtered;
  }, [
    tasksData,
    statusFilter,
    priorityFilter,
    assigneeFilter,
    labelFilter,
    searchTerm,
    showCompletedTasks,
    dateRangeFilter,
    sortBy,
    sortOrder,
  ]);

  return {
    tasks: filteredTasks,
    isLoading: isTasksLoading,
    rawTasks: tasksData?.items || [],
  };
}

/**
 * Custom hook to get tasks grouped by a specific criteria
 */
export function useGroupedTasks({
  tasks,
  groupBy,
  workspaceId,
}: {
  tasks: Task[];
  groupBy: "status" | "assignee" | "priority" | "date" | "labels";
  workspaceId: string;
}) {
  // Get workspace users for assignee grouping
  const { data: usersData, isLoading: isUsersLoading } = useWorkspaceUsers({
    workspaceId,
  });
  const users = usersData?.items || [];

  const groupedTasks = useMemo(() => {
    if (groupBy === "status") {
      const statusGroups: Record<TaskStatus, Task[]> = {
        todo: [],
        in_progress: [],
        in_review: [],
        blocked: [],
        done: [],
      };

      tasks.forEach((task) => {
        if (statusGroups[task.status]) {
          statusGroups[task.status].push(task);
        }
      });

      return statusGroups;
    } else if (groupBy === "assignee") {
      const assigneeGroups: Record<string, Task[]> = {};
      const unassigned: Task[] = [];

      tasks.forEach((task) => {
        if (!task.assigneeId) {
          unassigned.push(task);
        } else {
          if (!assigneeGroups[task.assigneeId]) {
            assigneeGroups[task.assigneeId] = [];
          }
          assigneeGroups[task.assigneeId].push(task);
        }
      });

      // Add unassigned group
      return { ...assigneeGroups, unassigned };
    } else if (groupBy === "priority") {
      const priorityGroups: Record<TaskPriority | "none", Task[]> = {
        urgent: [],
        high: [],
        medium: [],
        low: [],
        none: [],
      };

      tasks.forEach((task) => {
        if (task.priority) {
          priorityGroups[task.priority].push(task);
        } else {
          priorityGroups.none.push(task);
        }
      });

      return priorityGroups;
    } else if (groupBy === "date") {
      const today = dayjs().startOf("day");
      const tomorrow = today.add(1, "day");
      const nextWeek = today.add(7, "day");

      const dateGroups: Record<string, Task[]> = {
        overdue: [],
        today: [],
        tomorrow: [],
        thisWeek: [],
        later: [],
        noDueDate: [],
      };

      tasks.forEach((task) => {
        if (!task.dueDate) {
          dateGroups.noDueDate.push(task);
          return;
        }

        const dueDate = dayjs(task.dueDate).startOf("day");

        if (dueDate.isBefore(today)) {
          dateGroups.overdue.push(task);
        } else if (dueDate.isSame(today)) {
          dateGroups.today.push(task);
        } else if (dueDate.isSame(tomorrow)) {
          dateGroups.tomorrow.push(task);
        } else if (dueDate.isBefore(nextWeek)) {
          dateGroups.thisWeek.push(task);
        } else {
          dateGroups.later.push(task);
        }
      });

      return dateGroups;
    } else if (groupBy === "labels") {
      const labelGroups: Record<string, Task[]> = {};
      const noLabels: Task[] = [];

      tasks.forEach((task) => {
        if (!(task as any).labels || (task as any).labels.length === 0) {
          noLabels.push(task);
        } else {
          (task as any).labels.forEach((label) => {
            if (!labelGroups[label.id]) {
              labelGroups[label.id] = [];
            }
            labelGroups[label.id].push(task);
          });
        }
      });

      // Add no labels group
      return { ...labelGroups, noLabels };
    }

    // Default - return by status
    return {};
  }, [tasks, groupBy, users]);

  return {
    groupedTasks,
    users,
    isLoading: isUsersLoading,
  };
}

/**
 * Hook for task operations (update status, position, etc.)
 */
export function useTaskOperations() {
  const { project } = useBoardContext();
  const updateTaskMutation = useUpdateTaskMutation();
  const updatePositionMutation = useUpdateTaskPositionMutation();

  const updateTaskStatus = useCallback(
    (taskId: string, status: TaskStatus) => {
      // Log for debugging
      logger.log(`Updating task status: ${taskId} to ${status}`);

      updateTaskMutation.mutate({
        taskId,
        status,
      });
    },
    [updateTaskMutation]
  );

  const updateTaskPosition = useCallback(
    (
      taskId: string,
      position: string,
      projectId?: string,
      spaceId?: string
    ) => {
      // Log position for debugging
      logger.log(`Updating position for task ${taskId}:`, {
        position,
        projectId,
        spaceId,
      });

      // Make sure we're sending the position field in the payload
      updatePositionMutation.mutate({
        taskId,
        position,
        projectId,
        spaceId,
      });
    },
    [updatePositionMutation]
  );

  const updateTaskPriority = useCallback(
    (taskId: string, priority: TaskPriority) => {
      updateTaskMutation.mutate({
        taskId,
        priority,
      });
    },
    [updateTaskMutation]
  );

  const updateTaskAssignee = useCallback(
    (taskId: string, assigneeId: string | null) => {
      return updateTaskMutation.mutate({
        taskId,
        assigneeId,
      });
    },
    [updateTaskMutation]
  );

  return {
    updateTask: (params: Parameters<typeof updateTaskMutation.mutate>[0]) =>
      updateTaskMutation.mutate(params),
    updateTaskStatus,
    updateTaskAssignee,
    updateTaskPriority,
    updateTaskPosition,
    isUpdating:
      updateTaskMutation.isPending || updatePositionMutation.isPending,
  };
}
