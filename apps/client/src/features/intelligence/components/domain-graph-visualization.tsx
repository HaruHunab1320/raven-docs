import { Card, Stack, Text, Group, Loader, Badge, Paper } from "@mantine/core";
import { useCallback, useMemo, useState } from "react";
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import "@xyflow/react/dist/style.css";
import {
  IconBulb,
  IconFlask,
  IconFileText,
  IconBook,
} from "@tabler/icons-react";
import { PagePreviewDrawer } from "./page-preview-drawer";

interface GraphNode {
  id: string;
  pageType: string;
  title: string;
}

interface GraphEdge {
  from: string;
  to: string;
  type: string;
}

interface Props {
  nodes: GraphNode[];
  edges: GraphEdge[];
  isLoading?: boolean;
  spaceId?: string;
}

const NODE_CONFIG: Record<
  string,
  { color: string; bg: string; border: string; icon: React.ReactNode }
> = {
  hypothesis: {
    color: "violet",
    bg: "var(--mantine-color-violet-0)",
    border: "var(--mantine-color-violet-4)",
    icon: <IconBulb size={14} />,
  },
  experiment: {
    color: "blue",
    bg: "var(--mantine-color-blue-0)",
    border: "var(--mantine-color-blue-4)",
    icon: <IconFlask size={14} />,
  },
  paper: {
    color: "orange",
    bg: "var(--mantine-color-orange-0)",
    border: "var(--mantine-color-orange-4)",
    icon: <IconFileText size={14} />,
  },
  journal: {
    color: "teal",
    bg: "var(--mantine-color-teal-0)",
    border: "var(--mantine-color-teal-4)",
    icon: <IconBook size={14} />,
  },
};

const EDGE_STYLES: Record<string, { stroke: string; strokeDasharray?: string; label: string }> = {
  CONTRADICTS: {
    stroke: "var(--mantine-color-red-5)",
    strokeDasharray: "5 5",
    label: "contradicts",
  },
  VALIDATES: {
    stroke: "var(--mantine-color-green-5)",
    label: "validates",
  },
  TESTS_HYPOTHESIS: {
    stroke: "var(--mantine-color-blue-5)",
    label: "tests",
  },
};

const DEFAULT_NODE_WIDTH = 200;
const DEFAULT_NODE_HEIGHT = 60;

function DomainNode({ data }: NodeProps) {
  const nodeData = data as { label: string; pageType: string; status?: string };
  const config = NODE_CONFIG[nodeData.pageType] || NODE_CONFIG.paper;

  return (
    <Paper
      shadow="xs"
      p="xs"
      radius="sm"
      style={{
        background: config.bg,
        border: `1.5px solid ${config.border}`,
        minWidth: 160,
        maxWidth: 220,
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Group gap={6} wrap="nowrap">
        {config.icon}
        <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
          <Text size="xs" fw={500} lineClamp={2}>
            {nodeData.label}
          </Text>
          <Group gap={4}>
            <Badge size="xs" variant="light" color={config.color}>
              {nodeData.pageType}
            </Badge>
            {nodeData.status && (
              <Badge size="xs" variant="outline">
                {nodeData.status}
              </Badge>
            )}
          </Group>
        </Stack>
      </Group>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </Paper>
  );
}

const nodeTypes = { domainNode: DomainNode };

function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 60, ranksep: 80 });

  for (const node of nodes) {
    g.setNode(node.id, {
      width: DEFAULT_NODE_WIDTH,
      height: DEFAULT_NODE_HEIGHT,
    });
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const layoutedNodes = nodes.map((node) => {
    const dagreNode = g.node(node.id);
    return {
      ...node,
      position: {
        x: dagreNode.x - DEFAULT_NODE_WIDTH / 2,
        y: dagreNode.y - DEFAULT_NODE_HEIGHT / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}

export function DomainGraphVisualization({
  nodes: graphNodes,
  edges: graphEdges,
  isLoading,
  spaceId,
}: Props) {
  const [previewPageId, setPreviewPageId] = useState<string | null>(null);

  const layouted = useMemo((): { nodes: Node[]; edges: Edge[] } => {
    if (graphNodes.length === 0) return { nodes: [], edges: [] };

    const nodeIdSet = new Set(graphNodes.map((n) => n.id));

    const rfNodes: Node[] = graphNodes.map((node) => ({
      id: node.id,
      type: "domainNode",
      position: { x: 0, y: 0 },
      data: {
        label: node.title || "Untitled",
        pageType: node.pageType,
      },
    }));

    const rfEdges: Edge[] = graphEdges
      .filter((e) => nodeIdSet.has(e.from) && nodeIdSet.has(e.to))
      .map((edge, i) => {
        const style = EDGE_STYLES[edge.type] || {
          stroke: "var(--mantine-color-gray-5)",
          label: edge.type.replace(/_/g, " ").toLowerCase(),
        };
        return {
          id: `edge-${i}`,
          source: edge.from,
          target: edge.to,
          label: style.label,
          style: {
            stroke: style.stroke,
            strokeDasharray: style.strokeDasharray,
            strokeWidth: 2,
          },
          labelStyle: { fontSize: 10, fill: style.stroke },
        };
      });

    return getLayoutedElements(rfNodes, rfEdges);
  }, [graphNodes, graphEdges]);

  const [nodes, , onNodesChange] = useNodesState(layouted.nodes);
  const [edges, , onEdgesChange] = useEdgesState(layouted.edges);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setPreviewPageId(node.id);
    },
    [],
  );

  return (
    <>
      <Card withBorder radius="md" p="md">
        <Stack gap="sm">
          <Group justify="space-between">
            <Text fw={600}>Domain Graph</Text>
            <Group gap="xs">
              {Object.entries(NODE_CONFIG).map(([type, config]) => (
                <Badge key={type} size="xs" variant="light" color={config.color}>
                  {type}
                </Badge>
              ))}
            </Group>
          </Group>

          {isLoading ? (
            <Group justify="center" py="xl">
              <Loader size="sm" />
            </Group>
          ) : graphNodes.length === 0 ? (
            <Text size="sm" c="dimmed">
              No graph data available. Create typed pages (hypotheses,
              experiments) to populate the graph.
            </Text>
          ) : (
            <div style={{ height: 500, width: "100%" }}>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeClick={onNodeClick}
                nodeTypes={nodeTypes}
                fitView
                minZoom={0.2}
                maxZoom={2}
                proOptions={{ hideAttribution: true }}
              >
                <Controls />
                <MiniMap
                  nodeColor={(node) => {
                    const pageType = (node.data as { pageType?: string })?.pageType || "";
                    const config = NODE_CONFIG[pageType];
                    return config?.border || "var(--mantine-color-gray-4)";
                  }}
                  maskColor="rgba(0,0,0,0.1)"
                />
                <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
              </ReactFlow>
            </div>
          )}
        </Stack>
      </Card>

      {spaceId && (
        <PagePreviewDrawer
          pageId={previewPageId}
          spaceId={spaceId}
          opened={previewPageId !== null}
          onClose={() => setPreviewPageId(null)}
        />
      )}
    </>
  );
}
