const WRITE_OPERATIONS = new Set([
  'create',
  'update',
  'complete',
  'assign',
  'delete',
  'move',
  'register',
  'restore',
  'approve',
  'teardown',
  'deploy',
  'trigger',
  'start',
]);

function isMethodShape(value: string): boolean {
  return /^[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+$/.test(value);
}

function isResourceWildcard(value: string): boolean {
  return /^[a-zA-Z0-9_]+\.\*$/.test(value);
}

export function hasWriteCapability(capabilities: string[]): boolean {
  for (const raw of capabilities || []) {
    const cap = String(raw || '').trim();
    if (!cap) continue;
    if (cap === '*') return true;
    if (isResourceWildcard(cap)) return true;
    if (!isMethodShape(cap)) continue;
    const op = cap.split('.')[1]?.toLowerCase() || '';
    if (WRITE_OPERATIONS.has(op)) return true;
  }
  return false;
}

export function ensurePersistenceCapabilities(capabilities: string[]): string[] {
  const normalized = Array.from(
    new Set((capabilities || []).map((c) => String(c || '').trim()).filter(Boolean)),
  );

  if (hasWriteCapability(normalized)) {
    return normalized;
  }

  // Minimal safe write set so agent loops can persist artifacts.
  return Array.from(new Set([...normalized, 'task.create', 'page.create', 'experiment.update']));
}

