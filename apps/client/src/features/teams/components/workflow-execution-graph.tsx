import { ScrollArea, Stack, Text } from "@mantine/core";
import { useEffect, useState } from "react";
import mermaid from "mermaid";
import type { WorkflowState, OrgPattern } from "../types/team.types";

interface Props {
  executionPlan: unknown;
  workflowState: WorkflowState | null;
  orgPattern?: OrgPattern | null;
  compact?: boolean;
}

type PlanStep = {
  stepId?: string;
  type?: string;
  operation?: Record<string, any>;
  children?: PlanStep[];
  thenBranch?: PlanStep;
  elseBranch?: PlanStep;
};

function parseExecutionPlan(value: unknown): Record<string, any> | null {
  if (!value) return null;
  try {
    return typeof value === "string"
      ? (JSON.parse(value) as Record<string, any>)
      : (value as Record<string, any>);
  } catch {
    return null;
  }
}

function getStepLabel(step: PlanStep): string {
  const kind = step?.operation?.kind;
  switch (kind) {
    case "dispatch_agent_loop":
      return `assign ${step?.operation?.role || "agent"}`;
    case "invoke_coordinator":
      return "coordinator";
    case "aggregate_results":
      return `aggregate ${step?.operation?.method || ""}`.trim();
    case "await_event":
      return "wait event";
    case "evaluate_condition":
      return "condition";
    default:
      return step?.type || "step";
  }
}

function nodeId(stepId: string): string {
  return `s_${stepId.replace(/[^a-zA-Z0-9_]/g, "_")}`;
}

function collectNodesAndEdges(
  steps: PlanStep[],
  nodes: Array<{ stepId: string; label: string; role?: string }>,
  edges: string[],
  parentStepId?: string,
) {
  const ids = steps.map((s) => s.stepId).filter(Boolean) as string[];

  for (let i = 0; i < ids.length - 1; i++) {
    edges.push(`${nodeId(ids[i])} --> ${nodeId(ids[i + 1])}`);
  }

  for (const step of steps) {
    if (!step.stepId) continue;

    const role =
      step.operation?.kind === "dispatch_agent_loop"
        ? step.operation?.role
        : step.operation?.kind === "invoke_coordinator"
          ? "__coordinator__"
          : undefined;

    nodes.push({ stepId: step.stepId, label: getStepLabel(step), role });

    if (parentStepId) {
      edges.push(`${nodeId(parentStepId)} -.-> ${nodeId(step.stepId)}`);
    }

    if (Array.isArray(step.children) && step.children.length > 0) {
      collectNodesAndEdges(step.children, nodes, edges, step.stepId);
    }
    if (step.thenBranch?.stepId) {
      edges.push(
        `${nodeId(step.stepId)} --> ${nodeId(step.thenBranch.stepId)}`,
      );
      collectNodesAndEdges([step.thenBranch], nodes, edges);
    }
    if (step.elseBranch?.stepId) {
      edges.push(
        `${nodeId(step.stepId)} --> ${nodeId(step.elseBranch.stepId)}`,
      );
      collectNodesAndEdges([step.elseBranch], nodes, edges);
    }
  }
}

/**
 * Build reporting-chain edges from the org pattern. Maps each role's
 * `reportsTo` to the corresponding workflow step nodes so the graph
 * shows both execution flow (solid arrows) and org hierarchy (dotted).
 */
function collectReportingEdges(
  orgPattern: OrgPattern,
  nodes: Array<{ stepId: string; role?: string }>,
): string[] {
  const roles = orgPattern.structure?.roles;
  if (!roles) return [];

  // Find the coordinator role id (the one with no reportsTo)
  const coordinatorRoleId = Object.keys(roles).find(
    (id) => !roles[id].reportsTo,
  );

  // Map org-chart role id → first matching step node id
  const roleToNodeId = new Map<string, string>();
  for (const n of nodes) {
    if (!n.role) continue;
    const orgRole =
      n.role === "__coordinator__" ? coordinatorRoleId : n.role;
    if (orgRole && !roleToNodeId.has(orgRole)) {
      roleToNodeId.set(orgRole, nodeId(n.stepId));
    }
  }

  const edges: string[] = [];
  for (const [roleId, role] of Object.entries(roles)) {
    if (!role.reportsTo) continue;
    const fromNode = roleToNodeId.get(roleId);
    const toNode = roleToNodeId.get(role.reportsTo);
    if (fromNode && toNode) {
      edges.push(`${fromNode} -. reports to .-> ${toNode}`);
    }
  }
  return edges;
}

function buildGraphDef(
  executionPlan: Record<string, any>,
  workflowState: WorkflowState | null,
  orgPattern?: OrgPattern | null,
): string {
  const steps = Array.isArray(executionPlan.steps)
    ? (executionPlan.steps as PlanStep[])
    : [];
  if (steps.length === 0) return "";

  const nodes: Array<{ stepId: string; label: string; role?: string }> = [];
  const edges: string[] = [];
  collectNodesAndEdges(steps, nodes, edges);

  const seen = new Set<string>();
  const uniqueNodes = nodes.filter((n) => {
    if (seen.has(n.stepId)) return false;
    seen.add(n.stepId);
    return true;
  });
  const uniqueEdges = Array.from(new Set(edges));

  // Add reporting-chain edges from the org chart
  const reportingEdges = orgPattern
    ? collectReportingEdges(orgPattern, uniqueNodes)
    : [];

  const lines: string[] = ["graph TD"];
  for (const n of uniqueNodes) {
    const safeLabel = `${n.stepId}: ${n.label}`.replace(/"/g, '\\"');
    lines.push(`${nodeId(n.stepId)}["${safeLabel}"]`);
  }
  for (const e of uniqueEdges) lines.push(e);
  for (const e of reportingEdges) lines.push(e);

  const stepStates = workflowState?.stepStates || {};
  for (const n of uniqueNodes) {
    const status = stepStates[n.stepId]?.status || "pending";
    lines.push(`class ${nodeId(n.stepId)} ${status}`);
  }

  lines.push("classDef pending fill:#f1f3f5,stroke:#868e96,color:#212529");
  lines.push(
    "classDef running fill:#e7f5ff,stroke:#228be6,color:#0b7285,stroke-width:3px",
  );
  lines.push("classDef waiting fill:#fff9db,stroke:#f59f00,color:#5f3dc4");
  lines.push("classDef completed fill:#ebfbee,stroke:#2b8a3e,color:#2b8a3e");
  lines.push("classDef failed fill:#fff5f5,stroke:#c92a2a,color:#c92a2a");

  return lines.join("\n");
}

function withAnimationStyles(svg: string): string {
  const styleBlock = `
<style>
  @keyframes stepPulse {
    0% { filter: drop-shadow(0 0 0 rgba(34,139,230,0.2)); }
    50% { filter: drop-shadow(0 0 7px rgba(34,139,230,0.55)); }
    100% { filter: drop-shadow(0 0 0 rgba(34,139,230,0.2)); }
  }
  @keyframes edgeFlow {
    to { stroke-dashoffset: -16; }
  }
  g.node.running > rect,
  g.node.running > polygon,
  g.node.running > path {
    animation: stepPulse 1.2s ease-in-out infinite;
  }
  .edgePath path.path {
    stroke-dasharray: 6 6;
    animation: edgeFlow 1.1s linear infinite;
    opacity: 0.9;
  }
</style>`;

  const closeIdx = svg.lastIndexOf("</svg>");
  if (closeIdx === -1) return svg;
  return `${svg.slice(0, closeIdx)}${styleBlock}${svg.slice(closeIdx)}`;
}

export function WorkflowExecutionGraph({
  executionPlan,
  workflowState,
  orgPattern,
  compact,
}: Props) {
  const [svgMarkup, setSvgMarkup] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: "default",
      securityLevel: "loose",
    });
  }, []);

  useEffect(() => {
    const parsedPlan = parseExecutionPlan(executionPlan);
    if (!parsedPlan) {
      setSvgMarkup(null);
      setError(null);
      return;
    }

    const graphDef = buildGraphDef(parsedPlan, workflowState, orgPattern);
    if (!graphDef) {
      setSvgMarkup(null);
      setError(null);
      return;
    }

    const id = `workflow-graph-${Date.now()}`;
    mermaid
      .render(id, graphDef)
      .then(({ svg }) => {
        setSvgMarkup(withAnimationStyles(svg));
        setError(null);
      })
      .catch((err) => {
        setError("Failed to render workflow graph");
        console.error("Workflow mermaid render error:", err);
      });
  }, [executionPlan, workflowState, orgPattern]);

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
        No workflow graph available.
      </Text>
    );
  }

  return (
    <Stack gap="xs">
      <ScrollArea>
        <div
          style={{ minHeight: compact ? 120 : 240 }}
          dangerouslySetInnerHTML={{ __html: svgMarkup }}
        />
      </ScrollArea>
      <Text size="xs" c="dimmed">
        Solid arrows: execution flow. Dotted arrows: reporting chain. Colors:
        pending, running, waiting, completed, failed.
      </Text>
    </Stack>
  );
}
