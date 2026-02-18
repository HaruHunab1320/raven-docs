import { Card, Stack, Text, Group, Loader, ScrollArea } from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

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
}

const NODE_STYLES: Record<string, string> = {
  hypothesis: "fill:#e8d5f5,stroke:#9b59b6,color:#333",
  experiment: "fill:#d4edfc,stroke:#3498db,color:#333",
  paper: "fill:#fdebd0,stroke:#e67e22,color:#333",
  journal: "fill:#d1f2eb,stroke:#1abc9c,color:#333",
};

function buildMermaidGraph(nodes: GraphNode[], edges: GraphEdge[]): string {
  if (nodes.length === 0) return "";

  const lines: string[] = ["graph TD"];

  // Define nodes
  for (const node of nodes) {
    const label = (node.title || "Untitled").replace(/"/g, "'").slice(0, 40);
    const shortId = node.id.slice(0, 8);
    lines.push(`  ${shortId}["${label}"]`);
  }

  // Define edges
  const nodeIdSet = new Set(nodes.map((n) => n.id.slice(0, 8)));
  for (const edge of edges) {
    const fromId = edge.from.slice(0, 8);
    const toId = edge.to.slice(0, 8);
    if (nodeIdSet.has(fromId) && nodeIdSet.has(toId)) {
      const label = edge.type.replace(/_/g, " ").toLowerCase();
      lines.push(`  ${fromId} -->|${label}| ${toId}`);
    }
  }

  // Add style classes
  for (const node of nodes) {
    const style = NODE_STYLES[node.pageType];
    if (style) {
      lines.push(`  style ${node.id.slice(0, 8)} ${style}`);
    }
  }

  return lines.join("\n");
}

export function DomainGraphVisualization({ nodes, edges, isLoading }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: "default",
      securityLevel: "loose",
    });
  }, []);

  useEffect(() => {
    if (!containerRef.current || isLoading) return;
    if (nodes.length === 0) return;

    const graphDef = buildMermaidGraph(nodes, edges);
    if (!graphDef) return;

    const id = `graph-${Date.now()}`;
    mermaid
      .render(id, graphDef)
      .then(({ svg }) => {
        if (containerRef.current) {
          containerRef.current.innerHTML = svg;
          setError(null);
        }
      })
      .catch((err) => {
        setError("Failed to render graph");
        console.error("Mermaid render error:", err);
      });
  }, [nodes, edges, isLoading]);

  return (
    <Card withBorder radius="md" p="md">
      <Stack gap="sm">
        <Group justify="space-between">
          <Text fw={600}>Domain Graph</Text>
          <Group gap="xs">
            {Object.entries(NODE_STYLES).map(([type]) => (
              <Text key={type} size="xs" c="dimmed">
                {type}
              </Text>
            ))}
          </Group>
        </Group>

        {isLoading ? (
          <Group justify="center" py="xl">
            <Loader size="sm" />
          </Group>
        ) : nodes.length === 0 ? (
          <Text size="sm" c="dimmed">
            No graph data available. Create typed pages (hypotheses, experiments)
            to populate the graph.
          </Text>
        ) : error ? (
          <Text size="sm" c="red">{error}</Text>
        ) : (
          <ScrollArea>
            <div ref={containerRef} style={{ minHeight: 200 }} />
          </ScrollArea>
        )}
      </Stack>
    </Card>
  );
}
