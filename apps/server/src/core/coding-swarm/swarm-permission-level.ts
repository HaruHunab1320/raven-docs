import type { ApprovalPreset } from 'coding-agent-adapters';

export type SwarmPermissionLevel =
  | 'readonly'
  | 'standard'
  | 'permissive'
  | 'yolo';

export const DEFAULT_SWARM_PERMISSION_LEVEL: SwarmPermissionLevel = 'standard';

export function mapSwarmPermissionToApprovalPreset(
  level?: string | null,
): ApprovalPreset {
  const normalized = String(level || DEFAULT_SWARM_PERMISSION_LEVEL)
    .trim()
    .toLowerCase();

  switch (normalized) {
    case 'readonly':
      return 'readonly';
    case 'permissive':
      return 'permissive';
    case 'yolo':
      return 'autonomous';
    case 'standard':
    default:
      return 'standard';
  }
}
