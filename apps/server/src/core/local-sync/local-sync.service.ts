import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import {
  CreateLocalSyncSourceDto,
  PushBatchDto,
  RegisterConnectorDto,
  ResolveConflictDto,
} from './dto/local-sync.dto';
import { LocalSyncVersion } from './local-sync.types';
import { LocalSyncRepo } from '../../database/repos/local-sync/local-sync.repo';

@Injectable()
export class LocalSyncService {
  private readonly logger = new Logger(LocalSyncService.name);

  constructor(private readonly localSyncRepo: LocalSyncRepo) {}

  registerConnector(input: {
    dto: RegisterConnectorDto;
    workspaceId: string;
    userId: string;
  }) {
    return this.localSyncRepo.createConnector({
      workspaceId: input.workspaceId,
      createdById: input.userId,
      name: input.dto.name,
      platform: input.dto.platform,
      version: input.dto.version,
    });
  }

  async heartbeat(input: { connectorId: string; workspaceId: string }) {
    const connector = await this.localSyncRepo.heartbeat(
      input.connectorId,
      input.workspaceId,
    );

    if (!connector) {
      throw new NotFoundException('Connector not found');
    }

    return {
      connectorId: connector.id,
      status: connector.status,
      lastHeartbeatAt: connector.lastHeartbeatAt,
    };
  }

  async createSource(input: {
    dto: CreateLocalSyncSourceDto;
    workspaceId: string;
    userId: string;
  }) {
    const connector = await this.localSyncRepo.getConnector(
      input.dto.connectorId,
      input.workspaceId,
    );

    if (!connector) {
      throw new BadRequestException('Invalid connectorId for this workspace');
    }

    return this.localSyncRepo.createSource({
      workspaceId: input.workspaceId,
      createdById: input.userId,
      name: input.dto.name,
      mode: input.dto.mode,
      connectorId: input.dto.connectorId,
      includePatterns: input.dto.includePatterns || [],
      excludePatterns: input.dto.excludePatterns || [],
    });
  }

  listSources(workspaceId: string) {
    return this.localSyncRepo.listSources(workspaceId);
  }

  async getFiles(input: { sourceId: string; workspaceId: string }) {
    await this.requireSource(input.sourceId, input.workspaceId);
    const files = await this.localSyncRepo.listFiles(input.sourceId);

    return files.map((file) => ({
      id: file.id,
      sourceId: file.sourceId,
      relativePath: file.relativePath,
      contentType: file.contentType,
      lastSyncedHash: file.lastSyncedHash,
      lastSyncedAt: file.lastSyncedAt,
      state: file.state,
    }));
  }

  async pushBatch(input: {
    dto: PushBatchDto;
    workspaceId: string;
  }) {
    const source = await this.requireSource(input.dto.sourceId, input.workspaceId);
    if (source.status === 'paused') {
      throw new BadRequestException('Source is paused');
    }

    let applied = 0;
    let openedConflicts = 0;

    for (const item of input.dto.items) {
      const alreadyProcessed = await this.localSyncRepo.hasProcessedOperation(
        source.id,
        item.operationId,
      );

      if (alreadyProcessed) {
        continue;
      }

      const current = await this.localSyncRepo.getFileByPath(
        source.id,
        item.relativePath,
      );

      const nextHash = item.contentHash || this.sha256(item.content);

      if (
        current &&
        item.baseHash &&
        current.lastSyncedHash &&
        item.baseHash !== current.lastSyncedHash
      ) {
        const conflict = await this.localSyncRepo.createConflict({
          sourceId: source.id,
          fileId: current.id,
          relativePath: item.relativePath,
          baseHash: item.baseHash,
          localHash: nextHash,
          remoteHash: current.lastRemoteHash,
          localContent: item.content,
          remoteContent: current.content,
        });

        await this.localSyncRepo.upsertFile({
          sourceId: source.id,
          relativePath: current.relativePath,
          contentType: current.contentType,
          content: current.content,
          lastSyncedHash: current.lastSyncedHash,
          lastLocalHash: current.lastLocalHash,
          lastRemoteHash: current.lastRemoteHash,
          state: 'conflict',
          versions: current.versions,
        });

        await this.localSyncRepo.appendEvent({
          sourceId: source.id,
          type: 'conflict.opened',
          relativePath: item.relativePath,
          payload: {
            conflictId: conflict.id,
            localHash: conflict.localHash,
            remoteHash: conflict.remoteHash,
          },
        });

        await this.localSyncRepo.recordOperation(source.id, item.operationId);
        openedConflicts += 1;
        continue;
      }

      const history: LocalSyncVersion[] = [...(current?.versions || [])];
      history.push({
        hash: nextHash,
        content: item.content,
        recordedAt: new Date().toISOString(),
        origin: 'connector',
      });

      const file = await this.localSyncRepo.upsertFile({
        sourceId: source.id,
        relativePath: item.relativePath,
        contentType: item.contentType || current?.contentType || 'text/markdown',
        content: item.content,
        lastSyncedHash: nextHash,
        lastLocalHash: nextHash,
        lastRemoteHash: nextHash,
        state: 'ok',
        versions: history,
      });

      await this.localSyncRepo.appendEvent({
        sourceId: source.id,
        type: 'file.upsert',
        relativePath: item.relativePath,
        payload: {
          operationId: item.operationId,
          hash: nextHash,
          contentType: file.contentType,
          content: item.content,
        },
      });

      await this.localSyncRepo.recordOperation(source.id, item.operationId);
      applied += 1;
    }

    const eventCursor = await this.localSyncRepo.currentCursor(source.id);

    this.logger.debug(
      `Processed push batch for source ${source.id}: applied=${applied}, conflicts=${openedConflicts}`,
    );

    return {
      sourceId: source.id,
      applied,
      conflicts: openedConflicts,
      eventCursor,
    };
  }

  async getDeltas(input: {
    sourceId: string;
    workspaceId: string;
    cursor?: number;
    limit?: number;
  }) {
    const source = await this.requireSource(input.sourceId, input.workspaceId);
    const startCursor = input.cursor || 0;
    const limit = input.limit || 100;

    const events = await this.localSyncRepo.listEventsAfter(
      source.id,
      startCursor,
      limit,
    );

    const nextCursor = events.length > 0 ? events[events.length - 1].cursor : startCursor;
    await this.localSyncRepo.setSourceCursor(source.id, nextCursor);

    return {
      sourceId: source.id,
      cursor: startCursor,
      nextCursor,
      events,
    };
  }

  async getConflicts(input: { sourceId: string; workspaceId: string }) {
    const source = await this.requireSource(input.sourceId, input.workspaceId);
    return this.localSyncRepo.listOpenConflicts(source.id);
  }

  async getConflictPreview(input: {
    sourceId: string;
    conflictId: string;
    workspaceId: string;
    contextLines?: number;
  }) {
    const source = await this.requireSource(input.sourceId, input.workspaceId);
    const conflict = await this.localSyncRepo.getOpenConflict(source.id, input.conflictId);

    if (!conflict) {
      throw new NotFoundException('Open conflict not found');
    }

    const changes = this.computeLineDiff(conflict.localContent, conflict.remoteContent);

    return {
      conflictId: conflict.id,
      relativePath: conflict.relativePath,
      baseHash: conflict.baseHash,
      localHash: conflict.localHash,
      remoteHash: conflict.remoteHash,
      summary: {
        localLines: conflict.localContent.split('\n').length,
        remoteLines: conflict.remoteContent.split('\n').length,
        differentLines: changes.length,
      },
      changes: changes.slice(0, 500),
    };
  }

  async resolveConflict(input: { dto: ResolveConflictDto; workspaceId: string }) {
    const source = await this.requireSource(input.dto.sourceId, input.workspaceId);
    const conflict = await this.localSyncRepo.getOpenConflict(
      source.id,
      input.dto.conflictId,
    );

    if (!conflict) {
      throw new NotFoundException('Open conflict not found');
    }

    const file = await this.localSyncRepo.getFileByPath(source.id, conflict.relativePath);
    if (!file) {
      throw new NotFoundException('File not found for conflict');
    }

    let resolvedContent = conflict.remoteContent;

    if (input.dto.resolution === 'keep_local') {
      resolvedContent = conflict.localContent;
    } else if (input.dto.resolution === 'manual_merge') {
      if (!input.dto.resolvedContent) {
        throw new BadRequestException('resolvedContent is required for manual_merge');
      }
      resolvedContent = input.dto.resolvedContent;
    }

    const nextHash = this.sha256(resolvedContent);
    const nextVersions: LocalSyncVersion[] = [...file.versions, {
      hash: nextHash,
      content: resolvedContent,
      recordedAt: new Date().toISOString(),
      origin: 'merge',
    }];

    await this.localSyncRepo.upsertFile({
      sourceId: source.id,
      relativePath: file.relativePath,
      contentType: file.contentType,
      content: resolvedContent,
      lastSyncedHash: nextHash,
      lastLocalHash: nextHash,
      lastRemoteHash: nextHash,
      state: 'ok',
      versions: nextVersions,
    });

    const resolved = await this.localSyncRepo.resolveConflict({
      sourceId: source.id,
      conflictId: conflict.id,
      resolution: input.dto.resolution,
      resolvedContent,
    });

    await this.localSyncRepo.appendEvent({
      sourceId: source.id,
      type: 'conflict.resolved',
      relativePath: conflict.relativePath,
      payload: {
        conflictId: conflict.id,
        resolution: input.dto.resolution,
        hash: nextHash,
        content: resolvedContent,
      },
    });


    await this.localSyncRepo.appendEvent({
      sourceId: source.id,
      type: 'file.upsert',
      relativePath: conflict.relativePath,
      payload: {
        operationId: `resolve-${conflict.id}`,
        hash: nextHash,
        contentType: file.contentType,
        content: resolvedContent,
      },
    });
    return {
      conflictId: conflict.id,
      status: resolved?.status || 'resolved',
      resolution: resolved?.resolution || input.dto.resolution,
      resolvedAt: resolved?.resolvedAt || new Date().toISOString(),
    };
  }

  async pauseSource(input: { sourceId: string; workspaceId: string }) {
    const source = await this.requireSource(input.sourceId, input.workspaceId);
    const updated = await this.localSyncRepo.setSourceStatus(source.id, 'paused');

    await this.localSyncRepo.appendEvent({
      sourceId: source.id,
      type: 'source.paused',
      payload: {},
    });

    return updated;
  }

  async resumeSource(input: { sourceId: string; workspaceId: string }) {
    const source = await this.requireSource(input.sourceId, input.workspaceId);
    const updated = await this.localSyncRepo.setSourceStatus(source.id, 'active');

    await this.localSyncRepo.appendEvent({
      sourceId: source.id,
      type: 'source.resumed',
      payload: {},
    });

    return updated;
  }

  async getFileHistory(input: {
    sourceId: string;
    workspaceId: string;
    relativePath: string;
  }) {
    const source = await this.requireSource(input.sourceId, input.workspaceId);
    const file = await this.localSyncRepo.getFileByPath(source.id, input.relativePath);

    if (!file) {
      throw new NotFoundException('File not found');
    }

    return {
      sourceId: source.id,
      relativePath: file.relativePath,
      versions: file.versions,
    };
  }

  private async requireSource(sourceId: string, workspaceId: string) {
    const source = await this.localSyncRepo.getSource(sourceId, workspaceId);
    if (!source) {
      throw new NotFoundException('Local sync source not found');
    }

    return source;
  }

  private computeLineDiff(localContent: string, remoteContent: string) {
    const localLines = localContent.split('\n');
    const remoteLines = remoteContent.split('\n');
    const max = Math.max(localLines.length, remoteLines.length);
    const changes: Array<{ line: number; local: string; remote: string }> = [];

    for (let i = 0; i < max; i += 1) {
      const local = localLines[i] ?? '';
      const remote = remoteLines[i] ?? '';
      if (local !== remote) {
        changes.push({ line: i + 1, local, remote });
      }
    }

    return changes;
  }

  private sha256(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }
}
