import type {
  OrgPattern,
  OrgRole,
  WorkflowStep,
  RoutingRule,
  EscalationConfig,
} from '../team/org-chart.types';

/**
 * Serializes a Raven OrgPattern to the YAML string format expected by
 * Parallax's `POST /api/patterns/upload` endpoint.
 *
 * The Parallax control plane auto-compiles org-chart YAML into executable
 * Prism scripts and makes them available for execution via `/api/executions`.
 */
export function serializeOrgPatternToYaml(pattern: OrgPattern): string {
  const lines: string[] = [];

  // ── Metadata ──────────────────────────────────────────────────────────
  lines.push(`name: ${yamlString(pattern.name)}`);
  if (pattern.version) {
    lines.push(`version: ${yamlString(pattern.version)}`);
  }
  if (pattern.description) {
    lines.push(`description: ${yamlString(pattern.description)}`);
  }
  lines.push('');

  // ── Structure ─────────────────────────────────────────────────────────
  lines.push('structure:');
  lines.push(`  name: ${yamlString(pattern.structure.name)}`);
  if (pattern.structure.description) {
    lines.push(`  description: ${yamlString(pattern.structure.description)}`);
  }

  // Roles
  lines.push('  roles:');
  for (const [roleId, role] of Object.entries(pattern.structure.roles)) {
    lines.push(...serializeRole(roleId, role, 4));
  }

  // Routing
  if (pattern.structure.routing?.length) {
    lines.push('  routing:');
    for (const rule of pattern.structure.routing) {
      lines.push(...serializeRoutingRule(rule, 4));
    }
  }

  // Escalation
  if (pattern.structure.escalation) {
    lines.push('  escalation:');
    lines.push(...serializeEscalation(pattern.structure.escalation, 4));
  }

  lines.push('');

  // ── Workflow ──────────────────────────────────────────────────────────
  lines.push('workflow:');
  lines.push(`  name: ${yamlString(pattern.workflow.name)}`);
  if (pattern.workflow.description) {
    lines.push(`  description: ${yamlString(pattern.workflow.description)}`);
  }

  lines.push('  steps:');
  for (const step of pattern.workflow.steps) {
    lines.push(...serializeWorkflowStep(step, 4));
  }

  if (pattern.workflow.output) {
    lines.push(`  output: ${yamlString(pattern.workflow.output)}`);
  }

  return lines.join('\n') + '\n';
}

// ── Role Serialization ──────────────────────────────────────────────────

function serializeRole(roleId: string, role: OrgRole, indent: number): string[] {
  const pad = ' '.repeat(indent);
  const lines: string[] = [];

  lines.push(`${pad}${roleId}:`);
  lines.push(`${pad}  id: ${yamlString(role.id || roleId)}`);

  if (role.name) {
    lines.push(`${pad}  name: ${yamlString(role.name)}`);
  }
  if (role.description) {
    lines.push(`${pad}  description: ${yamlString(role.description)}`);
  }

  // Agent type
  if (role.agentType) {
    lines.push(`${pad}  agentType: ${yamlString(role.agentType)}`);
  } else if (role.type) {
    // Legacy 'type' field
    const typeValue = Array.isArray(role.type) ? role.type[0] : role.type;
    lines.push(`${pad}  agentType: ${yamlString(typeValue)}`);
  }

  // Capabilities
  if (role.capabilities?.length) {
    lines.push(`${pad}  capabilities:`);
    for (const cap of role.capabilities) {
      lines.push(`${pad}    - ${yamlString(cap)}`);
    }
  }

  // Hierarchy
  if (role.reportsTo) {
    lines.push(`${pad}  reportsTo: ${yamlString(role.reportsTo)}`);
  }

  // Instances
  if (role.singleton != null) {
    lines.push(`${pad}  singleton: ${role.singleton}`);
  }
  if (role.minInstances != null) {
    lines.push(`${pad}  minInstances: ${role.minInstances}`);
  }
  if (role.maxInstances != null) {
    lines.push(`${pad}  maxInstances: ${role.maxInstances}`);
  }

  // Expertise
  if (role.expertise?.length) {
    lines.push(`${pad}  expertise:`);
    for (const exp of role.expertise) {
      lines.push(`${pad}    - ${yamlString(exp)}`);
    }
  }

  // Workdir
  if (role.workdir) {
    lines.push(`${pad}  workdir: ${yamlString(role.workdir)}`);
  }

  return lines;
}

// ── Routing Serialization ───────────────────────────────────────────────

function serializeRoutingRule(rule: RoutingRule, indent: number): string[] {
  const pad = ' '.repeat(indent);
  const lines: string[] = [];

  lines.push(`${pad}- from: ${serializeStringOrArray(rule.from)}`);
  lines.push(`${pad}  to: ${serializeStringOrArray(rule.to)}`);

  if (rule.topics?.length) {
    lines.push(`${pad}  topics:`);
    for (const topic of rule.topics) {
      lines.push(`${pad}    - ${yamlString(topic)}`);
    }
  }

  if (rule.messageTypes?.length) {
    lines.push(`${pad}  messageTypes:`);
    for (const mt of rule.messageTypes) {
      lines.push(`${pad}    - ${yamlString(mt)}`);
    }
  }

  if (rule.priority != null) {
    lines.push(`${pad}  priority: ${rule.priority}`);
  }

  if (rule.broadcast != null) {
    lines.push(`${pad}  broadcast: ${rule.broadcast}`);
  }

  return lines;
}

// ── Escalation Serialization ────────────────────────────────────────────

function serializeEscalation(esc: EscalationConfig, indent: number): string[] {
  const pad = ' '.repeat(indent);
  const lines: string[] = [];

  lines.push(`${pad}defaultBehavior: ${yamlString(esc.defaultBehavior)}`);

  if (esc.topicRoutes && Object.keys(esc.topicRoutes).length > 0) {
    lines.push(`${pad}topicRoutes:`);
    for (const [topic, target] of Object.entries(esc.topicRoutes)) {
      lines.push(`${pad}  ${topic}: ${yamlString(target)}`);
    }
  }

  if (esc.timeoutMs != null) {
    lines.push(`${pad}timeoutMs: ${esc.timeoutMs}`);
  }

  if (esc.maxDepth != null) {
    lines.push(`${pad}maxDepth: ${esc.maxDepth}`);
  }

  lines.push(`${pad}onMaxDepth: ${yamlString(esc.onMaxDepth)}`);

  return lines;
}

// ── Workflow Step Serialization ─────────────────────────────────────────

function serializeWorkflowStep(step: WorkflowStep, indent: number): string[] {
  const pad = ' '.repeat(indent);
  const lines: string[] = [];

  switch (step.type) {
    case 'assign':
      lines.push(`${pad}- type: assign`);
      lines.push(`${pad}  role: ${yamlString(step.role)}`);
      lines.push(`${pad}  task: ${yamlString(step.task)}`);
      if (step.input) {
        lines.push(`${pad}  input:`);
        for (const [key, value] of Object.entries(step.input)) {
          lines.push(`${pad}    ${key}: ${yamlString(String(value))}`);
        }
      }
      if (step.timeout != null) {
        lines.push(`${pad}  timeout: ${step.timeout}`);
      }
      break;

    case 'parallel':
      lines.push(`${pad}- type: parallel`);
      if (step.maxConcurrency != null) {
        lines.push(`${pad}  maxConcurrency: ${step.maxConcurrency}`);
      }
      lines.push(`${pad}  steps:`);
      for (const sub of step.steps) {
        lines.push(...serializeWorkflowStep(sub, indent + 4));
      }
      break;

    case 'sequential':
      lines.push(`${pad}- type: sequential`);
      lines.push(`${pad}  steps:`);
      for (const sub of step.steps) {
        lines.push(...serializeWorkflowStep(sub, indent + 4));
      }
      break;

    case 'select':
      lines.push(`${pad}- type: select`);
      lines.push(`${pad}  role: ${yamlString(step.role)}`);
      if (step.criteria) {
        lines.push(`${pad}  criteria: ${yamlString(step.criteria)}`);
      }
      break;

    case 'review':
      lines.push(`${pad}- type: review`);
      lines.push(`${pad}  reviewer: ${yamlString(step.reviewer)}`);
      lines.push(`${pad}  subject: ${yamlString(step.subject)}`);
      if (step.maxIterations != null) {
        lines.push(`${pad}  maxIterations: ${step.maxIterations}`);
      }
      break;

    case 'approve':
      lines.push(`${pad}- type: approve`);
      lines.push(`${pad}  approver: ${yamlString(step.approver)}`);
      lines.push(`${pad}  subject: ${yamlString(step.subject)}`);
      break;

    case 'aggregate':
      lines.push(`${pad}- type: aggregate`);
      lines.push(`${pad}  method: ${yamlString(step.method)}`);
      if (step.sources?.length) {
        lines.push(`${pad}  sources:`);
        for (const src of step.sources) {
          lines.push(`${pad}    - ${yamlString(src)}`);
        }
      }
      break;

    case 'condition':
      lines.push(`${pad}- type: condition`);
      lines.push(`${pad}  check: ${yamlString(step.check)}`);
      lines.push(`${pad}  then:`);
      lines.push(...serializeWorkflowStep(step.then, indent + 4));
      if (step.else) {
        lines.push(`${pad}  else:`);
        lines.push(...serializeWorkflowStep(step.else, indent + 4));
      }
      break;

    case 'wait':
      // Parallax doesn't have a native 'wait' step — map to condition with timeout
      lines.push(`${pad}- type: condition`);
      lines.push(`${pad}  check: ${yamlString(step.condition || 'true')}`);
      lines.push(`${pad}  then:`);
      lines.push(`${pad}      - type: assign`);
      lines.push(`${pad}        role: coordinator`);
      lines.push(`${pad}        task: "Continue after wait condition met"`);
      if (step.timeout != null) {
        lines.push(`${pad}  # timeout: ${step.timeout}`);
      }
      break;
  }

  return lines;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function yamlString(value: string): string {
  if (!value) return '""';
  // If the string contains special YAML characters, quote it
  if (
    value.includes(':') ||
    value.includes('#') ||
    value.includes('{') ||
    value.includes('}') ||
    value.includes('[') ||
    value.includes(']') ||
    value.includes(',') ||
    value.includes('&') ||
    value.includes('*') ||
    value.includes('?') ||
    value.includes('|') ||
    value.includes('-') ||
    value.includes('<') ||
    value.includes('>') ||
    value.includes('=') ||
    value.includes('!') ||
    value.includes('%') ||
    value.includes('@') ||
    value.includes('`') ||
    value.includes('"') ||
    value.includes("'") ||
    value.includes('\n') ||
    value.startsWith(' ') ||
    value.endsWith(' ') ||
    value === 'true' ||
    value === 'false' ||
    value === 'null' ||
    value === 'yes' ||
    value === 'no'
  ) {
    // Escape double quotes inside the string
    const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `"${escaped}"`;
  }
  return value;
}

function serializeStringOrArray(value: string | string[]): string {
  if (Array.isArray(value)) {
    if (value.length === 1) {
      return yamlString(value[0]);
    }
    return `[${value.map(yamlString).join(', ')}]`;
  }
  return yamlString(value);
}

/**
 * Convert a Raven OrgPattern to a Parallax-compatible OrgPattern object.
 * Handles minor field differences between the two type systems.
 */
export function toParallaxOrgPattern(pattern: OrgPattern): Record<string, unknown> {
  const roles: Record<string, unknown> = {};

  for (const [roleId, role] of Object.entries(pattern.structure.roles)) {
    roles[roleId] = {
      id: role.id || roleId,
      name: role.name,
      description: role.description,
      agentType: role.agentType || (Array.isArray(role.type) ? role.type[0] : role.type) || 'claude',
      capabilities: role.capabilities || [],
      reportsTo: role.reportsTo,
      minInstances: role.minInstances,
      maxInstances: role.maxInstances,
      singleton: role.singleton,
      expertise: role.expertise,
    };
  }

  return {
    name: pattern.name,
    version: pattern.version || '1.0.0',
    description: pattern.description,
    structure: {
      name: pattern.structure.name,
      description: pattern.structure.description,
      roles,
      routing: pattern.structure.routing,
      escalation: pattern.structure.escalation,
    },
    workflow: {
      name: pattern.workflow.name,
      description: pattern.workflow.description,
      input: pattern.workflow.input,
      steps: pattern.workflow.steps,
      output: pattern.workflow.output,
    },
    metadata: pattern.metadata,
  };
}
