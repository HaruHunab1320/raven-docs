import { useEffect, useCallback, useRef } from "react";
import { useAtomValue } from "jotai";
import { atom, useAtom } from "jotai";
import { socketAtom } from "@/features/websocket/atoms/socket-atom";

export interface AgentActivity {
  type: "idle" | "running" | "tool_running" | "blocked" | "stalled" | "login_required";
  detail?: string;
  loginUrl?: string;
  timestamp: number;
}

/**
 * Global atom storing per-agent activity keyed by teamAgentId.
 * Shared across components so multiple renders see the same state.
 */
const agentActivityAtom = atom<Record<string, AgentActivity>>({});

/**
 * Listens to real-time WebSocket events and tracks what each agent is doing.
 * Returns a map of teamAgentId → AgentActivity.
 */
export function useAgentActivity(deploymentId?: string) {
  const socket = useAtomValue(socketAtom);
  const [activity, setActivity] = useAtom(agentActivityAtom);
  const deploymentIdRef = useRef(deploymentId);
  deploymentIdRef.current = deploymentId;

  const updateAgent = useCallback(
    (agentId: string, update: AgentActivity) => {
      setActivity((prev) => ({ ...prev, [agentId]: update }));
    },
    [setActivity],
  );

  useEffect(() => {
    if (!socket || !deploymentId) return;

    const handleToolRunning = (event: any) => {
      if (event?.deploymentId !== deploymentIdRef.current) return;
      const toolName =
        event.tool?.toolName || event.tool?.description || "tool";
      updateAgent(event.teamAgentId, {
        type: "tool_running",
        detail: toolName,
        timestamp: Date.now(),
      });
    };

    const handleBlocking = (event: any) => {
      if (event?.deploymentId !== deploymentIdRef.current) return;
      updateAgent(event.teamAgentId, {
        type: "blocked",
        detail: "Waiting for input",
        timestamp: Date.now(),
      });
    };

    const handleStall = (event: any) => {
      if (event?.deploymentId !== deploymentIdRef.current) return;
      const classification = event.classification?.type || "stalled";
      updateAgent(event.teamAgentId, {
        type: "stalled",
        detail: classification,
        timestamp: Date.now(),
      });
    };

    const handleLoginRequired = (event: any) => {
      if (event?.deploymentId !== deploymentIdRef.current) return;
      updateAgent(event.teamAgentId, {
        type: "login_required",
        detail: event.instructions || event.url || "Authentication required",
        loginUrl: event.loginUrl,
        timestamp: Date.now(),
      });
    };

    const handleLoopStarted = (event: any) => {
      if (event?.deploymentId !== deploymentIdRef.current) return;
      if (event.teamAgentId) {
        updateAgent(event.teamAgentId, {
          type: "running",
          timestamp: Date.now(),
        });
      }
    };

    const handleLoopCompleted = (event: any) => {
      if (event?.deploymentId !== deploymentIdRef.current) return;
      if (event.teamAgentId) {
        updateAgent(event.teamAgentId, {
          type: "idle",
          detail: event.summary,
          timestamp: Date.now(),
        });
      }
    };

    const handleLoopFailed = (event: any) => {
      if (event?.deploymentId !== deploymentIdRef.current) return;
      if (event.teamAgentId) {
        updateAgent(event.teamAgentId, {
          type: "idle",
          detail: event.error || "Failed",
          timestamp: Date.now(),
        });
      }
    };

    socket.on("team:agent_tool_running", handleToolRunning);
    socket.on("team:agent_tool_interrupted", handleToolRunning);
    socket.on("team:agent_blocking_prompt", handleBlocking);
    socket.on("team:agent_login_required", handleLoginRequired);
    socket.on("team:stall_classified", handleStall);
    socket.on("team:agent_loop_started", handleLoopStarted);
    socket.on("team:agent_loop_completed", handleLoopCompleted);
    socket.on("team:agent_loop_failed", handleLoopFailed);

    return () => {
      socket.off("team:agent_tool_running", handleToolRunning);
      socket.off("team:agent_tool_interrupted", handleToolRunning);
      socket.off("team:agent_blocking_prompt", handleBlocking);
      socket.off("team:agent_login_required", handleLoginRequired);
      socket.off("team:stall_classified", handleStall);
      socket.off("team:agent_loop_started", handleLoopStarted);
      socket.off("team:agent_loop_completed", handleLoopCompleted);
      socket.off("team:agent_loop_failed", handleLoopFailed);
    };
  }, [socket, deploymentId, updateAgent]);

  return activity;
}
