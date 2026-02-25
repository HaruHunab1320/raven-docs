import { ScrollArea, Group, Loader, Text } from "@mantine/core";
import { useEffect, useState } from "react";
import mermaid from "mermaid";
import type { OrgPattern } from "../types/team.types";

interface Props {
  orgPattern: OrgPattern | null;
  compact?: boolean;
}

function toNodeId(roleId: string): string {
  // Mermaid node IDs must be alphanumeric/underscore; normalize anything else.
  return `r_${roleId.replace(/[^a-zA-Z0-9_]/g, "_")}`;
}

function buildOrgChart(pattern: OrgPattern): string {
  const roles = pattern.structure?.roles;
  if (!roles || Object.keys(roles).length === 0) return "";

  const lines: string[] = ["graph TD"];
  const nodeIds = new Map<string, string>();

  for (const roleId of Object.keys(roles)) {
    nodeIds.set(roleId, toNodeId(roleId));
  }

  for (const [roleId, role] of Object.entries(roles)) {
    const label = role.name || roleId;
    const count = role.minInstances || 1;
    const countLabel = count > 1 ? ` (x${count})` : "";
    const nodeId = nodeIds.get(roleId)!;
    const safeLabel = `${label}${countLabel}`.replace(/"/g, '\\"');
    lines.push(`  ${nodeId}["${safeLabel}"]`);
  }

  for (const [roleId, role] of Object.entries(roles)) {
    if (role.reportsTo && roles[role.reportsTo] && nodeIds.has(role.reportsTo)) {
      lines.push(`  ${nodeIds.get(role.reportsTo)} --> ${nodeIds.get(roleId)}`);
    }
  }

  // Style nodes
  for (const roleId of Object.keys(roles)) {
    const role = roles[roleId];
    const nodeId = nodeIds.get(roleId)!;
    if (role.singleton) {
      lines.push(
        `  style ${nodeId} fill:#e8d5f5,stroke:#9b59b6,color:#333`,
      );
    } else {
      lines.push(
        `  style ${nodeId} fill:#d4edfc,stroke:#3498db,color:#333`,
      );
    }
  }

  return lines.join("\n");
}

export function OrgChartMermaidPreview({ orgPattern, compact }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [svgMarkup, setSvgMarkup] = useState<string | null>(null);

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: "default",
      securityLevel: "loose",
    });
  }, []);

  useEffect(() => {
    if (!orgPattern) return;

    const graphDef = buildOrgChart(orgPattern);
    setSvgMarkup(null);
    if (!graphDef) {
      setError(null);
      return;
    }

    setRendering(true);
    const id = `org-chart-${Date.now()}`;
    mermaid
      .render(id, graphDef)
      .then(({ svg }) => {
        setSvgMarkup(svg);
        setError(null);
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

  if (!svgMarkup) {
    return (
      <Text size="sm" c="dimmed">
        Org chart unavailable for this deployment.
      </Text>
    );
  }

  return (
    <ScrollArea>
      <div
        style={{ minHeight: compact ? 80 : 200 }}
        dangerouslySetInnerHTML={{ __html: svgMarkup }}
      />
    </ScrollArea>
  );
}
