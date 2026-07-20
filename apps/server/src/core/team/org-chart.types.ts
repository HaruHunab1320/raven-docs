// Org-chart pattern types for the team deployment system.
//
// Originally re-exported from @parallaxai/org-chart-compiler (the Prism-era
// YAML → Prism compiler). Parallax retired Prism and the compiler package with
// it, so the type definitions now live here. The shapes stay wire-compatible
// with Parallax org-chart YAML patterns.

/** Organizational role definition */
export interface BaseOrgRole {
  /** Unique role identifier (key in roles record) */
  id?: string;
  /** Human-readable role name */
  name?: string;
  /** Role description */
  description?: string;
  /** Agent/worker type for this role (generic string, not enum) */
  type?: string | string[];
  /** Required capabilities */
  capabilities: string[];
  /** Role this one reports to */
  reportsTo?: string;
  /** Minimum instances of this role */
  minInstances?: number;
  /** Maximum instances of this role */
  maxInstances?: number;
  /** Whether only one instance can exist */
  singleton?: boolean;
  /** Topics this role can answer questions about */
  expertise?: string[];
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/** Message routing rule */
export interface RoutingRule {
  /** Source role(s) */
  from: string | string[];
  /** Destination role(s) */
  to: string | string[];
  /** Topics this rule applies to */
  topics?: string[];
  /** Message types this rule applies to */
  messageTypes?: ('task' | 'question' | 'response' | 'status')[];
  /** Priority (lower = higher priority) */
  priority?: number;
  /** Whether to broadcast to all instances of target role */
  broadcast?: boolean;
}

/** Escalation configuration */
export interface EscalationConfig {
  /** Default behavior for unrouted questions */
  defaultBehavior: 'route_to_reports_to' | 'broadcast' | 'surface_to_user';
  /** Topic-specific routing overrides */
  topicRoutes?: Record<string, string>;
  /** Timeout before escalating (ms) */
  timeoutMs?: number;
  /** Maximum escalation depth */
  maxDepth?: number;
  /** What to do if max depth reached */
  onMaxDepth: 'surface_to_user' | 'fail' | 'return_best_effort';
}

/** Organizational structure definition */
export interface BaseOrgStructure {
  /** Structure name */
  name: string;
  /** Structure description */
  description?: string;
  /** Role definitions */
  roles: Record<string, BaseOrgRole>;
  /** Message routing rules */
  routing?: RoutingRule[];
  /** Escalation configuration */
  escalation?: EscalationConfig;
}

/** Assign a task to a role */
export interface AssignStep {
  type: 'assign';
  role: string;
  task: string;
  input?: Record<string, unknown>;
  timeout?: number;
}

/** Execute steps in parallel */
export interface ParallelStep {
  type: 'parallel';
  steps: WorkflowStep[];
  maxConcurrency?: number;
}

/** Execute steps sequentially */
export interface SequentialStep {
  type: 'sequential';
  steps: WorkflowStep[];
}

/** Select an agent from a role */
export interface SelectStep {
  type: 'select';
  role: string;
  criteria?: 'availability' | 'expertise' | 'round_robin' | 'best';
}

/** Request a review from a role */
export interface ReviewStep {
  type: 'review';
  reviewer: string;
  subject: string;
  maxIterations?: number;
}

/** Request approval from a role */
export interface ApproveStep {
  type: 'approve';
  approver: string;
  subject: string;
}

/** Aggregate multiple results */
export interface AggregateStep {
  type: 'aggregate';
  method: 'consensus' | 'majority' | 'merge' | 'best' | 'custom';
  sources?: string[];
  customFn?: string;
}

/** Conditional branching */
export interface ConditionStep {
  type: 'condition';
  check: string;
  then: WorkflowStep;
  else?: WorkflowStep;
}

/** Wait for a condition or timeout */
export interface WaitStep {
  type: 'wait';
  condition?: string;
  timeout?: number;
}

/** All workflow step types */
export type WorkflowStep =
  | AssignStep
  | ParallelStep
  | SequentialStep
  | SelectStep
  | ReviewStep
  | ApproveStep
  | AggregateStep
  | ConditionStep
  | WaitStep;

/** Workflow definition */
export interface OrgWorkflow {
  /** Workflow name */
  name: string;
  /** Workflow description */
  description?: string;
  /** Input schema */
  input?: Record<string, unknown>;
  /** Workflow steps */
  steps: WorkflowStep[];
  /** Output variable reference */
  output?: string;
}

/** Complete org-chart pattern definition */
export interface BaseOrgPattern {
  /** Pattern name */
  name: string;
  /** Pattern version */
  version?: string;
  /** Pattern description */
  description?: string;
  /** Organizational structure */
  structure: BaseOrgStructure;
  /** Workflow definition */
  workflow: OrgWorkflow;
  /** Pattern metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Raven-specific extension of OrgRole that adds fields used by the team
 * deployment system but not present in the upstream Parallax type.
 */
export interface OrgRole extends BaseOrgRole {
  /** Raven-specific: maps to a coding agent adapter type (e.g. 'claude-code', 'aider') */
  agentType?: string;
  /** Raven-specific: working directory override for this role's agent */
  workdir?: string;
}

/** OrgStructure using Raven's extended OrgRole */
export interface OrgStructure extends Omit<BaseOrgStructure, 'roles'> {
  roles: Record<string, OrgRole>;
}

/** OrgPattern using Raven's extended OrgStructure */
export interface OrgPattern extends Omit<BaseOrgPattern, 'structure'> {
  structure: OrgStructure;
}
