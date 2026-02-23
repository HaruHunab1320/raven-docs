// ─── Org-Chart Types (client-side mirrors) ──────────────────────────────────

export interface OrgRole {
  id?: string;
  name?: string;
  description?: string;
  type?: string | string[];
  capabilities: string[];
  reportsTo?: string;
  minInstances?: number;
  maxInstances?: number;
  singleton?: boolean;
  expertise?: string[];
  metadata?: Record<string, unknown>;
}

export interface OrgStructure {
  name: string;
  description?: string;
  roles: Record<string, OrgRole>;
}

export interface WorkflowStep {
  type:
    | "assign"
    | "parallel"
    | "sequential"
    | "select"
    | "review"
    | "approve"
    | "aggregate"
    | "condition"
    | "wait";
  role?: string;
  task?: string;
  steps?: WorkflowStep[];
  reviewer?: string;
  approver?: string;
  subject?: string;
  method?: string;
  sources?: string[];
  check?: string;
  then?: WorkflowStep;
  else?: WorkflowStep;
  condition?: string;
  timeout?: number;
  criteria?: string;
  maxConcurrency?: number;
  maxIterations?: number;
  input?: Record<string, unknown>;
}

export interface OrgWorkflow {
  name: string;
  description?: string;
  steps: WorkflowStep[];
}

export interface OrgPattern {
  name: string;
  version?: string;
  description?: string;
  structure: OrgStructure;
  workflow: OrgWorkflow;
  metadata?: Record<string, unknown>;
}

// ─── Team Template ──────────────────────────────────────────────────────────

export interface TeamTemplate {
  id: string;
  workspaceId: string | null;
  name: string;
  description: string | null;
  version: string;
  isSystem: boolean;
  orgPattern: OrgPattern;
  metadata: Record<string, any>;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Team Deployment ────────────────────────────────────────────────────────

export interface TeamDeployment {
  id: string;
  workspaceId: string;
  spaceId: string;
  projectId: string | null;
  templateName: string;
  status: string;
  config: Record<string, any>;
  orgPattern: OrgPattern | null;
  executionPlan: Record<string, any> | null;
  workflowState: WorkflowState | null;
  deployedBy: string | null;
  createdAt: string;
  updatedAt: string;
  tornDownAt: string | null;
}

export interface TeamAgent {
  id: string;
  deploymentId: string;
  workspaceId: string;
  userId: string | null;
  role: string;
  instanceNumber: number;
  status: string;
  systemPrompt: string;
  capabilities: string[];
  currentStepId: string | null;
  reportsToAgentId: string | null;
  lastRunAt: string | null;
  lastRunSummary: string | null;
  totalActions: number;
  totalErrors: number;
  createdAt: string;
  updatedAt: string;
}

export interface DeploymentDetail {
  deployment: TeamDeployment;
  agents: TeamAgent[];
}

// ─── Workflow State ─────────────────────────────────────────────────────────

export interface StepState {
  status: "pending" | "running" | "completed" | "failed" | "waiting";
  startedAt?: string;
  completedAt?: string;
  error?: string;
  result?: any;
}

export interface WorkflowState {
  currentPhase:
    | "idle"
    | "running"
    | "completed"
    | "failed"
    | "paused"
    | "torn_down";
  stepStates: Record<string, StepState>;
  coordinatorInvocations: number;
  startedAt?: string;
  completedAt?: string;
}
