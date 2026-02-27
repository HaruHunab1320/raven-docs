#!/usr/bin/env node

import { createHash } from 'crypto';
import {
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
  unlinkSync,
  existsSync,
  mkdirSync,
} from 'fs';
import { basename, dirname, join, relative } from 'path';

interface ConnectorConfig {
  serverUrl: string;
  workspaceId: string;
  jwt: string;
}

interface JsonObject {
  [key: string]: unknown;
}

interface SourceFileSummary {
  relativePath: string;
  lastSyncedHash: string;
}

interface SourceSummary {
  id: string;
  mode: 'import_only' | 'local_to_cloud' | 'bidirectional';
  status?: 'active' | 'paused';
  connectorId?: string;
  includePatterns?: string[];
  excludePatterns?: string[];
}

interface DeltaEvent {
  cursor: number;
  type: string;
  relativePath?: string;
  payload?: {
    hash?: string;
    content?: string;
    contentType?: string;
    operationId?: string;
  };
}

interface QueueItem {
  operationId: string;
  relativePath: string;
  content: string;
  contentHash: string;
  contentType: string;
  baseHash?: string;
  isDelete?: boolean;
  attempts: number;
  nextAttemptAt: number;
  lastError?: string;
}

interface DaemonState {
  localHashes: Record<string, string>;
  queue: QueueItem[];
  remoteCursor: number;
}

const DEFAULT_STATE: DaemonState = {
  localHashes: {},
  queue: [],
  remoteCursor: 0,
};

const DEFAULT_MAX_FILE_BYTES = Number(process.env.RAVEN_MAX_FILE_BYTES || 1_000_000);
const DEFAULT_MAX_FILES_PER_SCAN = Number(process.env.RAVEN_MAX_FILES_PER_SCAN || 10_000);

function getConfig(): ConnectorConfig {
  const serverUrl = process.env.RAVEN_SERVER_URL || 'http://localhost:3000';
  const workspaceId = process.env.RAVEN_WORKSPACE || '';
  const jwt = process.env.RAVEN_JWT || '';

  if (!workspaceId || !jwt) {
    throw new Error(
      'Missing config: set RAVEN_WORKSPACE and RAVEN_JWT environment variables',
    );
  }

  return { serverUrl, workspaceId, jwt };
}

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function loadState(stateFilePath: string): DaemonState {
  if (!existsSync(stateFilePath)) {
    return { ...DEFAULT_STATE };
  }

  try {
    const raw = readFileSync(stateFilePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<DaemonState>;

    return {
      localHashes: parsed.localHashes || {},
      queue: Array.isArray(parsed.queue) ? parsed.queue : [],
      remoteCursor: Number(parsed.remoteCursor || 0),
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function saveState(stateFilePath: string, state: DaemonState) {
  writeFileSync(stateFilePath, JSON.stringify(state, null, 2));
}

function computeBackoffMs(attempts: number): number {
  const base = 1000;
  const cap = 60_000;
  return Math.min(cap, base * 2 ** Math.max(0, attempts - 1));
}

async function post(config: ConnectorConfig, path: string, body: JsonObject) {
  const url = `${config.serverUrl}/api/local-sync/${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.jwt}`,
      'x-workspace-id': config.workspaceId,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${text.slice(0, 500)}`);
  }

  try {
    return JSON.parse(text) as JsonObject;
  } catch {
    return { ok: true, raw: text };
  }
}

function print(result: unknown) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function normalizeRelativePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.?\//, '');
}

function globToRegExp(pattern: string): RegExp {
  const normalized = normalizeRelativePath(pattern);
  const escaped = normalized.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const withDoubleStar = escaped.replace(/\*\*/g, '<<<DOUBLE_STAR>>>');
  const withSingleStar = withDoubleStar.replace(/\*/g, '[^/]*');
  const finalPattern = withSingleStar.replace(/<<<DOUBLE_STAR>>>/g, '.*');
  return new RegExp(`^${finalPattern}$`);
}

function parseIgnoreRules(rootDir: string): Array<{ negate: boolean; regex: RegExp }> {
  const gitIgnorePath = join(rootDir, '.gitignore');
  if (!existsSync(gitIgnorePath)) {
    return [];
  }

  const lines = readFileSync(gitIgnorePath, 'utf8').split('\n');
  const rules: Array<{ negate: boolean; regex: RegExp }> = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const negate = line.startsWith('!');
    const pattern = negate ? line.slice(1) : line;
    try {
      rules.push({ negate, regex: globToRegExp(pattern) });
    } catch {
      // Skip malformed patterns from .gitignore parsing.
    }
  }

  return rules;
}

function isIgnoredByRules(
  relPath: string,
  rules: Array<{ negate: boolean; regex: RegExp }>,
): boolean {
  let ignored = false;
  for (const rule of rules) {
    if (rule.regex.test(relPath)) {
      ignored = !rule.negate;
    }
  }
  return ignored;
}

function walkMarkdownFiles(input: {
  rootDir: string;
  includePatterns: string[];
  excludePatterns: string[];
  maxFileBytes: number;
  maxFilesPerScan: number;
}): string[] {
  const out: string[] = [];
  const includeRegs = input.includePatterns.map((pattern) => globToRegExp(pattern));
  const excludeRegs = input.excludePatterns.map((pattern) => globToRegExp(pattern));
  const gitIgnoreRules = parseIgnoreRules(input.rootDir);

  function walk(dir: string) {
    if (out.length >= input.maxFilesPerScan) {
      return;
    }

    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules') {
        continue;
      }

      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      if (entry.isFile() && fullPath.toLowerCase().endsWith('.md')) {
        const rel = normalizeRelativePath(relative(input.rootDir, fullPath));
        if (rel === '.raven-local-sync-state.json') {
          continue;
        }

        if (includeRegs.length > 0 && !includeRegs.some((reg) => reg.test(rel))) {
          continue;
        }
        if (excludeRegs.some((reg) => reg.test(rel))) {
          continue;
        }
        if (isIgnoredByRules(rel, gitIgnoreRules)) {
          continue;
        }

        const stats = statSync(fullPath);
        if (stats.size > input.maxFileBytes) {
          continue;
        }

        out.push(fullPath);
      }
    }
  }

  walk(input.rootDir);
  return out;
}

async function getSourceSummary(
  config: ConnectorConfig,
  sourceId: string,
): Promise<SourceSummary> {
  const sources = (await post(config, 'sources/list', {})) as unknown as SourceSummary[];
  const source = sources.find((item) => item.id === sourceId);
  if (!source) {
    throw new Error(`Source not found: ${sourceId}`);
  }
  return source;
}

async function getRemoteFileMap(
  config: ConnectorConfig,
  sourceId: string,
): Promise<Map<string, string>> {
  const result = await post(config, 'sources/files', { sourceId });
  const files = Array.isArray(result) ? result : [];
  const map = new Map<string, string>();

  for (const item of files as SourceFileSummary[]) {
    if (item?.relativePath && item?.lastSyncedHash) {
      map.set(item.relativePath, item.lastSyncedHash);
    }
  }

  return map;
}

function enqueueChangedFiles(input: {
  rootDir: string;
  remoteMap: Map<string, string>;
  state: DaemonState;
  includePatterns: string[];
  excludePatterns: string[];
  maxFileBytes: number;
  maxFilesPerScan: number;
}) {
  const files = walkMarkdownFiles({
    rootDir: input.rootDir,
    includePatterns: input.includePatterns,
    excludePatterns: input.excludePatterns,
    maxFileBytes: input.maxFileBytes,
    maxFilesPerScan: input.maxFilesPerScan,
  });
  const scanned = new Set<string>();

  for (const fullPath of files) {
    const content = readFileSync(fullPath, 'utf8');
    const hash = sha256(content);
    const rel = normalizeRelativePath(relative(input.rootDir, fullPath));
    scanned.add(rel);
    const known = input.state.localHashes[rel];

    if (known === hash) {
      continue;
    }

    const queuedSame = input.state.queue.find(
      (item) => item.relativePath === rel && item.contentHash === hash,
    );

    if (!queuedSame) {
      input.state.queue.push({
        operationId: `${Date.now()}-${basename(fullPath)}-${Math.random().toString(36).slice(2)}`,
        relativePath: rel,
        content,
        contentHash: hash,
        contentType: 'text/markdown',
        baseHash: input.remoteMap.get(rel),
        attempts: 0,
        nextAttemptAt: Date.now(),
      });
    }

    input.state.localHashes[rel] = hash;
  }

  for (const rel of Object.keys(input.state.localHashes)) {
    if (scanned.has(rel)) {
      continue;
    }

    const queuedDelete = input.state.queue.some(
      (item) => item.relativePath === rel && item.isDelete,
    );
    if (!queuedDelete) {
      input.state.queue.push({
        operationId: `${Date.now()}-delete-${Math.random().toString(36).slice(2)}`,
        relativePath: rel,
        content: '',
        contentHash: sha256(''),
        contentType: 'text/markdown',
        baseHash: input.remoteMap.get(rel) || input.state.localHashes[rel],
        isDelete: true,
        attempts: 0,
        nextAttemptAt: Date.now(),
      });
    }
  }
}

async function flushQueue(input: {
  config: ConnectorConfig;
  sourceId: string;
  state: DaemonState;
}) {
  const now = Date.now();
  const ready = input.state.queue
    .filter((item) => item.nextAttemptAt <= now)
    .slice(0, 25);

  if (ready.length === 0) {
    return { attempted: 0, applied: 0, conflicts: 0 };
  }

  try {
    const result = await post(input.config, 'sources/push-batch', {
      sourceId: input.sourceId,
      items: ready.map((item) => ({
        operationId: item.operationId,
        relativePath: item.relativePath,
        content: item.content,
        contentType: item.contentType,
        contentHash: item.contentHash,
        baseHash: item.baseHash,
        isDelete: item.isDelete,
      })),
    });

    for (const item of ready) {
      if (item.isDelete) {
        delete input.state.localHashes[item.relativePath];
      } else {
        input.state.localHashes[item.relativePath] = item.contentHash;
      }
    }

    const doneIds = new Set(ready.map((item) => item.operationId));
    input.state.queue = input.state.queue.filter(
      (item) => !doneIds.has(item.operationId),
    );

    return {
      attempted: ready.length,
      applied: Number((result as any)?.applied || 0),
      conflicts: Number((result as any)?.conflicts || 0),
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);

    for (const item of ready) {
      item.attempts += 1;
      item.lastError = message;
      item.nextAttemptAt = Date.now() + computeBackoffMs(item.attempts);
    }

    return {
      attempted: ready.length,
      applied: 0,
      conflicts: 0,
      error: message,
    };
  }
}

function applyRemoteUpsert(input: {
  rootDir: string;
  state: DaemonState;
  event: DeltaEvent;
}) {
  const rel = input.event.relativePath;
  const content = input.event.payload?.content;
  const hash = input.event.payload?.hash;

  if (!rel || typeof content !== 'string') {
    return;
  }

  const queuedForFile = input.state.queue.some((item) => item.relativePath === rel);
  if (queuedForFile) {
    return;
  }

  const fullPath = join(input.rootDir, rel);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content, 'utf8');
  input.state.localHashes[rel] = hash || sha256(content);
}

function applyRemoteDelete(input: {
  rootDir: string;
  state: DaemonState;
  event: DeltaEvent;
}) {
  const rel = input.event.relativePath;
  if (!rel) {
    return;
  }

  const queuedForFile = input.state.queue.some((item) => item.relativePath === rel);
  if (queuedForFile) {
    return;
  }

  const fullPath = join(input.rootDir, rel);
  if (existsSync(fullPath)) {
    unlinkSync(fullPath);
  }
  delete input.state.localHashes[rel];
}

async function pullAndApplyRemote(input: {
  config: ConnectorConfig;
  sourceId: string;
  rootDir: string;
  state: DaemonState;
}) {
  const result = await post(input.config, 'sources/deltas', {
    sourceId: input.sourceId,
    cursor: input.state.remoteCursor,
    limit: 200,
  });

  const events = (result as any)?.events as DeltaEvent[];
  const nextCursor = Number((result as any)?.nextCursor || input.state.remoteCursor);

  if (Array.isArray(events)) {
    for (const event of events) {
      if (event.type === 'file.upsert') {
        applyRemoteUpsert({
          rootDir: input.rootDir,
          state: input.state,
          event,
        });
      } else if (event.type === 'file.delete') {
        applyRemoteDelete({
          rootDir: input.rootDir,
          state: input.state,
          event,
        });
      }
    }
  }

  input.state.remoteCursor = nextCursor;

  return {
    pulled: Array.isArray(events) ? events.length : 0,
    nextCursor,
  };
}

async function runDaemon(
  config: ConnectorConfig,
  sourceId: string,
  rootDir: string,
  intervalMs: number,
) {
  const stateFilePath = join(rootDir, '.raven-local-sync-state.json');
  const state = loadState(stateFilePath);
  let isSyncing = false;

  const initialSource = await getSourceSummary(config, sourceId);
  let mode = initialSource.mode;
  let sourceStatus = initialSource.status || 'active';
  let connectorId = initialSource.connectorId;
  let includePatterns = initialSource.includePatterns || ['**/*.md'];
  let excludePatterns = initialSource.excludePatterns || [
    '**/.git/**',
    '**/node_modules/**',
  ];
  let lastHeartbeatAt = 0;
  const maxFileBytes = DEFAULT_MAX_FILE_BYTES;
  const maxFilesPerScan = DEFAULT_MAX_FILES_PER_SCAN;

  process.stdout.write(
    `[local-connector] daemon start source=${sourceId} mode=${mode} root=${rootDir} interval=${intervalMs}ms maxFileBytes=${maxFileBytes} maxFiles=${maxFilesPerScan} state=${stateFilePath}\n`,
  );

  const tick = async () => {
    if (isSyncing) {
      return;
    }

    isSyncing = true;
    try {
      if (!statSync(rootDir).isDirectory()) {
        throw new Error(`Not a directory: ${rootDir}`);
      }

      const source = await getSourceSummary(config, sourceId);
      mode = source.mode;
      sourceStatus = source.status || 'active';
      connectorId = source.connectorId || connectorId;
      includePatterns = source.includePatterns?.length
        ? source.includePatterns
        : includePatterns;
      excludePatterns = source.excludePatterns?.length
        ? source.excludePatterns
        : excludePatterns;

      if (connectorId && Date.now() - lastHeartbeatAt >= 30_000) {
        await post(config, 'connectors/heartbeat', { connectorId });
        lastHeartbeatAt = Date.now();
      }

      if (sourceStatus === 'paused') {
        saveState(stateFilePath, state);
        return;
      }

      const remoteMap = await getRemoteFileMap(config, sourceId);
      enqueueChangedFiles({
        rootDir,
        remoteMap,
        state,
        includePatterns,
        excludePatterns,
        maxFileBytes,
        maxFilesPerScan,
      });

      const flushResult = await flushQueue({ config, sourceId, state });

      let pullResult = { pulled: 0, nextCursor: state.remoteCursor };
      if (mode === 'bidirectional') {
        pullResult = await pullAndApplyRemote({
          config,
          sourceId,
          rootDir,
          state,
        });
      }

      saveState(stateFilePath, state);

      if ((flushResult as any).error) {
        process.stderr.write(
          `[local-connector] flush failed attempted=${flushResult.attempted} queued=${state.queue.length} error=${(flushResult as any).error}\n`,
        );
      } else if (flushResult.attempted > 0 || pullResult.pulled > 0) {
        process.stdout.write(
          `[local-connector] tick pushed=${flushResult.attempted}/${flushResult.applied} conflicts=${flushResult.conflicts} pulled=${pullResult.pulled} cursor=${pullResult.nextCursor} queued=${state.queue.length}\n`,
        );
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`[local-connector] daemon tick error: ${message}\n`);
      saveState(stateFilePath, state);
    } finally {
      isSyncing = false;
    }
  };

  await tick();
  setInterval(() => {
    void tick();
  }, intervalMs);
}

async function main() {
  const command = process.argv[2];
  const config = getConfig();

  if (command === 'register') {
    const name = process.argv[3] || 'local-connector';
    const result = await post(config, 'connectors/register', {
      name,
      platform: process.platform,
      version: '0.1.0',
    });
    print(result);
    return;
  }

  if (command === 'heartbeat') {
    const connectorId = process.argv[3];
    if (!connectorId) {
      throw new Error('Usage: heartbeat <connectorId>');
    }
    const result = await post(config, 'connectors/heartbeat', { connectorId });
    print(result);
    return;
  }

  if (command === 'create-source') {
    const connectorId = process.argv[3];
    const name = process.argv[4];
    const mode = process.argv[5] || 'import_only';

    if (!connectorId || !name) {
      throw new Error(
        'Usage: create-source <connectorId> <name> [import_only|local_to_cloud|bidirectional]',
      );
    }

    const result = await post(config, 'sources', {
      connectorId,
      name,
      mode,
      includePatterns: ['**/*.md'],
      excludePatterns: ['**/.git/**', '**/node_modules/**'],
    });
    print(result);
    return;
  }

  if (command === 'list-sources') {
    const result = await post(config, 'sources/list', {});
    print(result);
    return;
  }

  if (command === 'push-batch') {
    const sourceId = process.argv[3];
    const relativePath = process.argv[4];
    const content = process.argv[5] || '';
    if (!sourceId || !relativePath) {
      throw new Error('Usage: push-batch <sourceId> <relativePath> [content]');
    }

    const contentHash = sha256(content);
    const result = await post(config, 'sources/push-batch', {
      sourceId,
      items: [
        {
          operationId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          relativePath,
          content,
          contentType: 'text/markdown',
          contentHash,
        },
      ],
    });

    print(result);
    return;
  }

  if (command === 'sync-file') {
    const sourceId = process.argv[3];
    const relativePath = process.argv[4];
    const localFilePath = process.argv[5];
    const baseHash = process.argv[6];

    if (!sourceId || !relativePath || !localFilePath) {
      throw new Error(
        'Usage: sync-file <sourceId> <relativePath> <localFilePath> [baseHash]',
      );
    }

    const content = readFileSync(localFilePath, 'utf8');
    const contentHash = sha256(content);

    const result = await post(config, 'sources/push-batch', {
      sourceId,
      items: [
        {
          operationId: `${Date.now()}-${basename(localFilePath)}`,
          relativePath,
          content,
          contentType: 'text/markdown',
          contentHash,
          baseHash,
        },
      ],
    });

    print(result);
    return;
  }

  if (command === 'deltas') {
    const sourceId = process.argv[3];
    const cursor = process.argv[4] ? Number(process.argv[4]) : 0;
    const limit = process.argv[5] ? Number(process.argv[5]) : 100;

    if (!sourceId) {
      throw new Error('Usage: deltas <sourceId> [cursor] [limit]');
    }

    const result = await post(config, 'sources/deltas', {
      sourceId,
      cursor,
      limit,
    });
    print(result);
    return;
  }

  if (command === 'conflicts') {
    const sourceId = process.argv[3];
    if (!sourceId) {
      throw new Error('Usage: conflicts <sourceId>');
    }

    const result = await post(config, 'sources/conflicts', { sourceId });
    print(result);
    return;
  }

  if (command === 'daemon') {
    const sourceId = process.argv[3];
    const rootDir = process.argv[4];
    const intervalMs = process.argv[5] ? Number(process.argv[5]) : 5000;

    if (!sourceId || !rootDir) {
      throw new Error('Usage: daemon <sourceId> <rootDir> [intervalMs]');
    }

    await runDaemon(config, sourceId, rootDir, intervalMs);
    return;
  }

  process.stdout.write(
    [
      'Usage:',
      '  pnpm --filter @raven-docs/local-connector start register [name]',
      '  pnpm --filter @raven-docs/local-connector start heartbeat <connectorId>',
      '  pnpm --filter @raven-docs/local-connector start create-source <connectorId> <name> [mode]',
      '  pnpm --filter @raven-docs/local-connector start list-sources',
      '  pnpm --filter @raven-docs/local-connector start push-batch <sourceId> <relativePath> [content]',
      '  pnpm --filter @raven-docs/local-connector start sync-file <sourceId> <relativePath> <localFilePath> [baseHash]',
      '  pnpm --filter @raven-docs/local-connector start deltas <sourceId> [cursor] [limit]',
      '  pnpm --filter @raven-docs/local-connector start conflicts <sourceId>',
      '  pnpm --filter @raven-docs/local-connector start daemon <sourceId> <rootDir> [intervalMs]',
    ].join('\n') + '\n',
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[local-connector] ${message}\n`);
  process.exit(1);
});
