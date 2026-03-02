import { mkdirSync, rmSync, existsSync } from 'fs';
import { join, resolve } from 'path';

/**
 * Project-local scratch directories for team agents.
 *
 * Each agent gets a deterministic path under `data/team-scratch/{deploymentId}/{agentId}/`.
 * These directories are sandboxed (Claude Code sandbox mode) and cleaned up on
 * team reset / teardown.
 */

const SCRATCH_BASE = resolve(process.cwd(), 'data', 'team-scratch');

const SAFE_ID = /^[a-zA-Z0-9-]+$/;

function validateId(value: string, label: string): void {
  if (!value || !SAFE_ID.test(value)) {
    throw new Error(
      `Invalid ${label}: must match [a-zA-Z0-9-] (got "${value}")`,
    );
  }
}

/**
 * Deterministic scratch dir path for an agent. Does NOT create anything on disk.
 */
export function resolveScratchDir(
  deploymentId: string,
  agentId: string,
): string {
  validateId(deploymentId, 'deploymentId');
  validateId(agentId, 'agentId');

  const resolved = join(SCRATCH_BASE, deploymentId, agentId);

  // Path containment check — resolved path must be inside SCRATCH_BASE
  if (!resolved.startsWith(SCRATCH_BASE + '/')) {
    throw new Error('Scratch dir path escaped base directory');
  }

  return resolved;
}

/**
 * Create the scratch directory (if it doesn't already exist) and return the path.
 */
export function ensureScratchDir(
  deploymentId: string,
  agentId: string,
): string {
  const dir = resolveScratchDir(deploymentId, agentId);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Remove all scratch directories for a deployment.
 * Only removes the `{deploymentId}/` subtree — never the base directory itself.
 */
export function cleanupScratchDirs(deploymentId: string): void {
  validateId(deploymentId, 'deploymentId');

  const target = join(SCRATCH_BASE, deploymentId);

  // Safety: never delete the base dir itself
  if (!target.startsWith(SCRATCH_BASE + '/')) {
    throw new Error('Cleanup path escaped base directory');
  }

  if (existsSync(target)) {
    rmSync(target, { recursive: true, force: true });
  }
}
