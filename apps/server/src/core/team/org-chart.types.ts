// Re-export all types from the published @parallaxai/org-chart-compiler package,
// with Raven-specific extensions for fields not in the upstream type.

import type {
  OrgRole as BaseOrgRole,
  OrgStructure as BaseOrgStructure,
  OrgPattern as BaseOrgPattern,
} from '@parallaxai/org-chart-compiler';

export type {
  // Workflow types
  OrgWorkflow,
  RoutingRule,
  EscalationConfig,

  // Workflow step types
  WorkflowStep,
  AssignStep,
  ParallelStep,
  SequentialStep,
  SelectStep,
  ReviewStep,
  ApproveStep,
  AggregateStep,
  ConditionStep,
  WaitStep,

  // Compilation types
  CompileOptions,
  CompileResult,
  CompileTarget,
  CompileContext,
  PatternMetadata,

  // Validation types
  ValidationResult,
  ValidationError,
} from '@parallaxai/org-chart-compiler';

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
