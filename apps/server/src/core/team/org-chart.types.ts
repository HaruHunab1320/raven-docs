// Temporary types shim for @parallax/org-chart-compiler
// When @parallax/org-chart-compiler is published, replace this file's imports with:
//   import { ... } from '@parallax/org-chart-compiler';

// ─────────────────────────────────────────────────────────────────────────────
// Role Types
// ─────────────────────────────────────────────────────────────────────────────

export interface OrgRole {
  id?: string;
  name?: string;
  description?: string;
  type?: string | string[];
  agentType?: string;
  workdir?: string;
  capabilities: string[];
  reportsTo?: string;
  minInstances?: number;
  maxInstances?: number;
  singleton?: boolean;
  expertise?: string[];
  metadata?: Record<string, unknown>;
}

export interface RoutingRule {
  from: string | string[];
  to: string | string[];
  topics?: string[];
  messageTypes?: ('task' | 'question' | 'response' | 'status')[];
  priority?: number;
  broadcast?: boolean;
}

export interface EscalationConfig {
  defaultBehavior: 'route_to_reports_to' | 'broadcast' | 'surface_to_user';
  topicRoutes?: Record<string, string>;
  timeoutMs?: number;
  maxDepth?: number;
  onMaxDepth: 'surface_to_user' | 'fail' | 'return_best_effort';
}

export interface OrgStructure {
  name: string;
  description?: string;
  roles: Record<string, OrgRole>;
  routing?: RoutingRule[];
  escalation?: EscalationConfig;
}

// ─────────────────────────────────────────────────────────────────────────────
// Workflow Types
// ─────────────────────────────────────────────────────────────────────────────

export interface AssignStep {
  type: 'assign';
  role: string;
  task: string;
  input?: Record<string, unknown>;
  timeout?: number;
}

export interface ParallelStep {
  type: 'parallel';
  steps: WorkflowStep[];
  maxConcurrency?: number;
}

export interface SequentialStep {
  type: 'sequential';
  steps: WorkflowStep[];
}

export interface SelectStep {
  type: 'select';
  role: string;
  criteria?: 'availability' | 'expertise' | 'round_robin' | 'best';
}

export interface ReviewStep {
  type: 'review';
  reviewer: string;
  subject: string;
  maxIterations?: number;
}

export interface ApproveStep {
  type: 'approve';
  approver: string;
  subject: string;
}

export interface AggregateStep {
  type: 'aggregate';
  method: 'consensus' | 'majority' | 'merge' | 'best' | 'custom';
  sources?: string[];
  customFn?: string;
}

export interface ConditionStep {
  type: 'condition';
  check: string;
  then: WorkflowStep;
  else?: WorkflowStep;
}

export interface WaitStep {
  type: 'wait';
  condition?: string;
  timeout?: number;
}

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

export interface OrgWorkflow {
  name: string;
  description?: string;
  input?: Record<string, unknown>;
  steps: WorkflowStep[];
  output?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pattern Types
// ─────────────────────────────────────────────────────────────────────────────

export interface OrgPattern {
  name: string;
  version?: string;
  description?: string;
  structure: OrgStructure;
  workflow: OrgWorkflow;
  metadata?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Compilation Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CompileOptions {
  target?: string | CompileTarget;
  includeComments?: boolean;
  prettyPrint?: boolean;
  variables?: Record<string, unknown>;
}

export interface CompileContext {
  pattern: OrgPattern;
  targetName: string;
  variables: Map<string, string>;
  stepResults: Map<string, string>;
  indent: number;
  includeComments: boolean;
  addVariable(name: string, reference: string): void;
  getIndent(): string;
}

export interface CompileTarget {
  name: string;
  format: 'code' | 'json' | 'yaml';
  emitHeader?(pattern: OrgPattern, ctx: CompileContext): string;
  emitRole(role: OrgRole, roleId: string, ctx: CompileContext): string;
  emitWorkflow(workflow: OrgWorkflow, ctx: CompileContext): string;
  emitStep(step: WorkflowStep, stepIndex: number, ctx: CompileContext): string;
  emitFooter?(pattern: OrgPattern, ctx: CompileContext): string;
  join(parts: string[]): string;
}

export interface CompileResult {
  name: string;
  output: string;
  format: 'code' | 'json' | 'yaml';
  metadata: PatternMetadata;
}

export interface PatternMetadata {
  name: string;
  version: string;
  description: string;
  input: Record<string, unknown>;
  capabilities: string[];
  agentCounts: { min: number; max: number };
  roles: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ValidationError {
  path: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}
