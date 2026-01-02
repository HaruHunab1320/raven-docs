import { useMutation, useQueryClient } from "@tanstack/react-query";
import { projectService } from "../services/project-service";
import { CreateTaskParams, Task, UpdateTaskParams } from "../types";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";

export function useCreateTaskMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (params: CreateTaskParams) => projectService.createTask(params),
    onSuccess: (_, variables) => {
      // Invalidate queries that might be affected by this mutation
      queryClient.invalidateQueries({
        queryKey: ["tasks", "project", variables.projectId],
      });
      queryClient.invalidateQueries({
        queryKey: ["tasks", "space", variables.spaceId],
      });
    },
    onError: (error) => {
      notifications.show({
        title: t("Error"),
        message: t("Failed to create task"),
        color: "red",
      });
      console.error("Error creating task:", error);
    },
  });
}

export function useUpdateTaskMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (params: UpdateTaskParams) => projectService.updateTask(params),
    onSuccess: (updatedTask) => {
      // Invalidate queries that might be affected by this mutation
      queryClient.invalidateQueries({
        queryKey: ["tasks", "project", updatedTask.projectId],
      });
      queryClient.invalidateQueries({
        queryKey: ["tasks", "space", updatedTask.spaceId],
      });
      queryClient.invalidateQueries({
        queryKey: ["task", updatedTask.id],
      });
    },
    onError: (error) => {
      notifications.show({
        title: t("Error"),
        message: t("Failed to update task"),
        color: "red",
      });
      console.error("Error updating task:", error);
    },
  });
}

export function useDeleteTaskMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: ({ taskId }: { taskId: string }) =>
      projectService.deleteTask(taskId),
    onSuccess: (_, variables) => {
      // We need to get the task before it was deleted to know which queries to invalidate
      const task = queryClient.getQueryData<Task>(["task", variables.taskId]);

      if (task) {
        // Invalidate queries that might be affected by this mutation
        queryClient.invalidateQueries({
          queryKey: ["tasks", "project", task.projectId],
        });
        queryClient.invalidateQueries({
          queryKey: ["tasks", "space", task.spaceId],
        });
      }

      // Remove the deleted task from the cache
      queryClient.removeQueries({
        queryKey: ["task", variables.taskId],
      });
    },
    onError: (error) => {
      notifications.show({
        title: t("Error"),
        message: t("Failed to delete task"),
        color: "red",
      });
      console.error("Error deleting task:", error);
    },
  });
}
