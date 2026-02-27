import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '../../types/kysely.types';
import { sql } from 'kysely';
import {
  LocalConnectorRecord,
  LocalSyncConflictRecord,
  LocalSyncEventRecord,
  LocalSyncFileRecord,
  LocalSyncFileState,
  LocalSyncMode,
  LocalSyncResolution,
  LocalSyncSourceRecord,
  LocalSyncVersion,
} from '../../../core/local-sync/local-sync.types';

interface ConnectorRow {
  id: string;
  workspace_id: string;
  created_by_id: string;
  name: string;
  platform: string;
  version: string | null;
  status: 'online' | 'offline';
  last_heartbeat_at: Date;
  created_at: Date;
  updated_at: Date;
}

interface SourceRow {
  id: string;
  workspace_id: string;
  created_by_id: string;
  name: string;
  mode: LocalSyncMode;
  connector_id: string;
  status: 'active' | 'paused';
  last_remote_cursor: number;
  include_patterns: string[] | null;
  exclude_patterns: string[] | null;
  created_at: Date;
  updated_at: Date;
}

interface FileRow {
  id: string;
  source_id: string;
  relative_path: string;
  content_type: string;
  content: string;
  last_synced_hash: string;
  last_local_hash: string;
  last_remote_hash: string;
  last_synced_at: Date;
  state: LocalSyncFileState;
  versions: unknown;
}

interface EventRow {
  id: string;
  source_id: string;
  cursor: number;
  type: LocalSyncEventRecord['type'];
  relative_path: string | null;
  payload: unknown;
  created_at: Date;
}

interface ConflictRow {
  id: string;
  source_id: string;
  file_id: string;
  relative_path: string;
  base_hash: string;
  local_hash: string;
  remote_hash: string;
  local_content: string;
  remote_content: string;
  status: 'open' | 'resolved';
  resolution: LocalSyncResolution | null;
  resolved_content: string | null;
  resolved_at: Date | null;
  created_at: Date;
}

@Injectable()
export class LocalSyncRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async createConnector(input: {
    workspaceId: string;
    createdById: string;
    name: string;
    platform: string;
    version?: string;
  }): Promise<LocalConnectorRecord> {
    const result = await sql<ConnectorRow>`
      INSERT INTO local_sync_connectors (
        workspace_id,
        created_by_id,
        name,
        platform,
        version,
        status,
        last_heartbeat_at
      ) VALUES (
        ${input.workspaceId}::uuid,
        ${input.createdById}::uuid,
        ${input.name},
        ${input.platform},
        ${input.version || null},
        'online',
        now()
      )
      RETURNING *
    `.execute(this.db);

    return this.mapConnector(result.rows[0]);
  }

  async heartbeat(connectorId: string, workspaceId: string) {
    const result = await sql<ConnectorRow>`
      UPDATE local_sync_connectors
      SET status = 'online',
          last_heartbeat_at = now(),
          updated_at = now()
      WHERE id = ${connectorId}::uuid
        AND workspace_id = ${workspaceId}::uuid
      RETURNING *
    `.execute(this.db);

    return result.rows[0] ? this.mapConnector(result.rows[0]) : null;
  }

  async getConnector(connectorId: string, workspaceId: string) {
    const result = await sql<ConnectorRow>`
      SELECT *
      FROM local_sync_connectors
      WHERE id = ${connectorId}::uuid
        AND workspace_id = ${workspaceId}::uuid
    `.execute(this.db);

    return result.rows[0] ? this.mapConnector(result.rows[0]) : null;
  }

  async createSource(input: {
    workspaceId: string;
    createdById: string;
    name: string;
    mode: LocalSyncMode;
    connectorId: string;
    includePatterns: string[];
    excludePatterns: string[];
  }): Promise<LocalSyncSourceRecord> {
    const result = await sql<SourceRow>`
      INSERT INTO local_sync_sources (
        workspace_id,
        created_by_id,
        name,
        mode,
        connector_id,
        status,
        include_patterns,
        exclude_patterns
      ) VALUES (
        ${input.workspaceId}::uuid,
        ${input.createdById}::uuid,
        ${input.name},
        ${input.mode},
        ${input.connectorId}::uuid,
        'active',
        ${JSON.stringify(input.includePatterns)}::jsonb,
        ${JSON.stringify(input.excludePatterns)}::jsonb
      )
      RETURNING *
    `.execute(this.db);

    return this.mapSource(result.rows[0]);
  }

  async listSources(workspaceId: string): Promise<LocalSyncSourceRecord[]> {
    const result = await sql<SourceRow>`
      SELECT *
      FROM local_sync_sources
      WHERE workspace_id = ${workspaceId}::uuid
      ORDER BY created_at DESC
    `.execute(this.db);

    return result.rows.map((row) => this.mapSource(row));
  }

  async getSource(sourceId: string, workspaceId: string) {
    const result = await sql<SourceRow>`
      SELECT *
      FROM local_sync_sources
      WHERE id = ${sourceId}::uuid
        AND workspace_id = ${workspaceId}::uuid
    `.execute(this.db);

    return result.rows[0] ? this.mapSource(result.rows[0]) : null;
  }

  async setSourceStatus(sourceId: string, status: 'active' | 'paused') {
    const result = await sql<SourceRow>`
      UPDATE local_sync_sources
      SET status = ${status},
          updated_at = now()
      WHERE id = ${sourceId}::uuid
      RETURNING *
    `.execute(this.db);

    return result.rows[0] ? this.mapSource(result.rows[0]) : null;
  }

  async setSourceCursor(sourceId: string, cursor: number) {
    await sql`
      UPDATE local_sync_sources
      SET last_remote_cursor = ${cursor},
          updated_at = now()
      WHERE id = ${sourceId}::uuid
    `.execute(this.db);
  }

  async getFileByPath(sourceId: string, relativePath: string) {
    const result = await sql<FileRow>`
      SELECT *
      FROM local_sync_files
      WHERE source_id = ${sourceId}::uuid
        AND relative_path = ${relativePath}
    `.execute(this.db);

    return result.rows[0] ? this.mapFile(result.rows[0]) : null;
  }

  async listFiles(sourceId: string): Promise<LocalSyncFileRecord[]> {
    const result = await sql<FileRow>`
      SELECT *
      FROM local_sync_files
      WHERE source_id = ${sourceId}::uuid
      ORDER BY relative_path ASC
    `.execute(this.db);

    return result.rows.map((row) => this.mapFile(row));
  }

  async upsertFile(input: {
    sourceId: string;
    relativePath: string;
    contentType: string;
    content: string;
    lastSyncedHash: string;
    lastLocalHash: string;
    lastRemoteHash: string;
    state: LocalSyncFileState;
    versions: LocalSyncVersion[];
  }) {
    const result = await sql<FileRow>`
      INSERT INTO local_sync_files (
        source_id,
        relative_path,
        content_type,
        content,
        last_synced_hash,
        last_local_hash,
        last_remote_hash,
        last_synced_at,
        state,
        versions
      ) VALUES (
        ${input.sourceId}::uuid,
        ${input.relativePath},
        ${input.contentType},
        ${input.content},
        ${input.lastSyncedHash},
        ${input.lastLocalHash},
        ${input.lastRemoteHash},
        now(),
        ${input.state},
        ${JSON.stringify(input.versions)}::jsonb
      )
      ON CONFLICT (source_id, relative_path)
      DO UPDATE SET
        content_type = EXCLUDED.content_type,
        content = EXCLUDED.content,
        last_synced_hash = EXCLUDED.last_synced_hash,
        last_local_hash = EXCLUDED.last_local_hash,
        last_remote_hash = EXCLUDED.last_remote_hash,
        last_synced_at = now(),
        state = EXCLUDED.state,
        versions = EXCLUDED.versions
      RETURNING *
    `.execute(this.db);

    return this.mapFile(result.rows[0]);
  }

  async appendEvent(input: {
    sourceId: string;
    type: LocalSyncEventRecord['type'];
    relativePath?: string;
    payload: Record<string, unknown>;
  }) {
    const result = await sql<EventRow>`
      INSERT INTO local_sync_events (
        source_id,
        type,
        relative_path,
        payload
      ) VALUES (
        ${input.sourceId}::uuid,
        ${input.type},
        ${input.relativePath || null},
        ${JSON.stringify(input.payload)}::jsonb
      )
      RETURNING *
    `.execute(this.db);

    return this.mapEvent(result.rows[0]);
  }

  async listEventsAfter(sourceId: string, cursor: number, limit: number) {
    const result = await sql<EventRow>`
      SELECT *
      FROM local_sync_events
      WHERE source_id = ${sourceId}::uuid
        AND cursor > ${cursor}
      ORDER BY cursor ASC
      LIMIT ${limit}
    `.execute(this.db);

    return result.rows.map((row) => this.mapEvent(row));
  }

  async currentCursor(sourceId: string): Promise<number> {
    const result = await sql<{ cursor: number | null }>`
      SELECT max(cursor) as cursor
      FROM local_sync_events
      WHERE source_id = ${sourceId}::uuid
    `.execute(this.db);

    return Number(result.rows[0]?.cursor || 0);
  }

  async createConflict(input: {
    sourceId: string;
    fileId: string;
    relativePath: string;
    baseHash: string;
    localHash: string;
    remoteHash: string;
    localContent: string;
    remoteContent: string;
  }) {
    const result = await sql<ConflictRow>`
      INSERT INTO local_sync_conflicts (
        source_id,
        file_id,
        relative_path,
        base_hash,
        local_hash,
        remote_hash,
        local_content,
        remote_content,
        status
      ) VALUES (
        ${input.sourceId}::uuid,
        ${input.fileId}::uuid,
        ${input.relativePath},
        ${input.baseHash},
        ${input.localHash},
        ${input.remoteHash},
        ${input.localContent},
        ${input.remoteContent},
        'open'
      )
      RETURNING *
    `.execute(this.db);

    return this.mapConflict(result.rows[0]);
  }

  async listOpenConflicts(sourceId: string) {
    const result = await sql<ConflictRow>`
      SELECT *
      FROM local_sync_conflicts
      WHERE source_id = ${sourceId}::uuid
        AND status = 'open'
      ORDER BY created_at DESC
    `.execute(this.db);

    return result.rows.map((row) => this.mapConflict(row));
  }

  async getOpenConflict(sourceId: string, conflictId: string) {
    const result = await sql<ConflictRow>`
      SELECT *
      FROM local_sync_conflicts
      WHERE source_id = ${sourceId}::uuid
        AND id = ${conflictId}::uuid
        AND status = 'open'
    `.execute(this.db);

    return result.rows[0] ? this.mapConflict(result.rows[0]) : null;
  }

  async resolveConflict(input: {
    sourceId: string;
    conflictId: string;
    resolution: LocalSyncResolution;
    resolvedContent: string;
  }) {
    const result = await sql<ConflictRow>`
      UPDATE local_sync_conflicts
      SET status = 'resolved',
          resolution = ${input.resolution},
          resolved_content = ${input.resolvedContent},
          resolved_at = now()
      WHERE source_id = ${input.sourceId}::uuid
        AND id = ${input.conflictId}::uuid
      RETURNING *
    `.execute(this.db);

    return result.rows[0] ? this.mapConflict(result.rows[0]) : null;
  }

  async hasProcessedOperation(sourceId: string, operationId: string): Promise<boolean> {
    const result = await sql<{ found: number }>`
      SELECT 1 as found
      FROM local_sync_operations
      WHERE source_id = ${sourceId}::uuid
        AND operation_id = ${operationId}
      LIMIT 1
    `.execute(this.db);

    return result.rows.length > 0;
  }

  async recordOperation(sourceId: string, operationId: string) {
    await sql`
      INSERT INTO local_sync_operations (
        source_id,
        operation_id
      ) VALUES (
        ${sourceId}::uuid,
        ${operationId}
      )
      ON CONFLICT (source_id, operation_id) DO NOTHING
    `.execute(this.db);
  }

  private mapConnector(row: ConnectorRow): LocalConnectorRecord {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      createdById: row.created_by_id,
      name: row.name,
      platform: row.platform,
      version: row.version || undefined,
      status: row.status,
      lastHeartbeatAt: row.last_heartbeat_at.toISOString(),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private mapSource(row: SourceRow): LocalSyncSourceRecord {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      createdById: row.created_by_id,
      name: row.name,
      mode: row.mode,
      connectorId: row.connector_id,
      status: row.status,
      lastRemoteCursor: row.last_remote_cursor,
      includePatterns: row.include_patterns || [],
      excludePatterns: row.exclude_patterns || [],
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private mapFile(row: FileRow): LocalSyncFileRecord {
    return {
      id: row.id,
      sourceId: row.source_id,
      relativePath: row.relative_path,
      contentType: row.content_type,
      content: row.content,
      lastSyncedHash: row.last_synced_hash,
      lastLocalHash: row.last_local_hash,
      lastRemoteHash: row.last_remote_hash,
      lastSyncedAt: row.last_synced_at.toISOString(),
      state: row.state,
      versions: (row.versions as LocalSyncVersion[]) || [],
    };
  }

  private mapEvent(row: EventRow): LocalSyncEventRecord {
    return {
      id: row.id,
      sourceId: row.source_id,
      cursor: row.cursor,
      type: row.type,
      relativePath: row.relative_path || undefined,
      payload: (row.payload as Record<string, unknown>) || {},
      createdAt: row.created_at.toISOString(),
    };
  }

  private mapConflict(row: ConflictRow): LocalSyncConflictRecord {
    return {
      id: row.id,
      sourceId: row.source_id,
      fileId: row.file_id,
      relativePath: row.relative_path,
      baseHash: row.base_hash,
      localHash: row.local_hash,
      remoteHash: row.remote_hash,
      localContent: row.local_content,
      remoteContent: row.remote_content,
      status: row.status,
      resolution: row.resolution || undefined,
      resolvedContent: row.resolved_content || undefined,
      resolvedAt: row.resolved_at ? row.resolved_at.toISOString() : undefined,
      createdAt: row.created_at.toISOString(),
    };
  }
}
