import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import {
  getKnowledgeSources,
  createKnowledgeSource,
  deleteKnowledgeSource,
  refreshKnowledgeSource,
  CreateKnowledgeSourceDto,
} from "../api/knowledge-api";

export function useKnowledgeSources(params: {
  workspaceId: string;
  spaceId?: string;
}) {
  return useQuery({
    queryKey: ["knowledge-sources", params.workspaceId, params.spaceId],
    queryFn: () => getKnowledgeSources(params),
    enabled: !!params.workspaceId,
  });
}

export function useCreateKnowledgeSource() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateKnowledgeSourceDto) => createKnowledgeSource(data),
    onSuccess: (_, variables) => {
      notifications.show({
        title: t("Knowledge source added"),
        message: t("The source is being processed"),
        color: "green",
      });
      queryClient.invalidateQueries({
        queryKey: ["knowledge-sources", variables.workspaceId, variables.spaceId],
      });
    },
    onError: (error: any) => {
      notifications.show({
        title: t("Failed to add knowledge source"),
        message: error.message || t("An error occurred"),
        color: "red",
      });
    },
  });
}

export function useDeleteKnowledgeSource() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sourceId: string) => deleteKnowledgeSource(sourceId),
    onSuccess: () => {
      notifications.show({
        title: t("Knowledge source deleted"),
        message: t("The source has been removed"),
        color: "green",
      });
      queryClient.invalidateQueries({ queryKey: ["knowledge-sources"] });
    },
    onError: (error: any) => {
      notifications.show({
        title: t("Failed to delete knowledge source"),
        message: error.message || t("An error occurred"),
        color: "red",
      });
    },
  });
}

export function useRefreshKnowledgeSource() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sourceId: string) => refreshKnowledgeSource(sourceId),
    onSuccess: () => {
      notifications.show({
        title: t("Refresh started"),
        message: t("The source is being re-processed"),
        color: "blue",
      });
      queryClient.invalidateQueries({ queryKey: ["knowledge-sources"] });
    },
    onError: (error: any) => {
      notifications.show({
        title: t("Failed to refresh knowledge source"),
        message: error.message || t("An error occurred"),
        color: "red",
      });
    },
  });
}
