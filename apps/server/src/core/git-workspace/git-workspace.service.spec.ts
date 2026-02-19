import { Test, TestingModule } from '@nestjs/testing';
import { GitWorkspaceService } from './git-workspace.service';
import { CodingWorkspaceRepo } from '../../database/repos/coding-swarm/coding-workspace.repo';
import { WorkspaceRepo } from '../../database/repos/workspace/workspace.repo';

// Mock the git-workspace-service package
jest.mock('git-workspace-service', () => ({
  WorkspaceService: jest.fn().mockImplementation(() => ({
    provision: jest.fn(),
    finalize: jest.fn(),
    cleanup: jest.fn(),
  })),
  CredentialService: jest.fn().mockImplementation(() => ({})),
}));

describe('GitWorkspaceService', () => {
  let service: GitWorkspaceService;
  let codingWorkspaceRepo: CodingWorkspaceRepo;
  let workspaceRepo: WorkspaceRepo;

  const mockCodingWorkspaceRepo = {
    create: jest.fn(),
    findById: jest.fn(),
    findByExperiment: jest.fn(),
    findByWorkspace: jest.fn(),
    updateStatus: jest.fn(),
    update: jest.fn(),
  };

  const mockWorkspaceRepo = {
    findById: jest.fn(),
  };

  const mockDb = {
    selectFrom: jest.fn(),
    updateTable: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GitWorkspaceService,
        { provide: CodingWorkspaceRepo, useValue: mockCodingWorkspaceRepo },
        { provide: WorkspaceRepo, useValue: mockWorkspaceRepo },
        { provide: 'KyselyModuleConnectionToken', useValue: mockDb },
      ],
    }).compile();

    service = module.get<GitWorkspaceService>(GitWorkspaceService);
    codingWorkspaceRepo = module.get<CodingWorkspaceRepo>(CodingWorkspaceRepo);
    workspaceRepo = module.get<WorkspaceRepo>(WorkspaceRepo);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('provision', () => {
    const provisionConfig = {
      workspaceId: 'workspace-123',
      repoUrl: 'https://github.com/org/repo',
      experimentId: 'exp-12345678-abcd',
      spaceId: 'space-456',
      baseBranch: 'main',
    };

    it('should create a coding workspace record and provision via git-workspace-service', async () => {
      const mockRecord = {
        id: 'cw-001',
        ...provisionConfig,
        branch: 'experiment/exp-1234',
        status: 'pending',
      };

      mockCodingWorkspaceRepo.create.mockResolvedValue(mockRecord);
      mockCodingWorkspaceRepo.updateStatus.mockResolvedValue(mockRecord);
      mockWorkspaceRepo.findById.mockResolvedValue({
        id: 'workspace-123',
        settings: { integrations: { githubPat: 'test-pat-token' } },
      });

      // Access the internal wsService mock
      const wsServiceMock = (service as any).wsService;
      wsServiceMock.provision.mockResolvedValue({
        path: '/tmp/raven-workspaces/repo/worktrees/exp-1234',
        branch: { name: 'experiment/exp-1234' },
      });

      const result = await service.provision(provisionConfig);

      expect(mockCodingWorkspaceRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'workspace-123',
          repoUrl: 'https://github.com/org/repo',
          experimentId: 'exp-12345678-abcd',
          spaceId: 'space-456',
          baseBranch: 'main',
        }),
      );

      expect(mockCodingWorkspaceRepo.updateStatus).toHaveBeenCalledWith(
        'cw-001',
        'provisioning',
      );

      expect(result).toEqual({
        id: 'cw-001',
        path: '/tmp/raven-workspaces/repo/worktrees/exp-1234',
        branch: 'experiment/exp-1234',
        status: 'ready',
      });
    });

    it('should generate timestamp branch when no experimentId', async () => {
      const configNoExperiment = {
        workspaceId: 'workspace-123',
        repoUrl: 'https://github.com/org/repo',
      };

      const mockRecord = { id: 'cw-002', status: 'pending' };
      mockCodingWorkspaceRepo.create.mockResolvedValue(mockRecord);
      mockCodingWorkspaceRepo.updateStatus.mockResolvedValue(mockRecord);
      mockWorkspaceRepo.findById.mockResolvedValue({ settings: {} });

      const wsServiceMock = (service as any).wsService;
      wsServiceMock.provision.mockResolvedValue({
        path: '/tmp/raven-workspaces/repo/worktrees/ts',
        branch: { name: 'experiment/1234567890' },
      });

      await service.provision(configNoExperiment);

      expect(mockCodingWorkspaceRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          branch: expect.stringMatching(/^experiment\//),
        }),
      );
    });

    it('should set error status when provisioning fails', async () => {
      const mockRecord = { id: 'cw-003', status: 'pending' };
      mockCodingWorkspaceRepo.create.mockResolvedValue(mockRecord);
      mockCodingWorkspaceRepo.updateStatus.mockResolvedValue(mockRecord);
      mockWorkspaceRepo.findById.mockResolvedValue({ settings: {} });

      const wsServiceMock = (service as any).wsService;
      wsServiceMock.provision.mockRejectedValue(new Error('Clone failed'));

      await expect(service.provision(provisionConfig)).rejects.toThrow(
        'Clone failed',
      );

      expect(mockCodingWorkspaceRepo.updateStatus).toHaveBeenCalledWith(
        'cw-003',
        'error',
        { errorMessage: 'Clone failed' },
      );
    });
  });

  describe('finalize', () => {
    it('should finalize a workspace — commit, push, create PR', async () => {
      const mockRecord = {
        id: 'cw-001',
        branch: 'experiment/test',
        baseBranch: 'main',
      };
      mockCodingWorkspaceRepo.findById.mockResolvedValue(mockRecord);
      mockCodingWorkspaceRepo.updateStatus.mockResolvedValue(mockRecord);

      const wsServiceMock = (service as any).wsService;
      wsServiceMock.finalize.mockResolvedValue({
        url: 'https://github.com/org/repo/pull/42',
        number: 42,
        sourceBranch: 'experiment/test',
      });

      const result = await service.finalize('cw-001', {
        prTitle: 'Test PR',
        prBody: 'Test body',
      });

      expect(result).toEqual({
        prUrl: 'https://github.com/org/repo/pull/42',
        prNumber: 42,
        commitSha: 'experiment/test',
      });

      expect(mockCodingWorkspaceRepo.updateStatus).toHaveBeenCalledWith(
        'cw-001',
        'finalized',
        expect.objectContaining({
          prUrl: 'https://github.com/org/repo/pull/42',
          prNumber: 42,
        }),
      );
    });

    it('should throw when workspace not found', async () => {
      mockCodingWorkspaceRepo.findById.mockResolvedValue(undefined);

      await expect(service.finalize('nonexistent')).rejects.toThrow(
        'Coding workspace nonexistent not found',
      );
    });

    it('should handle finalize returning void (no PR)', async () => {
      const mockRecord = { id: 'cw-001', branch: 'experiment/test', baseBranch: 'main' };
      mockCodingWorkspaceRepo.findById.mockResolvedValue(mockRecord);
      mockCodingWorkspaceRepo.updateStatus.mockResolvedValue(mockRecord);

      const wsServiceMock = (service as any).wsService;
      wsServiceMock.finalize.mockResolvedValue(undefined);

      const result = await service.finalize('cw-001');

      expect(result).toEqual({
        prUrl: undefined,
        prNumber: undefined,
        commitSha: undefined,
      });
    });

    it('should set error status when finalize fails', async () => {
      const mockRecord = { id: 'cw-001', branch: 'experiment/test', baseBranch: 'main' };
      mockCodingWorkspaceRepo.findById.mockResolvedValue(mockRecord);
      mockCodingWorkspaceRepo.updateStatus.mockResolvedValue(mockRecord);

      const wsServiceMock = (service as any).wsService;
      wsServiceMock.finalize.mockRejectedValue(new Error('Push failed'));

      await expect(service.finalize('cw-001')).rejects.toThrow('Push failed');

      expect(mockCodingWorkspaceRepo.updateStatus).toHaveBeenCalledWith(
        'cw-001',
        'error',
        { errorMessage: 'Push failed' },
      );
    });
  });

  describe('cleanup', () => {
    it('should cleanup a workspace and set status to cleaned', async () => {
      const wsServiceMock = (service as any).wsService;
      wsServiceMock.cleanup.mockResolvedValue(undefined);
      mockCodingWorkspaceRepo.updateStatus.mockResolvedValue({});

      await service.cleanup('cw-001');

      expect(wsServiceMock.cleanup).toHaveBeenCalledWith('cw-001');
      expect(mockCodingWorkspaceRepo.updateStatus).toHaveBeenCalledWith(
        'cw-001',
        'cleaned',
      );
    });

    it('should handle cleanup errors gracefully', async () => {
      const wsServiceMock = (service as any).wsService;
      wsServiceMock.cleanup.mockRejectedValue(new Error('Cleanup failed'));
      mockCodingWorkspaceRepo.updateStatus.mockResolvedValue({});

      // Should not throw
      await service.cleanup('cw-001');

      expect(mockCodingWorkspaceRepo.updateStatus).toHaveBeenCalledWith(
        'cw-001',
        'error',
        { errorMessage: 'Cleanup failed: Cleanup failed' },
      );
    });
  });

  describe('getWorkspace', () => {
    it('should return workspace by id', async () => {
      const mockRecord = { id: 'cw-001', status: 'ready' };
      mockCodingWorkspaceRepo.findById.mockResolvedValue(mockRecord);

      const result = await service.getWorkspace('cw-001');

      expect(result).toEqual(mockRecord);
      expect(mockCodingWorkspaceRepo.findById).toHaveBeenCalledWith('cw-001');
    });
  });

  describe('getByExperiment', () => {
    it('should return workspaces by experiment id', async () => {
      const mockRecords = [
        { id: 'cw-001', experimentId: 'exp-123' },
        { id: 'cw-002', experimentId: 'exp-123' },
      ];
      mockCodingWorkspaceRepo.findByExperiment.mockResolvedValue(mockRecords);

      const result = await service.getByExperiment('exp-123');

      expect(result).toEqual(mockRecords);
      expect(mockCodingWorkspaceRepo.findByExperiment).toHaveBeenCalledWith('exp-123');
    });
  });

  describe('resolveCredentials', () => {
    it('should resolve credentials from workspace settings', async () => {
      mockWorkspaceRepo.findById.mockResolvedValue({
        settings: { integrations: { githubPat: 'settings-pat' } },
      });

      const result = await (service as any).resolveCredentials(
        'workspace-123',
        'https://github.com/org/repo',
        'exec-001',
      );

      expect(result).toBe('settings-pat');
    });

    it('should fall back to GITHUB_PAT env variable', async () => {
      mockWorkspaceRepo.findById.mockResolvedValue({ settings: {} });

      const originalEnv = process.env.GITHUB_PAT;
      process.env.GITHUB_PAT = 'env-pat';

      const result = await (service as any).resolveCredentials(
        'workspace-123',
        'https://github.com/org/repo',
        'exec-001',
      );

      expect(result).toBe('env-pat');
      process.env.GITHUB_PAT = originalEnv;
    });

    it('should return null when no credentials available', async () => {
      mockWorkspaceRepo.findById.mockResolvedValue({ settings: {} });

      const originalEnv = process.env.GITHUB_PAT;
      delete process.env.GITHUB_PAT;

      const result = await (service as any).resolveCredentials(
        'workspace-123',
        'https://github.com/org/repo',
        'exec-001',
      );

      expect(result).toBeNull();
      process.env.GITHUB_PAT = originalEnv;
    });
  });
});
