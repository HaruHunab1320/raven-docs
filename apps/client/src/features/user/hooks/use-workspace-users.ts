import { useQuery } from "@tanstack/react-query";
import { getWorkspaceUsers } from "../services/user-service";
import { IUser } from "../types/user.types";
import { IPagination } from "@/lib/types";

const WORKSPACE_USERS_QUERY_KEY = "workspace-users";

interface UseWorkspaceUsersParams {
  workspaceId: string;
  page?: number;
  limit?: number;
  query?: string;
  enabled?: boolean;
}

export function useWorkspaceUsers({
  workspaceId,
  page = 1,
  limit = 100,
  query = "",
  enabled = true,
}: UseWorkspaceUsersParams) {
  return useQuery<IPagination<IUser>>({
    queryKey: [WORKSPACE_USERS_QUERY_KEY, workspaceId, { page, limit, query }],
    queryFn: () => getWorkspaceUsers({ page, limit, query, workspaceId }),
    enabled: Boolean(workspaceId) && enabled,
  });
}
