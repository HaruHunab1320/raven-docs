export type LocalSyncMode =
  | 'import_only'
  | 'local_to_cloud'
  | 'bidirectional';

export type LocalSyncSourceStatus = 'active' | 'paused';

export type LocalSyncFileState = 'ok' | 'conflict' | 'paused';

export type LocalSyncEventType =
  | 'file.upsert'
  | 'file.delete'
  | 'conflict.opened'
  | 'conflict.resolved'
  | 'source.paused'
  | 'source.resumed';

export type LocalSyncResolution = 'keep_local' | 'keep_raven' | 'manual_merge';

export interface LocalConnectorRecord {
  id: string;
  workspaceId: string;
  createdById: string;
  name: string;
  platform: string;
  version?: string;
  status: 'online' | 'offline';
  lastHeartbeatAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface LocalSyncVersion {
  hash: string;
  content: string;
  recordedAt: string;
  origin: 'connector' | 'raven' | 'merge';
}

export interface LocalSyncFileRecord {
  id: string;
  sourceId: string;
  relativePath: string;
  contentType: string;
  content: string;
  lastSyncedHash: string;
  lastLocalHash: string;
  lastRemoteHash: string;
  lastSyncedAt: string;
  state: LocalSyncFileState;
  versions: LocalSyncVersion[];
}

export interface LocalSyncSourceRecord {
  id: string;
  workspaceId: string;
  createdById: string;
  name: string;
  mode: LocalSyncMode;
  connectorId: string;
  status: LocalSyncSourceStatus;
  lastRemoteCursor: number;
  includePatterns: string[];
  excludePatterns: string[];
  createdAt: string;
  updatedAt: string;
}

export interface LocalSyncEventRecord {
  id: string;
  sourceId: string;
  cursor: number;
  type: LocalSyncEventType;
  relativePath?: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface LocalSyncConflictRecord {
  id: string;
  sourceId: string;
  fileId: string;
  relativePath: string;
  baseHash: string;
  localHash: string;
  remoteHash: string;
  localContent: string;
  remoteContent: string;
  status: 'open' | 'resolved';
  resolution?: LocalSyncResolution;
  resolvedContent?: string;
  resolvedAt?: string;
  createdAt: string;
}
