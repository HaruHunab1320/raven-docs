import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CodingSwarmService } from './coding-swarm.service';
import { SwarmExecutionRepo } from '../../database/repos/coding-swarm/swarm-execution.repo';
import { CodingWorkspaceRepo } from '../../database/repos/coding-swarm/coding-workspace.repo';
import { GitWorkspaceService } from '../git-workspace/git-workspace.service';
import { AgentExecutionService } from './agent-execution.service';
import { WorkspacePreparationService } from './workspace-preparation.service';
import { WorkspaceRepo } from '../../database/repos/workspace/workspace.repo';
import { QueueName } from '../../integrations/queue/constants';

describe('CodingSwarmService', () => {
  let service: CodingSwarmService;

  const mockSwarmExecRepo = {
    create: jest.fn(),
    findById: jest.fn(),
    findByExperiment: jest.fn(),
    findByWorkspace: jest.fn(),
    findActiveByWorkspace: jest.fn(),
    updateStatus: jest.fn(),
    updateResults: jest.fn(),
  };

  const mockCodingWorkspaceRepo = {
    create: jest.fn(),
    findById: jest.fn(),
    updateStatus: jest.fn(),
  };

  const mockGitWorkspaceService = {
    provision: jest.fn(),
    finalize: jest.fn(),
    cleanup: jest.fn(),
    getWorkspace: jest.fn(),
  };

  const mockAgentExecutionService = {
    spawn: jest.fn(),
    send: jest.fn(),
    stop: jest.fn(),
    getLogs: jest.fn(),
    getSession: jest.fn(),
    checkInstallation: jest.fn(),
  };

  const mockWorkspacePreparationService = {
    prepareWorkspace: jest.fn().mockResolvedValue({
      env: {
        MCP_SERVER_URL: 'http://localhost:3000',
        MCP_API_KEY: 'mcp_test',
        RAVEN_WORKSPACE_ID: 'workspace-123',
        RAVEN_EXECUTION_ID: 'exec-001',
      },
      adapterConfig: {
        interactive: true,
        approvalPreset: 'autonomous',
      },
    }),
    cleanupApiKey: jest.fn().mockResolvedValue(undefined),
  };

  const mockWorkspaceRepo = {
    findById: jest.fn(),
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  const mockQueue = {
    add: jest.fn(),
  };

  const mockSelectChain = {
    selectAll: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue([]),
    executeTakeFirst: jest.fn().mockResolvedValue(null),
  };

  const mockUpdateChain = {
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue([]),
  };

  const mockDb = {
    selectFrom: jest.fn().mockReturnValue(mockSelectChain),
    updateTable: jest.fn().mockReturnValue(mockUpdateChain),
  };

  beforeEach(async () => {
    jest.useFakeTimers();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CodingSwarmService,
        { provide: SwarmExecutionRepo, useValue: mockSwarmExecRepo },
        { provide: CodingWorkspaceRepo, useValue: mockCodingWorkspaceRepo },
        { provide: GitWorkspaceService, useValue: mockGitWorkspaceService },
        { provide: AgentExecutionService, useValue: mockAgentExecutionService },
        { provide: WorkspacePreparationService, useValue: mockWorkspacePreparationService },
        { provide: WorkspaceRepo, useValue: mockWorkspaceRepo },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: getQueueToken(QueueName.GENERAL_QUEUE), useValue: mockQueue },
        { provide: 'KyselyModuleConnectionToken', useValue: mockDb },
      ],
    }).compile();

    service = module.get<CodingSwarmService>(CodingSwarmService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('execute', () => {
    const executeParams = {
      workspaceId: 'workspace-123',
      repoUrl: 'https://github.com/org/repo',
      taskDescription: 'Fix the login bug',
      experimentId: 'exp-001',
      spaceId: 'space-456',
      agentType: 'claude-code',
      baseBranch: 'main',
      triggeredBy: 'user-789',
    };

    it('should create execution and enqueue job', async () => {
      const mockExecution = { id: 'exec-001', status: 'pending' };
      mockSwarmExecRepo.create.mockResolvedValue(mockExecution);
      mockQueue.add.mockResolvedValue({});

      const result = await service.execute(executeParams);

      expect(result).toEqual({ executionId: 'exec-001', status: 'pending' });

      expect(mockSwarmExecRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'workspace-123',
          taskDescription: 'Fix the login bug',
          agentType: 'claude-code',
          triggeredBy: 'user-789',
          config: expect.objectContaining({
            repoUrl: 'https://github.com/org/repo',
            baseBranch: 'main',
          }),
        }),
      );

      expect(mockQueue.add).toHaveBeenCalledWith(
        'coding-swarm',
        { executionId: 'exec-001' },
        expect.objectContaining({ attempts: 1 }),
      );
    });

    it('should default agentType to claude-code', async () => {
      const paramsNoAgent = {
        workspaceId: 'workspace-123',
        repoUrl: 'https://github.com/org/repo',
        taskDescription: 'Do something',
      };

      mockSwarmExecRepo.create.mockResolvedValue({ id: 'exec-002' });
      mockQueue.add.mockResolvedValue({});

      await service.execute(paramsNoAgent);

      expect(mockSwarmExecRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          agentType: 'claude-code',
        }),
      );
    });
  });

  describe('processExecution', () => {
    const mockExecution = {
      id: 'exec-001',
      workspaceId: 'workspace-123',
      agentType: 'claude-code',
      experimentId: 'exp-001',
      spaceId: 'space-456',
      triggeredBy: 'user-789',
      taskDescription: 'Fix the bug',
      config: {
        repoUrl: 'https://github.com/org/repo',
        baseBranch: 'main',
      },
    };

    it('should provision workspace and spawn agent via AgentExecutionService', async () => {
      mockSwarmExecRepo.findById.mockResolvedValue(mockExecution);
      mockSwarmExecRepo.updateStatus.mockResolvedValue({});
      mockWorkspaceRepo.findById.mockResolvedValue({ settings: {} });

      mockGitWorkspaceService.provision.mockResolvedValue({
        id: 'cw-001',
        path: '/tmp/raven-workspaces/repo/worktrees/exp-001',
        branch: 'experiment/exp-001',
        status: 'ready',
      });

      mockAgentExecutionService.spawn.mockResolvedValue({
        id: 'agent-abc',
      });

      await service.processExecution('exec-001');

      // Should provision git workspace
      expect(mockGitWorkspaceService.provision).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'workspace-123',
          repoUrl: 'https://github.com/org/repo',
          baseBranch: 'main',
        }),
      );

      // Should spawn agent via AgentExecutionService
      expect(mockAgentExecutionService.spawn).toHaveBeenCalledWith(
        'workspace-123',
        expect.objectContaining({
          type: 'claude-code',
          name: expect.stringContaining('swarm-'),
          workdir: '/tmp/raven-workspaces/repo/worktrees/exp-001',
        }),
        'user-789',
      );

      // Should update status to spawning with agentId
      expect(mockSwarmExecRepo.updateStatus).toHaveBeenCalledWith(
        'exec-001',
        'spawning',
        expect.objectContaining({ agentId: 'agent-abc' }),
      );

      // Should emit status changed events
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'coding_swarm.status_changed',
        expect.objectContaining({ status: 'provisioning' }),
      );
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'coding_swarm.status_changed',
        expect.objectContaining({ status: 'spawning' }),
      );
    });

    it('should throw when execution not found', async () => {
      mockSwarmExecRepo.findById.mockResolvedValue(undefined);

      await expect(service.processExecution('nonexistent')).rejects.toThrow(
        'Execution nonexistent not found',
      );
    });

    it('should mark as failed when provisioning errors', async () => {
      mockSwarmExecRepo.findById.mockResolvedValue(mockExecution);
      mockSwarmExecRepo.updateStatus.mockResolvedValue({});
      mockGitWorkspaceService.provision.mockRejectedValue(
        new Error('Clone failed'),
      );

      await expect(service.processExecution('exec-001')).rejects.toThrow(
        'Clone failed',
      );

      expect(mockSwarmExecRepo.updateStatus).toHaveBeenCalledWith(
        'exec-001',
        'failed',
        expect.objectContaining({ errorMessage: 'Clone failed' }),
      );
    });
  });

  describe('handleAgentReady', () => {
    it('should update status to running and send task via AgentExecutionService', async () => {
      const mockExecution = {
        id: 'exec-001',
        workspaceId: 'workspace-123',
        agentId: 'agent-abc',
        taskDescription: 'Fix the bug',
        taskContext: { hypothesis: 'test' },
        experimentId: 'exp-001',
        status: 'spawning',
      };

      // Mock findExecutionByAgentId
      mockSelectChain.execute.mockResolvedValue([mockExecution]);
      mockSwarmExecRepo.updateStatus.mockResolvedValue({});
      mockAgentExecutionService.send.mockResolvedValue(undefined);

      await service.handleAgentReady('agent-abc', {
        runtimeSessionId: 'session-123',
        terminalSessionId: 'term-456',
      });

      expect(mockSwarmExecRepo.updateStatus).toHaveBeenCalledWith(
        'exec-001',
        'running',
        expect.objectContaining({
          runtimeSessionId: 'session-123',
          terminalSessionId: 'term-456',
        }),
      );

      // Should send task via AgentExecutionService, not HTTP
      expect(mockAgentExecutionService.send).toHaveBeenCalledWith(
        'agent-abc',
        'Fix the bug',
        'workspace-123',
      );
    });

    it('should no-op when no matching execution found', async () => {
      mockSelectChain.execute.mockResolvedValue([]);

      await service.handleAgentReady('unknown-agent', {});

      expect(mockSwarmExecRepo.updateStatus).not.toHaveBeenCalled();
    });
  });

  describe('handleAgentStopped', () => {
    it('should capture results, finalize workspace, and complete', async () => {
      const mockExecution = {
        id: 'exec-001',
        workspaceId: 'workspace-123',
        codingWorkspaceId: 'cw-001',
        agentId: 'agent-abc',
        taskDescription: 'Fix the bug',
        agentType: 'claude-code',
        experimentId: 'exp-001',
        status: 'running',
      };

      mockSelectChain.execute.mockResolvedValue([mockExecution]);
      mockSelectChain.executeTakeFirst.mockResolvedValue({
        id: 'exp-001',
        metadata: {},
      });
      mockSwarmExecRepo.updateStatus.mockResolvedValue({});
      mockSwarmExecRepo.updateResults.mockResolvedValue({});

      mockGitWorkspaceService.finalize.mockResolvedValue({
        prUrl: 'https://github.com/org/repo/pull/42',
        prNumber: 42,
        commitSha: 'abc123',
      });

      await service.handleAgentStopped('agent-abc', {
        reason: 'completed',
        exitCode: 0,
      });

      // Should update results
      expect(mockSwarmExecRepo.updateResults).toHaveBeenCalledWith(
        'exec-001',
        expect.objectContaining({
          outputSummary: 'completed',
          exitCode: 0,
        }),
      );

      // Should finalize workspace
      expect(mockGitWorkspaceService.finalize).toHaveBeenCalledWith(
        'cw-001',
        expect.objectContaining({
          prTitle: expect.stringContaining('[Experiment]'),
        }),
      );

      // Should mark completed
      expect(mockSwarmExecRepo.updateStatus).toHaveBeenCalledWith(
        'exec-001',
        'completed',
        expect.objectContaining({ completedAt: expect.any(Date) }),
      );

      // Should emit completion event
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'coding_swarm.completed',
        expect.objectContaining({
          executionId: 'exec-001',
          workspaceId: 'workspace-123',
        }),
      );
    });

    it('should no-op when no matching execution found', async () => {
      mockSelectChain.execute.mockResolvedValue([]);

      await service.handleAgentStopped('unknown-agent', {});

      expect(mockSwarmExecRepo.updateResults).not.toHaveBeenCalled();
    });

    it('should mark failed if capture/finalize throws', async () => {
      const mockExecution = {
        id: 'exec-001',
        workspaceId: 'workspace-123',
        codingWorkspaceId: 'cw-001',
        agentId: 'agent-abc',
        taskDescription: 'Fix bug',
        agentType: 'claude-code',
        status: 'running',
      };

      mockSelectChain.execute.mockResolvedValue([mockExecution]);
      mockSwarmExecRepo.updateStatus.mockResolvedValue({});
      mockSwarmExecRepo.updateResults.mockRejectedValue(
        new Error('DB error'),
      );

      await service.handleAgentStopped('agent-abc', { exitCode: 0 });

      expect(mockSwarmExecRepo.updateStatus).toHaveBeenCalledWith(
        'exec-001',
        'failed',
        expect.objectContaining({ errorMessage: 'DB error' }),
      );
    });
  });

  describe('handleAgentError', () => {
    it('should mark execution as failed', async () => {
      const mockExecution = {
        id: 'exec-001',
        workspaceId: 'workspace-123',
        codingWorkspaceId: 'cw-001',
        agentId: 'agent-abc',
        status: 'running',
      };

      mockSelectChain.execute.mockResolvedValue([mockExecution]);
      mockSwarmExecRepo.updateStatus.mockResolvedValue({});

      await service.handleAgentError('agent-abc', { error: 'Process crashed' });

      expect(mockSwarmExecRepo.updateStatus).toHaveBeenCalledWith(
        'exec-001',
        'failed',
        expect.objectContaining({ errorMessage: 'Process crashed' }),
      );

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'coding_swarm.status_changed',
        expect.objectContaining({ status: 'failed' }),
      );
    });
  });

  describe('getStatus', () => {
    it('should return execution by id', async () => {
      const mockExecution = { id: 'exec-001', status: 'running' };
      mockSwarmExecRepo.findById.mockResolvedValue(mockExecution);

      const result = await service.getStatus('exec-001');

      expect(result).toEqual(mockExecution);
    });
  });

  describe('list', () => {
    it('should list executions for a workspace', async () => {
      const mockExecutions = [
        { id: 'exec-001', status: 'running' },
        { id: 'exec-002', status: 'completed' },
      ];
      mockSwarmExecRepo.findByWorkspace.mockResolvedValue(mockExecutions);

      const result = await service.list('workspace-123', { status: 'running' });

      expect(result).toEqual(mockExecutions);
      expect(mockSwarmExecRepo.findByWorkspace).toHaveBeenCalledWith(
        'workspace-123',
        { status: 'running' },
      );
    });
  });

  describe('stop', () => {
    it('should stop a running execution via AgentExecutionService', async () => {
      const mockExecution = {
        id: 'exec-001',
        workspaceId: 'workspace-123',
        agentId: 'agent-abc',
        codingWorkspaceId: 'cw-001',
        status: 'running',
      };
      mockSwarmExecRepo.findById.mockResolvedValue(mockExecution);
      mockSwarmExecRepo.updateStatus.mockResolvedValue({});
      mockAgentExecutionService.stop.mockResolvedValue(undefined);

      const result = await service.stop('exec-001');

      expect(result).toEqual({
        success: true,
        executionId: 'exec-001',
        status: 'cancelled',
      });

      expect(mockAgentExecutionService.stop).toHaveBeenCalledWith(
        'agent-abc',
        'workspace-123',
      );

      expect(mockSwarmExecRepo.updateStatus).toHaveBeenCalledWith(
        'exec-001',
        'cancelled',
        expect.objectContaining({ completedAt: expect.any(Date) }),
      );
    });

    it('should throw when execution not found', async () => {
      mockSwarmExecRepo.findById.mockResolvedValue(undefined);

      await expect(service.stop('nonexistent')).rejects.toThrow(
        'Execution nonexistent not found',
      );
    });

    it('should still cancel even if agent stop fails', async () => {
      const mockExecution = {
        id: 'exec-001',
        workspaceId: 'workspace-123',
        agentId: 'agent-abc',
        codingWorkspaceId: null,
        status: 'running',
      };
      mockSwarmExecRepo.findById.mockResolvedValue(mockExecution);
      mockSwarmExecRepo.updateStatus.mockResolvedValue({});
      mockAgentExecutionService.stop.mockRejectedValue(
        new Error('Connection refused'),
      );

      const result = await service.stop('exec-001');

      expect(result.status).toBe('cancelled');
    });
  });

  describe('getLogs', () => {
    it('should try AgentExecutionService logs first', async () => {
      mockSwarmExecRepo.findById.mockResolvedValue({
        id: 'exec-001',
        agentId: 'agent-abc',
        terminalSessionId: 'term-456',
      });

      mockAgentExecutionService.getLogs.mockResolvedValue([
        'Building...',
        'Done.',
      ]);

      const result = await service.getLogs('exec-001', 50);

      expect(result).toEqual({
        logs: [{ content: 'Building...' }, { content: 'Done.' }],
      });
      expect(mockAgentExecutionService.getLogs).toHaveBeenCalledWith(
        'agent-abc',
        50,
      );
    });

    it('should fall back to DB logs when PTY logs empty', async () => {
      mockSwarmExecRepo.findById.mockResolvedValue({
        id: 'exec-001',
        agentId: 'agent-abc',
        terminalSessionId: 'term-456',
      });

      mockAgentExecutionService.getLogs.mockResolvedValue([]);

      const mockLogs = [
        { id: 'log-1', content: 'Building...', createdAt: new Date() },
      ];
      mockSelectChain.execute.mockResolvedValue(mockLogs);

      const result = await service.getLogs('exec-001', 50);

      expect(result).toEqual({ logs: mockLogs });
    });

    it('should return empty when no terminal session', async () => {
      mockSwarmExecRepo.findById.mockResolvedValue({
        id: 'exec-001',
        agentId: null,
        terminalSessionId: null,
      });

      const result = await service.getLogs('exec-001');

      expect(result).toEqual({
        logs: [],
        message: 'No terminal session associated',
      });
    });

    it('should throw when execution not found', async () => {
      mockSwarmExecRepo.findById.mockResolvedValue(undefined);

      await expect(service.getLogs('nonexistent')).rejects.toThrow(
        'Execution nonexistent not found',
      );
    });
  });
});
