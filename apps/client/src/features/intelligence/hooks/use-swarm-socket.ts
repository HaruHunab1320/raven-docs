import { useEffect } from "react";
import { useAtomValue } from "jotai";
import { useQueryClient } from "@tanstack/react-query";
import { socketAtom } from "@/features/websocket/atoms/socket-atom";
import { SWARM_KEYS } from "./use-swarm-queries";
import { INTELLIGENCE_KEYS } from "./use-intelligence-queries";

export function useSwarmSocket(spaceId: string) {
  const socket = useAtomValue(socketAtom);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!socket || !spaceId) return;

    const handleStatusChanged = (data: {
      spaceId?: string;
      executionId: string;
      status: string;
    }) => {
      if (data.spaceId && data.spaceId !== spaceId) return;
      queryClient.invalidateQueries({
        queryKey: SWARM_KEYS.executions(spaceId),
      });
      queryClient.invalidateQueries({
        queryKey: SWARM_KEYS.status(data.executionId),
      });
    };

    const handleCompleted = (data: {
      spaceId?: string;
      executionId: string;
      experimentId?: string;
    }) => {
      if (data.spaceId && data.spaceId !== spaceId) return;
      queryClient.invalidateQueries({
        queryKey: SWARM_KEYS.executions(spaceId),
      });
      queryClient.invalidateQueries({
        queryKey: SWARM_KEYS.status(data.executionId),
      });
      // Refresh experiment data since metadata may have been updated
      queryClient.invalidateQueries({
        queryKey: INTELLIGENCE_KEYS.experiments(spaceId),
      });
    };

    socket.on("swarm:status_changed", handleStatusChanged);
    socket.on("swarm:completed", handleCompleted);

    return () => {
      socket.off("swarm:status_changed", handleStatusChanged);
      socket.off("swarm:completed", handleCompleted);
    };
  }, [socket, spaceId, queryClient]);
}
