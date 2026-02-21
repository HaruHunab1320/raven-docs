import type {
  OrgPattern,
  OrgRole,
  OrgWorkflow,
  WorkflowStep,
  CompileTarget,
  CompileContext,
} from './org-chart.types';
import type {
  RavenExecutionPlan,
  RavenStepPlan,
  RavenOperation,
} from './workflow-state.types';

/**
 * Raven compile target — converts an OrgPattern into a RavenExecutionPlan.
 *
 * Implements the CompileTarget interface from the org-chart-compiler so
 * it can be swapped in via the compiler when the package is published.
 * For now we call compileOrgPattern() directly.
 */
export const ravenCompileTarget: CompileTarget = {
  name: 'raven',
  format: 'json',

  emitRole(role: OrgRole, roleId: string, _ctx: CompileContext): string {
    return JSON.stringify({
      id: roleId,
      name: role.name || roleId,
      capabilities: role.capabilities,
      reportsTo: role.reportsTo,
      minInstances: role.minInstances ?? 1,
      maxInstances: role.maxInstances ?? 1,
      singleton: role.singleton ?? false,
    });
  },

  emitWorkflow(workflow: OrgWorkflow, ctx: CompileContext): string {
    const steps = workflow.steps.map((step, i) =>
      this.emitStep(step, i, ctx),
    );
    return `[${steps.join(',')}]`;
  },

  emitStep(step: WorkflowStep, stepIndex: number, ctx: CompileContext): string {
    const plan = buildStepPlan(step, `step_${stepIndex}`);
    return JSON.stringify(plan);
  },

  join(parts: string[]): string {
    return parts.join('\n');
  },
};

function buildStepPlan(step: WorkflowStep, stepId: string): RavenStepPlan {
  switch (step.type) {
    case 'assign':
      return {
        stepId,
        type: 'assign',
        operation: {
          kind: 'dispatch_agent_loop',
          role: step.role,
          task: step.task,
          input: step.input,
        },
        timeoutMs: step.timeout,
      };

    case 'parallel':
      return {
        stepId,
        type: 'parallel',
        operation: { kind: 'noop' },
        children: step.steps.map((child, i) =>
          buildStepPlan(child, `${stepId}_${i}`),
        ),
      };

    case 'sequential':
      return {
        stepId,
        type: 'sequential',
        operation: { kind: 'noop' },
        children: step.steps.map((child, i) =>
          buildStepPlan(child, `${stepId}_${i}`),
        ),
      };

    case 'select':
      return {
        stepId,
        type: 'select',
        operation: {
          kind: 'invoke_coordinator',
          reason: `Select agent for role "${step.role}" by ${step.criteria || 'availability'}`,
          context: { role: step.role, criteria: step.criteria || 'availability' },
        },
      };

    case 'review':
      return {
        stepId,
        type: 'review',
        operation: {
          kind: 'dispatch_agent_loop',
          role: step.reviewer,
          task: `Review: ${step.subject}`,
        },
      };

    case 'approve':
      return {
        stepId,
        type: 'approve',
        operation: {
          kind: 'invoke_coordinator',
          reason: `Approve: ${step.subject}`,
          context: { approver: step.approver, subject: step.subject },
        },
      };

    case 'aggregate':
      return {
        stepId,
        type: 'aggregate',
        operation: {
          kind: 'aggregate_results',
          method: step.method,
          sourceStepIds: step.sources || [],
        },
      };

    case 'condition':
      return {
        stepId,
        type: 'condition',
        operation: {
          kind: 'evaluate_condition',
          check: step.check,
        },
        thenBranch: buildStepPlan(step.then, `${stepId}_then`),
        elseBranch: step.else
          ? buildStepPlan(step.else, `${stepId}_else`)
          : undefined,
      };

    case 'wait':
      return {
        stepId,
        type: 'wait',
        operation: {
          kind: 'await_event',
          eventPattern: step.condition || '*',
          timeout: step.timeout,
        },
        timeoutMs: step.timeout,
      };
  }
}

/**
 * Compile an OrgPattern into a RavenExecutionPlan.
 * This is the main entry point used by the deployment service.
 */
export function compileOrgPattern(pattern: OrgPattern): RavenExecutionPlan {
  const roles: RavenExecutionPlan['roles'] = {};

  for (const [roleId, role] of Object.entries(pattern.structure.roles)) {
    roles[roleId] = {
      name: role.name || roleId,
      capabilities: role.capabilities,
      reportsTo: role.reportsTo,
      minInstances: role.minInstances ?? 1,
      maxInstances: role.maxInstances ?? 1,
      singleton: role.singleton ?? false,
    };
  }

  const steps = pattern.workflow.steps.map((step, i) =>
    buildStepPlan(step, `step_${i}`),
  );

  return {
    patternName: pattern.name,
    version: pattern.version || '1.0.0',
    roles,
    routing: pattern.structure.routing || [],
    escalation: pattern.structure.escalation,
    steps,
  };
}
