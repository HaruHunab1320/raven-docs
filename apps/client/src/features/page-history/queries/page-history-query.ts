import { useQuery } from "@tanstack/react-query";
import {
  getPageHistoryById,
  getPageHistoryList,
} from "@/features/page-history/services/page-history-service";
import { IPageHistory } from "@/features/page-history/types/page.types";

export function usePageHistoryListQuery(pageId: string) {
  return useQuery({
    queryKey: ["page-history-list", pageId],
    queryFn: async (): Promise<IPageHistory[]> => getPageHistoryList(pageId),
    enabled: !!pageId,
    gcTime: 0,
  });
}

export function usePageHistoryQuery(historyId: string) {
  return useQuery({
    queryKey: ["page-history", historyId],
    queryFn: async (): Promise<IPageHistory> => getPageHistoryById(historyId),
    enabled: !!historyId,
    staleTime: 10 * 60 * 1000,
  });
}
