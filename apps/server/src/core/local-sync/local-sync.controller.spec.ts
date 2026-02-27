import { Test, TestingModule } from '@nestjs/testing';
import { LocalSyncController } from './local-sync.controller';
import { LocalSyncService } from './local-sync.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

describe('LocalSyncController', () => {
  let controller: LocalSyncController;

  const mockService = {
    registerConnector: jest.fn(),
    heartbeat: jest.fn(),
    createSource: jest.fn(),
    listSources: jest.fn(),
    getFiles: jest.fn(),
    pushBatch: jest.fn(),
    getDeltas: jest.fn(),
    getConflicts: jest.fn(),
    getConflictPreview: jest.fn(),
    resolveConflict: jest.fn(),
    pauseSource: jest.fn(),
    resumeSource: jest.fn(),
    getFileHistory: jest.fn(),
  };

  const workspace = { id: 'ws-1' } as any;
  const user = { id: 'user-1' } as any;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LocalSyncController],
      providers: [{ provide: LocalSyncService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<LocalSyncController>(LocalSyncController);
  });

  it('registerConnector delegates to service', async () => {
    mockService.registerConnector.mockResolvedValue({ id: 'connector-1' });

    const result = await controller.registerConnector(
      { name: 'mac', platform: 'darwin' } as any,
      workspace,
      user,
    );

    expect(result).toEqual({ id: 'connector-1' });
    expect(mockService.registerConnector).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        userId: 'user-1',
      }),
    );
  });

  it('pushBatch delegates to service with workspace context', async () => {
    mockService.pushBatch.mockResolvedValue({ applied: 1, conflicts: 0 });

    const dto = {
      sourceId: 'source-1',
      items: [
        {
          operationId: 'op-1',
          relativePath: 'a.md',
          content: 'hello',
        },
      ],
    };

    const result = await controller.pushBatch(dto as any, workspace);

    expect(result).toEqual({ applied: 1, conflicts: 0 });
    expect(mockService.pushBatch).toHaveBeenCalledWith({
      dto,
      workspaceId: 'ws-1',
    });
  });

  it('getConflictPreview delegates to service', async () => {
    mockService.getConflictPreview.mockResolvedValue({
      conflictId: 'conflict-1',
      changes: [],
    });

    const result = await controller.getConflictPreview(
      {
        sourceId: 'source-1',
        conflictId: 'conflict-1',
        contextLines: 5,
      } as any,
      workspace,
    );

    expect(result).toEqual({ conflictId: 'conflict-1', changes: [] });
    expect(mockService.getConflictPreview).toHaveBeenCalledWith({
      sourceId: 'source-1',
      conflictId: 'conflict-1',
      workspaceId: 'ws-1',
      contextLines: 5,
    });
  });

  it('resolveConflict delegates to service', async () => {
    mockService.resolveConflict.mockResolvedValue({
      conflictId: 'conflict-1',
      status: 'resolved',
    });

    const dto = {
      sourceId: 'source-1',
      conflictId: 'conflict-1',
      resolution: 'keep_local',
    };

    const result = await controller.resolveConflict(dto as any, workspace);

    expect(result).toEqual({ conflictId: 'conflict-1', status: 'resolved' });
    expect(mockService.resolveConflict).toHaveBeenCalledWith({
      dto,
      workspaceId: 'ws-1',
    });
  });
});
