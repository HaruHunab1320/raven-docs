import { useWorkspaceQuery } from "../queries/workspace-query";
import { IWorkspace } from "../types/workspace.types";
import { UseQueryResult } from "@tanstack/react-query";

/**
 * Hook to get the current workspace
 */
export function useCurrentWorkspace(): UseQueryResult<IWorkspace, Error> {
  return useWorkspaceQuery();
}
