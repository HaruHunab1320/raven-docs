import { Task, TaskStatus, TaskPriority } from "../../types";
import dayjs from "dayjs";

/**
 * Get the color for a task status badge
 */
export function getStatusColor(status: TaskStatus): string {
  switch (status) {
    case "todo":
      return "gray";
    case "in_progress":
      return "blue";
    case "in_review":
      return "indigo";
    case "blocked":
      return "red";
    case "done":
      return "green";
    default:
      return "gray";
  }
}

/**
 * Get the color for a task priority badge
 */
export function getPriorityColor(priority: TaskPriority | undefined): string {
  switch (priority) {
    case "urgent":
      return "red";
    case "high":
      return "orange";
    case "medium":
      return "yellow";
    case "low":
      return "green";
    default:
      return "gray";
  }
}

/**
 * Format a date string for display
 */
export function formatDate(date: string | Date | undefined): string {
  if (!date) return "No due date";
  return dayjs(date).format("MMM D, YYYY");
}

/**
 * Check if a task is overdue
 */
export function isTaskOverdue(task: Task): boolean {
  if (!task.dueDate) return false;
  return dayjs(task.dueDate).isBefore(dayjs(), "day");
}

/**
 * Check if a task is due today
 */
export function isTaskDueToday(task: Task): boolean {
  if (!task.dueDate) return false;
  return dayjs(task.dueDate).isSame(dayjs(), "day");
}

/**
 * Get tasks that match a search term
 */
export function searchTasks(tasks: Task[], searchTerm: string): Task[] {
  if (!searchTerm.trim()) return tasks;

  const term = searchTerm.toLowerCase().trim();
  return tasks.filter(
    (task) =>
      task.title.toLowerCase().includes(term) ||
      (task.description && task.description.toLowerCase().includes(term))
  );
}

/**
 * Get a human-readable label for a task status
 */
export function getStatusLabel(status: TaskStatus): string {
  switch (status) {
    case "todo":
      return "To Do";
    case "in_progress":
      return "In Progress";
    case "in_review":
      return "In Review";
    case "blocked":
      return "Blocked";
    case "done":
      return "Done";
    default:
      return status;
  }
}

/**
 * Get a human-readable label for a task priority
 */
export function getPriorityLabel(priority: TaskPriority | undefined): string {
  switch (priority) {
    case "urgent":
      return "Urgent";
    case "high":
      return "High";
    case "medium":
      return "Medium";
    case "low":
      return "Low";
    default:
      return "None";
  }
}

/**
 * Convert a date group key to a human-readable label
 */
export function getDateGroupLabel(key: string): string {
  switch (key) {
    case "overdue":
      return "Overdue";
    case "today":
      return "Today";
    case "tomorrow":
      return "Tomorrow";
    case "thisWeek":
      return "This Week";
    case "later":
      return "Later";
    case "noDueDate":
      return "No Due Date";
    default:
      return key;
  }
}

/**
 * Sort tasks by the given criteria
 */
export function sortTasks(
  tasks: Task[],
  sortBy: "priority" | "dueDate" | "createdAt" | "title",
  sortOrder: "asc" | "desc"
): Task[] {
  return [...tasks].sort((a, b) => {
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
      const aDate = new Date(a.createdAt).getTime();
      const bDate = new Date(b.createdAt).getTime();
      return sortOrder === "asc" ? aDate - bDate : bDate - aDate;
    } else {
      // title
      return sortOrder === "asc"
        ? a.title.localeCompare(b.title)
        : b.title.localeCompare(a.title);
    }
  });
}
