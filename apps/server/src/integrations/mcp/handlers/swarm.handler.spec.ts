import { Test, TestingModule } from '@nestjs/testing';
import { SwarmHandler } from './swarm.handler';
import { CodingSwarmService } from '../../../core/coding-swarm/coding-swarm.service';

describe('SwarmHandler', () => {
  let handler: SwarmHandler;

  const mockCodingSwarmService = {
    execute: jest.fn(),
    getStatus: jest.fn(),
    list: jest.fn(),
    stop: jest.fn(),
    getLogs: jest.fn(),
  };

  const userId = 'user-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SwarmHandler,
        { provide: CodingSwarmService, useValue: mockCodingSwarmService },
      ],
    }).compile();

    handler = module.get<SwarmHandler>(SwarmHandler);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(handler).toBeDefined();
  });

  describe('execute', () => {
    it('should start a coding swarm execution', async () => {
      const params = {
        workspaceId: 'workspace-123',
        repoUrl: 'https://github.com/org/repo',
        taskDescription: 'Fix the login bug',
        experimentId: 'exp-001',
        agentType: 'claude-code',
      };

      mockCodingSwarmService.execute.mockResolvedValue({
        executionId: 'exec-001',
        status: 'pending',
      });

      const result = await handler.execute(params, userId);

      expect(result).toEqual({
        executionId: 'exec-001',
        status: 'pending',
      });

      expect(mockCodingSwarmService.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'workspace-123',
          repoUrl: 'https://github.com/org/repo',
          taskDescription: 'Fix the login bug',
          triggeredBy: userId,
        }),
      );
    });

    it('should throw when workspaceId is missing', async () => {
      const params = {
        repoUrl: 'https://github.com/org/repo',
        taskDescription: 'Fix the bug',
      };

      await expect(handler.execute(params, userId)).rejects.toMatchObject({
        code: expect.any(Number),
      });
    });

    it('should throw when repoUrl is missing', async () => {
      const params = {
        workspaceId: 'workspace-123',
        taskDescription: 'Fix the bug',
      };

      await expect(handler.execute(params, userId)).rejects.toMatchObject({
        code: expect.any(Number),
      });
    });

    it('should throw when taskDescription is missing', async () => {
      const params = {
        workspaceId: 'workspace-123',
        repoUrl: 'https://github.com/org/repo',
      };

      await expect(handler.execute(params, userId)).rejects.toMatchObject({
        code: expect.any(Number),
      });
    });
  });

  describe('status', () => {
    it('should return execution status', async () => {
      const mockExecution = {
        id: 'exec-001',
        status: 'running',
        agentType: 'claude-code',
        agentId: 'agent-abc',
        taskDescription: 'Fix the bug',
        outputSummary: null,
        exitCode: null,
        results: {},
        filesChanged: [],
        startedAt: new Date(),
        completedAt: null,
        errorMessage: null,
        createdAt: new Date(),
      };

      mockCodingSwarmService.getStatus.mockResolvedValue(mockExecution);

      const result = await handler.status({ executionId: 'exec-001' }, userId);

      expect(result).toMatchObject({
        id: 'exec-001',
        status: 'running',
        agentType: 'claude-code',
      });
    });

    it('should throw when execution not found', async () => {
      mockCodingSwarmService.getStatus.mockResolvedValue(null);

      await expect(
        handler.status({ executionId: 'nonexistent' }, userId),
      ).rejects.toMatchObject({
        code: expect.any(Number),
      });
    });

    it('should throw when executionId is missing', async () => {
      await expect(handler.status({}, userId)).rejects.toMatchObject({
        code: expect.any(Number),
      });
    });
  });

  describe('list', () => {
    it('should list executions for a workspace', async () => {
      const mockExecutions = [
        {
          id: 'exec-001',
          status: 'running',
          agentType: 'claude-code',
          taskDescription: 'Fix bug',
          experimentId: 'exp-001',
          startedAt: new Date(),
          completedAt: null,
          createdAt: new Date(),
        },
        {
          id: 'exec-002',
          status: 'completed',
          agentType: 'aider',
          taskDescription: 'Add feature',
          experimentId: null,
          startedAt: new Date(),
          completedAt: new Date(),
          createdAt: new Date(),
        },
      ];

      mockCodingSwarmService.list.mockResolvedValue(mockExecutions);

      const result = await handler.list(
        { workspaceId: 'workspace-123', status: 'running' },
        userId,
      );

      expect(result.executions).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.executions[0]).toMatchObject({
        id: 'exec-001',
        status: 'running',
      });
    });

    it('should throw when workspaceId is missing', async () => {
      await expect(handler.list({}, userId)).rejects.toMatchObject({
        code: expect.any(Number),
      });
    });
  });

  describe('stop', () => {
    it('should stop a running execution', async () => {
      mockCodingSwarmService.stop.mockResolvedValue({
        success: true,
        executionId: 'exec-001',
        status: 'cancelled',
      });

      const result = await handler.stop({ executionId: 'exec-001' }, userId);

      expect(result).toEqual({
        success: true,
        executionId: 'exec-001',
        status: 'cancelled',
      });
    });

    it('should throw when executionId is missing', async () => {
      await expect(handler.stop({}, userId)).rejects.toMatchObject({
        code: expect.any(Number),
      });
    });
  });

  describe('logs', () => {
    it('should return terminal logs', async () => {
      const mockLogs = {
        logs: [
          { id: 'log-1', content: 'Building...' },
          { id: 'log-2', content: 'Done.' },
        ],
      };

      mockCodingSwarmService.getLogs.mockResolvedValue(mockLogs);

      const result = await handler.logs(
        { executionId: 'exec-001', limit: 50 },
        userId,
      );

      expect(result).toEqual(mockLogs);
      expect(mockCodingSwarmService.getLogs).toHaveBeenCalledWith(
        'exec-001',
        50,
      );
    });

    it('should throw when executionId is missing', async () => {
      await expect(handler.logs({}, userId)).rejects.toMatchObject({
        code: expect.any(Number),
      });
    });
  });
});
