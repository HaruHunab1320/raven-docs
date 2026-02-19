import { Test, TestingModule } from '@nestjs/testing';
import { CodingSwarmListener } from './coding-swarm.listener';
import { CodingSwarmService } from './coding-swarm.service';
import { WsGateway } from '../../ws/ws.gateway';

describe('CodingSwarmListener', () => {
  let listener: CodingSwarmListener;

  const mockCodingSwarmService = {
    handleAgentReady: jest.fn(),
    handleAgentStopped: jest.fn(),
    handleAgentError: jest.fn(),
  };

  const mockWsEmit = jest.fn();
  const mockWsTo = jest.fn().mockReturnValue({ emit: mockWsEmit });
  const mockWsGateway = {
    server: {
      to: mockWsTo,
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CodingSwarmListener,
        { provide: CodingSwarmService, useValue: mockCodingSwarmService },
        { provide: WsGateway, useValue: mockWsGateway },
      ],
    }).compile();

    listener = module.get<CodingSwarmListener>(CodingSwarmListener);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(listener).toBeDefined();
  });

  describe('handleAgentReady', () => {
    it('should delegate to codingSwarmService.handleAgentReady', async () => {
      mockCodingSwarmService.handleAgentReady.mockResolvedValue(undefined);

      await listener.handleAgentReady({
        workspaceId: 'workspace-123',
        agent: { id: 'agent-abc', terminalSessionId: 'term-456' },
        runtimeSessionId: 'session-789',
      });

      expect(mockCodingSwarmService.handleAgentReady).toHaveBeenCalledWith(
        'agent-abc',
        {
          runtimeSessionId: 'session-789',
          terminalSessionId: 'term-456',
        },
      );
    });

    it('should use agentId field if agent.id is missing', async () => {
      mockCodingSwarmService.handleAgentReady.mockResolvedValue(undefined);

      await listener.handleAgentReady({
        workspaceId: 'workspace-123',
        agent: {},
        agentId: 'agent-def',
      });

      expect(mockCodingSwarmService.handleAgentReady).toHaveBeenCalledWith(
        'agent-def',
        expect.any(Object),
      );
    });

    it('should no-op when no agentId available', async () => {
      await listener.handleAgentReady({
        workspaceId: 'workspace-123',
        agent: {},
      });

      expect(mockCodingSwarmService.handleAgentReady).not.toHaveBeenCalled();
    });

    it('should silently catch service errors', async () => {
      mockCodingSwarmService.handleAgentReady.mockRejectedValue(
        new Error('Not a swarm agent'),
      );

      // Should not throw
      await listener.handleAgentReady({
        workspaceId: 'workspace-123',
        agent: { id: 'agent-abc' },
      });
    });
  });

  describe('handleAgentStopped', () => {
    it('should delegate to codingSwarmService.handleAgentStopped', async () => {
      mockCodingSwarmService.handleAgentStopped.mockResolvedValue(undefined);

      await listener.handleAgentStopped({
        workspaceId: 'workspace-123',
        agent: { id: 'agent-abc' },
        reason: 'completed',
        exitCode: 0,
      });

      expect(mockCodingSwarmService.handleAgentStopped).toHaveBeenCalledWith(
        'agent-abc',
        {
          reason: 'completed',
          exitCode: 0,
        },
      );
    });

    it('should no-op when no agentId available', async () => {
      await listener.handleAgentStopped({
        workspaceId: 'workspace-123',
        agent: {},
      });

      expect(mockCodingSwarmService.handleAgentStopped).not.toHaveBeenCalled();
    });
  });

  describe('handleAgentError', () => {
    it('should delegate to codingSwarmService.handleAgentError', async () => {
      mockCodingSwarmService.handleAgentError.mockResolvedValue(undefined);

      await listener.handleAgentError({
        workspaceId: 'workspace-123',
        agent: { id: 'agent-abc' },
        error: 'Process crashed',
      });

      expect(mockCodingSwarmService.handleAgentError).toHaveBeenCalledWith(
        'agent-abc',
        { error: 'Process crashed' },
      );
    });
  });

  describe('handleStatusChanged', () => {
    it('should broadcast status change via WebSocket', () => {
      listener.handleStatusChanged({
        workspaceId: 'workspace-123',
        executionId: 'exec-001',
        status: 'running',
      });

      expect(mockWsTo).toHaveBeenCalledWith('workspace-workspace-123');
      expect(mockWsEmit).toHaveBeenCalledWith('swarm:status_changed', {
        executionId: 'exec-001',
        status: 'running',
      });
    });
  });

  describe('handleCompleted', () => {
    it('should broadcast completion via WebSocket', () => {
      listener.handleCompleted({
        workspaceId: 'workspace-123',
        executionId: 'exec-001',
        experimentId: 'exp-001',
      });

      expect(mockWsTo).toHaveBeenCalledWith('workspace-workspace-123');
      expect(mockWsEmit).toHaveBeenCalledWith('swarm:completed', {
        executionId: 'exec-001',
        experimentId: 'exp-001',
      });
    });
  });
});
