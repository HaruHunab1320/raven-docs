import { ScrollArea, Group, Loader, Text } from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";
import type { OrgPattern } from "../types/team.types";

interface Props {
  orgPattern: OrgPattern | null;
  compact?: boolean;
}

function buildOrgChart(pattern: OrgPattern): string {
  const roles = pattern.structure?.roles;
  if (!roles || Object.keys(roles).length === 0) return "";

  const lines: string[] = ["graph TD"];

  for (const [roleId, role] of Object.entries(roles)) {
    const label = role.name || roleId;
    const count = role.minInstances || 1;
    const countLabel = count > 1 ? ` (x${count})` : "";
    lines.push(`  ${roleId}["${label}${countLabel}"]`);
  }

  for (const [roleId, role] of Object.entries(roles)) {
    if (role.reportsTo && roles[role.reportsTo]) {
      lines.push(`  ${role.reportsTo} --> ${roleId}`);
    }
  }

  // Style nodes
  for (const roleId of Object.keys(roles)) {
    const role = roles[roleId];
    if (role.singleton) {
      lines.push(
        `  style ${roleId} fill:#e8d5f5,stroke:#9b59b6,color:#333`,
      );
    } else {
      lines.push(
        `  style ${roleId} fill:#d4edfc,stroke:#3498db,color:#333`,
      );
    }
  }

  return lines.join("\n");
}

export function OrgChartMermaidPreview({ orgPattern, compact }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: "default",
      securityLevel: "loose",
    });
  }, []);

  useEffect(() => {
    if (!containerRef.current || !orgPattern) return;

    const graphDef = buildOrgChart(orgPattern);
    if (!graphDef) return;

    setRendering(true);
    const id = `org-chart-${Date.now()}`;
    mermaid
      .render(id, graphDef)
      .then(({ svg }) => {
        if (containerRef.current) {
          containerRef.current.innerHTML = svg;
          setError(null);
        }
      })
      .catch((err) => {
        setError("Failed to render org chart");
        console.error("Mermaid render error:", err);
      })
      .finally(() => setRendering(false));
  }, [orgPattern]);

  if (!orgPattern) {
    return (
      <Text size="sm" c="dimmed">
        No org pattern available
      </Text>
    );
  }

  if (rendering) {
    return (
      <Group justify="center" py={compact ? "xs" : "md"}>
        <Loader size="sm" />
      </Group>
    );
  }

  if (error) {
    return (
      <Text size="sm" c="red">
        {error}
      </Text>
    );
  }

  return (
    <ScrollArea>
      <div
        ref={containerRef}
        style={{ minHeight: compact ? 80 : 200 }}
      />
    </ScrollArea>
  );
}
