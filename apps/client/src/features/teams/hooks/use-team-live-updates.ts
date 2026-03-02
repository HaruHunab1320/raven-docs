import { useEffect } from "react";
import { useAtomValue } from "jotai";
import { useQueryClient } from "@tanstack/react-query";
import { socketAtom } from "@/features/websocket/atoms/socket-atom";
import { mcpSocketAtom } from "@/features/websocket/atoms/mcp-socket-atom";
import { TEAM_KEYS } from "./use-team-queries";
import { INTELLIGENCE_KEYS } from "@/features/intelligence/hooks/use-intelligence-queries";

export function useTeamLiveUpdates(spaceId: string, deploymentId?: string) {
  const socket = useAtomValue(socketAtom);
  const mcpSocket = useAtomValue(mcpSocketAtom);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!spaceId) return;

    const refreshTeamViews = () => {
      queryClient.invalidateQueries({
        queryKey: TEAM_KEYS.spaceDeployments(spaceId),
      });
      if (deploymentId) {
        queryClient.invalidateQueries({
          queryKey: TEAM_KEYS.deploymentStatus(deploymentId),
        });
      } else {
        queryClient.invalidateQueries({
          queryKey: ["team-deployment-status"],
        });
      }
    };

    const refreshIntelligenceViews = () => {
      queryClient.invalidateQueries({
        queryKey: INTELLIGENCE_KEYS.experiments(spaceId),
      });
      queryClient.invalidateQueries({
        queryKey: INTELLIGENCE_KEYS.hypotheses(spaceId),
      });
      queryClient.invalidateQueries({
        queryKey: INTELLIGENCE_KEYS.timeline(spaceId),
      });
      queryClient.invalidateQueries({
        queryKey: INTELLIGENCE_KEYS.stats(spaceId),
      });
    };

    const handleMcpEvent = (event: any) => {
      if (!event) return;
      if (event.spaceId && event.spaceId !== spaceId) return;

      // Team activity affects both team runtime and intelligence context.
      if (
        event.resource === "task" ||
        event.resource === "page" ||
        event.data?.channel === "team_runtime"
      ) {
        refreshTeamViews();
        refreshIntelligenceViews();
      }
    };

    const handleSwarmStatusChanged = (event: { spaceId?: string }) => {
      if (event?.spaceId && event.spaceId !== spaceId) return;
      refreshTeamViews();
      refreshIntelligenceViews();
    };

    const handleSwarmCompleted = (event: { spaceId?: string }) => {
      if (event?.spaceId && event.spaceId !== spaceId) return;
      refreshTeamViews();
      refreshIntelligenceViews();
    };
    const handleTeamRuntimeEvent = (event: { spaceId?: string }) => {
      if (event?.spaceId && event.spaceId !== spaceId) return;
      refreshTeamViews();
      refreshIntelligenceViews();
    };

    mcpSocket?.on("mcp:event", handleMcpEvent);
    socket?.on("swarm:status_changed", handleSwarmStatusChanged);
    socket?.on("swarm:completed", handleSwarmCompleted);
    socket?.on("team:agent_loop_started", handleTeamRuntimeEvent);
    socket?.on("team:agent_loop_completed", handleTeamRuntimeEvent);
    socket?.on("team:agent_loop_failed", handleTeamRuntimeEvent);
    socket?.on("team:workflow_updated", handleTeamRuntimeEvent);
    socket?.on("team:workflow_completed", handleTeamRuntimeEvent);
    socket?.on("team:workflow_failed", handleTeamRuntimeEvent);
    socket?.on("team:agent_blocking_prompt", handleTeamRuntimeEvent);
    socket?.on("team:agent_login_required", handleTeamRuntimeEvent);
    socket?.on("team:stall_classified", handleTeamRuntimeEvent);
    socket?.on("team:agent_tool_running", handleTeamRuntimeEvent);
    socket?.on("team:agent_tool_interrupted", handleTeamRuntimeEvent);
    socket?.on("team:escalation_surfaced", handleTeamRuntimeEvent);

    return () => {
      mcpSocket?.off("mcp:event", handleMcpEvent);
      socket?.off("swarm:status_changed", handleSwarmStatusChanged);
      socket?.off("swarm:completed", handleSwarmCompleted);
      socket?.off("team:agent_loop_started", handleTeamRuntimeEvent);
      socket?.off("team:agent_loop_completed", handleTeamRuntimeEvent);
      socket?.off("team:agent_loop_failed", handleTeamRuntimeEvent);
      socket?.off("team:workflow_updated", handleTeamRuntimeEvent);
      socket?.off("team:workflow_completed", handleTeamRuntimeEvent);
      socket?.off("team:workflow_failed", handleTeamRuntimeEvent);
      socket?.off("team:agent_blocking_prompt", handleTeamRuntimeEvent);
      socket?.off("team:agent_login_required", handleTeamRuntimeEvent);
      socket?.off("team:stall_classified", handleTeamRuntimeEvent);
      socket?.off("team:agent_tool_running", handleTeamRuntimeEvent);
      socket?.off("team:agent_tool_interrupted", handleTeamRuntimeEvent);
      socket?.off("team:escalation_surfaced", handleTeamRuntimeEvent);
    };
  }, [socket, mcpSocket, spaceId, deploymentId, queryClient]);
}
