import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { LocalSyncService } from './local-sync.service';
import { LocalSyncRepo } from '../../database/repos/local-sync/local-sync.repo';

describe('LocalSyncService', () => {
  let service: LocalSyncService;

  const mockRepo = {
    createConnector: jest.fn(),
    heartbeat: jest.fn(),
    getConnector: jest.fn(),
    createSource: jest.fn(),
    listSources: jest.fn(),
    getSource: jest.fn(),
    setSourceStatus: jest.fn(),
    setSourceCursor: jest.fn(),
    getFileByPath: jest.fn(),
    listFiles: jest.fn(),
    deleteFileByPath: jest.fn(),
    upsertFile: jest.fn(),
    appendEvent: jest.fn(),
    listEventsAfter: jest.fn(),
    currentCursor: jest.fn(),
    createConflict: jest.fn(),
    listOpenConflicts: jest.fn(),
    getOpenConflict: jest.fn(),
    resolveConflict: jest.fn(),
    hasProcessedOperation: jest.fn(),
    recordOperation: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocalSyncService,
        { provide: LocalSyncRepo, useValue: mockRepo },
      ],
    }).compile();

    service = module.get<LocalSyncService>(LocalSyncService);
  });

  it('registers a connector', async () => {
    mockRepo.createConnector.mockResolvedValue({ id: 'connector-1' });

    const result = await service.registerConnector({
      dto: { name: 'macbook', platform: 'darwin', version: '0.1.0' },
      workspaceId: 'ws-1',
      userId: 'user-1',
    });

    expect(result).toEqual({ id: 'connector-1' });
    expect(mockRepo.createConnector).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        createdById: 'user-1',
        name: 'macbook',
      }),
    );
  });

  it('skips already-processed operation in pushBatch', async () => {
    mockRepo.getSource.mockResolvedValue({
      id: 'source-1',
      workspaceId: 'ws-1',
      status: 'active',
    });
    mockRepo.hasProcessedOperation.mockResolvedValue(true);
    mockRepo.currentCursor.mockResolvedValue(2);

    const result = await service.pushBatch({
      workspaceId: 'ws-1',
      dto: {
        sourceId: 'source-1',
        items: [
          {
            operationId: 'op-1',
            relativePath: 'notes/a.md',
            content: 'hello',
          },
        ],
      },
    });

    expect(result.applied).toBe(0);
    expect(result.conflicts).toBe(0);
    expect(mockRepo.upsertFile).not.toHaveBeenCalled();
    expect(mockRepo.appendEvent).not.toHaveBeenCalled();
  });

  it('opens a conflict when base hash mismatches', async () => {
    mockRepo.getSource.mockResolvedValue({
      id: 'source-1',
      workspaceId: 'ws-1',
      status: 'active',
    });

    mockRepo.hasProcessedOperation.mockResolvedValue(false);
    mockRepo.getFileByPath.mockResolvedValue({
      id: 'file-1',
      relativePath: 'notes/a.md',
      contentType: 'text/markdown',
      content: 'remote-content',
      lastSyncedHash: 'remote-base',
      lastRemoteHash: 'remote-hash',
      lastLocalHash: 'remote-hash',
      versions: [],
    });

    mockRepo.createConflict.mockResolvedValue({
      id: 'conflict-1',
      localHash: 'new-hash',
      remoteHash: 'remote-hash',
    });
    mockRepo.currentCursor.mockResolvedValue(3);

    const result = await service.pushBatch({
      workspaceId: 'ws-1',
      dto: {
        sourceId: 'source-1',
        items: [
          {
            operationId: 'op-2',
            relativePath: 'notes/a.md',
            content: 'local-content',
            baseHash: 'stale-base',
          },
        ],
      },
    });

    expect(result.applied).toBe(0);
    expect(result.conflicts).toBe(1);
    expect(mockRepo.createConflict).toHaveBeenCalled();
    expect(mockRepo.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'conflict.opened' }),
    );
  });

  it('requires resolvedContent for manual_merge', async () => {
    mockRepo.getSource.mockResolvedValue({
      id: 'source-1',
      workspaceId: 'ws-1',
      status: 'active',
    });

    mockRepo.getOpenConflict.mockResolvedValue({
      id: 'conflict-1',
      relativePath: 'notes/a.md',
      localContent: 'local',
      remoteContent: 'remote',
    });

    mockRepo.getFileByPath.mockResolvedValue({
      id: 'file-1',
      relativePath: 'notes/a.md',
      contentType: 'text/markdown',
      content: 'remote',
      versions: [],
    });

    await expect(
      service.resolveConflict({
        workspaceId: 'ws-1',
        dto: {
          sourceId: 'source-1',
          conflictId: 'conflict-1',
          resolution: 'manual_merge',
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('handles delete item in pushBatch', async () => {
    mockRepo.getSource.mockResolvedValue({
      id: 'source-1',
      workspaceId: 'ws-1',
      status: 'active',
    });
    mockRepo.hasProcessedOperation.mockResolvedValue(false);
    mockRepo.getFileByPath.mockResolvedValue({
      id: 'file-1',
      relativePath: 'notes/a.md',
      contentType: 'text/markdown',
      content: 'hello',
      lastSyncedHash: 'h1',
      lastRemoteHash: 'h1',
      lastLocalHash: 'h1',
      versions: [],
    });
    mockRepo.currentCursor.mockResolvedValue(4);

    const result = await service.pushBatch({
      workspaceId: 'ws-1',
      dto: {
        sourceId: 'source-1',
        items: [
          {
            operationId: 'op-delete-1',
            relativePath: 'notes/a.md',
            content: '',
            isDelete: true,
            baseHash: 'h1',
          },
        ],
      },
    });

    expect(result.applied).toBe(1);
    expect(result.conflicts).toBe(0);
    expect(mockRepo.deleteFileByPath).toHaveBeenCalledWith('source-1', 'notes/a.md');
    expect(mockRepo.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'file.delete' }),
    );
  });

  it('blocks raven updates for non-bidirectional sources', async () => {
    mockRepo.getSource.mockResolvedValue({
      id: 'source-1',
      workspaceId: 'ws-1',
      status: 'active',
      mode: 'import_only',
    });

    await expect(
      service.updateFileFromRaven({
        sourceId: 'source-1',
        relativePath: 'notes/a.md',
        content: 'updated',
        workspaceId: 'ws-1',
        userId: 'user-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
