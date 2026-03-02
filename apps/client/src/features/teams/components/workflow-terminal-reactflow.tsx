import { createContext, memo, useContext, useEffect, useMemo, useRef } from "react";
import {
  ActionIcon,
  Badge,
  Group,
  Paper,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconPlayerStop } from "@tabler/icons-react";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { TeamAgent, OrgPattern } from "../types/team.types";
import type { AgentActivity } from "../hooks/use-agent-activity";
import type { TerminalSession } from "@/features/terminal/services/terminal-service";
import { WebTerminal } from "@/features/terminal";

/**
 * Context for frequently-changing data (activity, sessions, callbacks).
 *
 * Keeping this OFF the ReactFlow `nodes` array is critical: when nodes
 * get a new object reference ReactFlow may steal keyboard focus from
 * embedded xterm terminals.  By reading volatile data from context the
 * nodes array only changes when the *structure* of the graph changes
 * (agents added/removed), not on every WebSocket activity ping.
 */
const AgentLiveDataContext = createContext<{
  agentActivity: Record<string, AgentActivity>;
  terminalSessionByAgentId: Map<string, TerminalSession>;
  onTerminateSession?: (sessionId: string) => void;
}>({
  agentActivity: {},
  terminalSessionByAgentId: new Map(),
});

type AgentTerminalNodeData = {
  agent: TeamAgent;
};

function activityTone(activity?: AgentActivity): {
  border: string;
  badge: string;
  label: string;
} {
  switch (activity?.type) {
    case "tool_running":
      return { border: "blue", badge: "blue", label: `Using ${activity.detail || "tool"}` };
    case "running":
      return { border: "green", badge: "green", label: "Running" };
    case "blocked":
      return { border: "yellow", badge: "yellow", label: "Waiting for input" };
    case "stalled":
      return { border: "orange", badge: "orange", label: activity.detail || "Stalled" };
    case "login_required":
      return { border: "red", badge: "red", label: "Login required" };
    default:
      return { border: "gray", badge: "gray", label: "Idle" };
  }
}

/**
 * ReactFlow node for a single agent with an embedded xterm.js terminal.
 *
 * Reads volatile data (activity, session) from context so the parent
 * nodes array stays stable and ReactFlow doesn't steal focus on updates.
 */
const AgentTerminalNode = memo(function AgentTerminalNode({
  data,
}: NodeProps<Node<AgentTerminalNodeData>>) {
  const { agentActivity, terminalSessionByAgentId, onTerminateSession } =
    useContext(AgentLiveDataContext);

  const activity = agentActivity[data.agent.id];
  const session = terminalSessionByAgentId.get(data.agent.id);
  const tone = activityTone(activity);

  return (
    <>
      <Handle type="target" position={Position.Top} />
      <Paper
        withBorder
        radius="md"
        p="xs"
        shadow="xs"
        style={{
          width: 520,
          borderColor: `var(--mantine-color-${tone.border}-6)`,
          background: "var(--mantine-color-body)",
        }}
      >
        <Stack gap={8}>
          <Group justify="space-between" wrap="nowrap">
            <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}>
              <Text size="sm" fw={600} truncate>
                {data.agent.role}
              </Text>
              <Badge size="xs" variant="light" color={tone.badge}>
                {tone.label}
              </Badge>
            </Group>
            {session && onTerminateSession && (
              <Tooltip label="Stop session" withArrow>
                <ActionIcon
                  size="xs"
                  variant="subtle"
                  color="red"
                  onClick={() => onTerminateSession(session.id)}
                >
                  <IconPlayerStop size={12} />
                </ActionIcon>
              </Tooltip>
            )}
          </Group>

          {session ? (
            <div
              className="nodrag nowheel nopan"
              onKeyDown={(e) => e.stopPropagation()}
              onKeyUp={(e) => e.stopPropagation()}
            >
              <WebTerminal
                sessionId={session.id}
                height={280}
                compact
              />
            </div>
          ) : (
            <Paper withBorder radius="sm" p="md" bg="gray.0">
              <Text size="xs" c="dimmed">
                No active terminal session for this agent.
              </Text>
            </Paper>
          )}
        </Stack>
      </Paper>
      <Handle type="source" position={Position.Bottom} />
    </>
  );
});

function buildAgentHierarchy(
  agents: TeamAgent[],
  orgPattern?: OrgPattern | null,
): Map<string, string | undefined> {
  const parents = new Map<string, string | undefined>();
  const agentById = new Map(agents.map((a) => [a.id, a]));

  for (const agent of agents) {
    if (agent.reportsToAgentId && agentById.has(agent.reportsToAgentId)) {
      parents.set(agent.id, agent.reportsToAgentId);
      continue;
    }
    parents.set(agent.id, undefined);
  }

  if (!orgPattern?.structure?.roles) return parents;

  const roleToAgents = new Map<string, TeamAgent[]>();
  for (const agent of agents) {
    const existing = roleToAgents.get(agent.role) || [];
    existing.push(agent);
    roleToAgents.set(agent.role, existing);
  }

  for (const roleAgents of roleToAgents.values()) {
    roleAgents.sort((a, b) => a.instanceNumber - b.instanceNumber);
  }

  for (const agent of agents) {
    if (parents.get(agent.id)) continue;
    const roleDef = orgPattern.structure.roles[agent.role];
    const parentRole = roleDef?.reportsTo;
    if (!parentRole) continue;
    const parentAgent = roleToAgents.get(parentRole)?.[0];
    if (parentAgent) {
      parents.set(agent.id, parentAgent.id);
    }
  }

  return parents;
}

function deriveLevels(
  agents: TeamAgent[],
  parentById: Map<string, string | undefined>,
): Map<string, number> {
  const levelById = new Map<string, number>();

  const getLevel = (agentId: string, trail = new Set<string>()): number => {
    const cached = levelById.get(agentId);
    if (typeof cached === "number") return cached;

    if (trail.has(agentId)) {
      levelById.set(agentId, 0);
      return 0;
    }

    trail.add(agentId);
    const parent = parentById.get(agentId);
    const level = parent ? getLevel(parent, trail) + 1 : 0;
    trail.delete(agentId);
    levelById.set(agentId, level);
    return level;
  };

  for (const agent of agents) {
    getLevel(agent.id);
  }

  return levelById;
}

// Registered once — React.memo prevents ReactFlow from remounting nodes.
const nodeTypes = { agentTerminal: AgentTerminalNode };

interface Props {
  agents: TeamAgent[];
  orgPattern?: OrgPattern | null;
  agentActivity: Record<string, AgentActivity>;
  terminalSessionByAgentId: Map<string, TerminalSession>;
  onTerminateSession?: (sessionId: string) => void;
  height?: number;
}

export function WorkflowTerminalReactFlow({
  agents,
  orgPattern,
  agentActivity,
  terminalSessionByAgentId,
  onTerminateSession,
  height = 720,
}: Props) {
  // Nodes only rebuild when agents or orgPattern change (structural).
  // Volatile data (activity, sessions) flows through AgentLiveDataContext.
  const { nodes, edges } = useMemo(() => {
    const sortedAgents = [...agents].sort((a, b) =>
      a.role === b.role
        ? a.instanceNumber - b.instanceNumber
        : a.role.localeCompare(b.role),
    );
    const parentById = buildAgentHierarchy(sortedAgents, orgPattern);
    const levelById = deriveLevels(sortedAgents, parentById);

    const laneMap = new Map<number, TeamAgent[]>();
    for (const agent of sortedAgents) {
      const level = levelById.get(agent.id) || 0;
      const lane = laneMap.get(level) || [];
      lane.push(agent);
      laneMap.set(level, lane);
    }

    const builtNodes: Node<AgentTerminalNodeData>[] = [];
    const builtEdges: Edge[] = [];
    const nodeWidth = 560;
    const horizontalGap = 32;
    const verticalGap = 420;

    // First pass: compute positions and track total extent
    const positions: { agent: TeamAgent; x: number; y: number }[] = [];
    let maxX = 0;
    let maxY = 0;

    for (const [level, lane] of laneMap.entries()) {
      lane.forEach((agent, index) => {
        const x = index * (nodeWidth + horizontalGap);
        const y = level * verticalGap;
        positions.push({ agent, x, y });
        maxX = Math.max(maxX, x + nodeWidth);
        maxY = Math.max(maxY, y + verticalGap);
      });
    }

    // Center positions around (0,0) so the default viewport shows the graph
    const offsetX = maxX / 2;
    const offsetY = maxY / 2;

    for (const { agent, x, y } of positions) {
      builtNodes.push({
        id: agent.id,
        type: "agentTerminal",
        position: {
          x: x - offsetX,
          y: y - offsetY,
        },
        data: { agent },
        draggable: false,
      });
    }

    for (const agent of sortedAgents) {
      const parentId = parentById.get(agent.id);
      if (!parentId) continue;
      builtEdges.push({
        id: `${agent.id}->${parentId}`,
        source: agent.id,
        target: parentId,
        markerEnd: { type: MarkerType.ArrowClosed },
        label: "reports",
        style: {
          stroke: "var(--mantine-color-gray-6)",
          strokeWidth: 1.5,
        },
      });
    }

    return { nodes: builtNodes, edges: builtEdges };
  }, [agents, orgPattern]);

  // Stable context value — only create a new object when the underlying
  // data actually changes (the identities of agentActivity / sessions /
  // callback already reflect real changes from the parent).
  const liveData = useMemo(
    () => ({ agentActivity, terminalSessionByAgentId, onTerminateSession }),
    [agentActivity, terminalSessionByAgentId, onTerminateSession],
  );

  if (!agents.length) {
    return (
      <Text size="sm" c="dimmed">
        No agents are currently provisioned for this deployment.
      </Text>
    );
  }

  return (
    <AgentLiveDataContext.Provider value={liveData}>
      <ReactFlowProvider>
        <WorkflowTerminalReactFlowInner
          nodes={nodes}
          edges={edges}
          height={height}
        />
      </ReactFlowProvider>
    </AgentLiveDataContext.Provider>
  );
}

/**
 * Inner component that lives inside ReactFlowProvider so it can use
 * useReactFlow / useNodesInitialized hooks.
 *
 * ReactFlow v12 measures node dimensions asynchronously after mount.
 * Calling fitView before nodes are measured produces a wrong viewport.
 * useNodesInitialized tells us when all nodes have their dimensions,
 * at which point we can safely fitView.
 */
function WorkflowTerminalReactFlowInner({
  nodes,
  edges,
  height,
}: {
  nodes: Node<AgentTerminalNodeData>[];
  edges: Edge[];
  height: number;
}) {
  const { fitView } = useReactFlow();
  const nodesInitialized = useNodesInitialized();
  const hasFitted = useRef(false);

  // fitView once after all nodes have been measured.
  useEffect(() => {
    if (nodesInitialized && !hasFitted.current) {
      hasFitted.current = true;
      fitView({ padding: 0.08, duration: 200 });
    }
  }, [nodesInitialized, fitView]);

  // Re-center whenever node count changes (agents spawn/despawn).
  const prevNodeCount = useRef(nodes.length);
  useEffect(() => {
    if (prevNodeCount.current !== nodes.length) {
      prevNodeCount.current = nodes.length;
      // Reset so fitView fires again after the new nodes are measured.
      hasFitted.current = false;
    }
  }, [nodes.length]);

  return (
    <div style={{ height, width: "100%", position: "relative" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        nodesFocusable={false}
        edgesFocusable={false}
        minZoom={0.3}
        maxZoom={1}
        zoomOnScroll={false}
        panOnScroll
        preventScrolling={false}
        proOptions={{ hideAttribution: true }}
      >
        <MiniMap zoomable pannable />
        <Controls showInteractive={false} showZoom={false} />
        <Background gap={20} />
      </ReactFlow>
    </div>
  );
}
