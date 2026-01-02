import { useQuery } from "@tanstack/react-query";
import { getWorkspaceUsers } from "../services/user-service";
import { IUser } from "../types/user.types";
import { IPagination } from "@/lib/types";

const USERS_QUERY_KEY = "workspace-users";

interface UseSearchUsersParams {
  query?: string;
  page?: number;
  limit?: number;
  enabled?: boolean;
}

export function useSearchUsers({
  query,
  page = 1,
  limit = 20,
  enabled = true,
}: UseSearchUsersParams = {}) {
  return useQuery<IPagination<IUser>>({
    queryKey: [USERS_QUERY_KEY, { query, page, limit }],
    queryFn: () => getWorkspaceUsers({ query, page, limit }),
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes - data stays fresh
    gcTime: 10 * 60 * 1000, // 10 minutes - keep in cache
    refetchOnWindowFocus: false, // Don't refetch when window regains focus
    refetchOnMount: false, // Don't refetch when component mounts if data exists
    refetchOnReconnect: false, // Don't refetch on network reconnection if data exists
    retry: 1, // Only retry once on failure
  });
}
