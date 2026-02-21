import type { RoutingRule, EscalationConfig } from './org-chart.types';

export interface WorkflowState {
  currentPhase: 'idle' | 'running' | 'paused' | 'completed' | 'failed';
  stepStates: Record<string, StepState>;
  startedAt?: string;
  completedAt?: string;
  lastAdvancedAt?: string;
  coordinatorInvocations: number;
}

export interface StepState {
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'waiting';
  startedAt?: string;
  completedAt?: string;
  assignedAgentId?: string;
  result?: any;
  error?: string;
  retryCount: number;
  escalationCount: number;
}

export type RavenOperation =
  | { kind: 'dispatch_agent_loop'; role: string; task: string; input?: any }
  | { kind: 'invoke_coordinator'; reason: string; context: Record<string, any> }
  | { kind: 'await_event'; eventPattern: string; timeout?: number }
  | { kind: 'aggregate_results'; method: string; sourceStepIds: string[] }
  | { kind: 'evaluate_condition'; check: string }
  | { kind: 'noop' };

export interface RavenStepPlan {
  stepId: string;
  type: string;
  operation: RavenOperation;
  children?: RavenStepPlan[];
  thenBranch?: RavenStepPlan;
  elseBranch?: RavenStepPlan;
  timeoutMs?: number;
}

export interface RavenExecutionPlan {
  patternName: string;
  version: string;
  roles: Record<string, {
    name: string;
    capabilities: string[];
    reportsTo?: string;
    minInstances: number;
    maxInstances: number;
    singleton: boolean;
  }>;
  routing: RoutingRule[];
  escalation?: EscalationConfig;
  steps: RavenStepPlan[];
}
