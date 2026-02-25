import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as swarmService from "../services/swarm-service";
import { INTELLIGENCE_KEYS } from "./use-intelligence-queries";

export const SWARM_KEYS = {
  executions: (spaceId: string) => ["swarm-executions", spaceId] as const,
  status: (executionId: string) => ["swarm-status", executionId] as const,
};

export function useSwarmExecutions(spaceId: string) {
  return useQuery({
    queryKey: SWARM_KEYS.executions(spaceId),
    queryFn: () => swarmService.listSwarmExecutions({ spaceId, limit: 50 }),
    enabled: !!spaceId,
    staleTime: 15_000,
  });
}

export function useSwarmStatus(executionId: string | undefined) {
  return useQuery({
    queryKey: SWARM_KEYS.status(executionId!),
    queryFn: () => swarmService.getSwarmStatus(executionId!),
    enabled: !!executionId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (
        status === "completed" ||
        status === "failed" ||
        status === "cancelled"
      ) {
        return false;
      }
      return 5_000;
    },
  });
}

export function useExecuteSwarmMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: swarmService.ExecuteSwarmParams) =>
      swarmService.executeSwarm(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["swarm-executions"] });
    },
  });
}

export function useStopSwarmMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (executionId: string) =>
      swarmService.stopSwarmExecution(executionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["swarm-executions"] });
      queryClient.invalidateQueries({ queryKey: ["swarm-status"] });
    },
  });
}

export function useSwarmLogs(executionId: string | undefined, limit?: number) {
  return useQuery({
    queryKey: ["swarm-logs", executionId, limit],
    queryFn: () => swarmService.getSwarmLogs(executionId!, limit),
    enabled: !!executionId,
    staleTime: 10_000,
  });
}
