import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AgentExecutionService } from './agent-execution.service';
import { ParallaxAgentsService } from '../parallax-agents/parallax-agents.service';

// Mock pty-manager
jest.mock('pty-manager', () => {
  const mockPTYManager = {
    registerAdapter: jest.fn(),
    spawn: jest.fn(),
    send: jest.fn(),
    stop: jest.fn(),
    get: jest.fn(),
    logs: jest.fn(),
    attachTerminal: jest.fn(),
    shutdown: jest.fn(),
    on: jest.fn(),
  };
  return {
    PTYManager: jest.fn(() => mockPTYManager),
    __mockPTYManager: mockPTYManager,
  };
});

// Mock coding-agent-adapters
jest.mock('coding-agent-adapters', () => ({
  createAllAdapters: jest.fn(() => [
    { type: 'claude', name: 'Claude Code' },
    { type: 'aider', name: 'Aider' },
  ]),
  checkAdapters: jest.fn(),
}));

const { __mockPTYManager } = jest.requireMock('pty-manager');
const { checkAdapters } = jest.requireMock('coding-agent-adapters');

describe('AgentExecutionService', () => {
  let service: AgentExecutionService;

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  const mockParallaxAgentsService = {
    spawnAgents: jest.fn(),
  };

  beforeEach(async () => {
    // Ensure local mode (no AGENT_RUNTIME_ENDPOINT)
    delete process.env.AGENT_RUNTIME_ENDPOINT;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentExecutionService,
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: ParallaxAgentsService, useValue: mockParallaxAgentsService },
      ],
    }).compile();

    service = module.get<AgentExecutionService>(AgentExecutionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.AGENT_RUNTIME_ENDPOINT;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should initialize in local mode when no AGENT_RUNTIME_ENDPOINT', () => {
    expect(service.mode).toBe('local');
  });

  describe('spawn (local mode)', () => {
    it('should spawn a PTY session and track workspace', async () => {
      __mockPTYManager.spawn.mockResolvedValue({ id: 'session-123' });

      const result = await service.spawn('workspace-1', {
        type: 'claude',
        name: 'test-agent',
        workdir: '/tmp/workspace',
      });

      expect(result).toEqual({ id: 'session-123' });
      expect(__mockPTYManager.spawn).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'claude',
          name: 'test-agent',
          workdir: '/tmp/workspace',
        }),
      );
    });

    it('should pass env and adapterConfig to spawn', async () => {
      __mockPTYManager.spawn.mockResolvedValue({ id: 'session-456' });

      await service.spawn('workspace-1', {
        type: 'claude',
        name: 'test',
        workdir: '/tmp/ws',
        env: { ANTHROPIC_API_KEY: 'sk-test' },
        adapterConfig: { model: 'opus' },
      });

      expect(__mockPTYManager.spawn).toHaveBeenCalledWith(
        expect.objectContaining({
          env: expect.objectContaining({ ANTHROPIC_API_KEY: 'sk-test' }),
          adapterConfig: { model: 'opus' },
        }),
      );
      // Verify nesting env vars are cleared
      const spawnCall = __mockPTYManager.spawn.mock.calls[0][0];
      expect(spawnCall.env.CLAUDECODE).toBe('');
      expect(spawnCall.env.CLAUDE_CODE_SESSION).toBe('');
      expect(spawnCall.env.CLAUDE_CODE_ENTRYPOINT).toBe('');
    });
  });

  describe('send (local mode)', () => {
    it('should send a message to the PTY session', async () => {
      __mockPTYManager.send.mockReturnValue({ id: 'msg-1' });

      await service.send('session-123', 'Fix the login bug');

      expect(__mockPTYManager.send).toHaveBeenCalledWith(
        'session-123',
        'Fix the login bug',
      );
    });
  });

  describe('stop (local mode)', () => {
    it('should stop the PTY session', async () => {
      __mockPTYManager.stop.mockResolvedValue(undefined);

      await service.stop('session-123');

      expect(__mockPTYManager.stop).toHaveBeenCalledWith('session-123');
    });
  });

  describe('getLogs (local mode)', () => {
    it('should collect logs from async iterable', async () => {
      async function* mockLogs() {
        yield 'line 1';
        yield 'line 2';
        yield 'line 3';
      }
      __mockPTYManager.logs.mockReturnValue(mockLogs());

      const logs = await service.getLogs('session-123');

      expect(logs).toEqual(['line 1', 'line 2', 'line 3']);
    });

    it('should respect limit parameter', async () => {
      async function* mockLogs() {
        yield 'line 1';
        yield 'line 2';
        yield 'line 3';
      }
      __mockPTYManager.logs.mockReturnValue(mockLogs());

      const logs = await service.getLogs('session-123', 2);

      expect(logs).toEqual(['line 1', 'line 2']);
    });
  });

  describe('getSession (local mode)', () => {
    it('should return session handle', () => {
      const mockSession = { id: 'session-123', status: 'running' };
      __mockPTYManager.get.mockReturnValue(mockSession);

      const result = service.getSession('session-123');

      expect(result).toEqual(mockSession);
    });

    it('should return null for missing session', () => {
      __mockPTYManager.get.mockReturnValue(null);

      const result = service.getSession('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('attachTerminal (local mode)', () => {
    it('should return terminal attachment', () => {
      const mockAttachment = { onData: jest.fn(), write: jest.fn() };
      __mockPTYManager.attachTerminal.mockReturnValue(mockAttachment);

      const result = service.attachTerminal('session-123');

      expect(result).toEqual(mockAttachment);
    });
  });

  describe('checkInstallation (local mode)', () => {
    it('should check adapter availability', async () => {
      checkAdapters.mockResolvedValue([
        { type: 'claude', installed: true, version: '1.0.0' },
      ]);

      const result = await service.checkInstallation('claude');

      expect(result.available).toBe(true);
      expect(checkAdapters).toHaveBeenCalledWith(['claude']);
    });

    it('should return false for uninstalled adapter', async () => {
      checkAdapters.mockResolvedValue([
        { type: 'aider', installed: false },
      ]);

      const result = await service.checkInstallation('aider');

      expect(result.available).toBe(false);
    });
  });

  describe('onModuleDestroy', () => {
    it('should shutdown PTYManager', async () => {
      __mockPTYManager.shutdown.mockResolvedValue(undefined);

      await service.onModuleDestroy();

      expect(__mockPTYManager.shutdown).toHaveBeenCalled();
    });
  });

  describe('event bridging', () => {
    it('should register event listeners on PTYManager', () => {
      expect(__mockPTYManager.on).toHaveBeenCalledWith(
        'session_ready',
        expect.any(Function),
      );
      expect(__mockPTYManager.on).toHaveBeenCalledWith(
        'session_stopped',
        expect.any(Function),
      );
      expect(__mockPTYManager.on).toHaveBeenCalledWith(
        'session_error',
        expect.any(Function),
      );
      expect(__mockPTYManager.on).toHaveBeenCalledWith(
        'login_required',
        expect.any(Function),
      );
    });
  });
});

describe('AgentExecutionService (remote mode)', () => {
  let service: AgentExecutionService;

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  const mockParallaxAgentsService = {
    spawnAgents: jest.fn(),
  };

  beforeEach(async () => {
    process.env.AGENT_RUNTIME_ENDPOINT = 'http://localhost:3001';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentExecutionService,
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: ParallaxAgentsService, useValue: mockParallaxAgentsService },
      ],
    }).compile();

    service = module.get<AgentExecutionService>(AgentExecutionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.AGENT_RUNTIME_ENDPOINT;
  });

  it('should initialize in remote mode', () => {
    expect(service.mode).toBe('remote');
  });

  describe('spawn (remote mode)', () => {
    it('should delegate to parallaxAgentsService', async () => {
      mockParallaxAgentsService.spawnAgents.mockResolvedValue({
        spawnedAgents: [{ id: 'remote-agent-1' }],
      });

      const result = await service.spawn('workspace-1', {
        type: 'claude',
        name: 'test-agent',
        workdir: '/tmp/workspace',
      });

      expect(result).toEqual({ id: 'remote-agent-1' });
      expect(mockParallaxAgentsService.spawnAgents).toHaveBeenCalledWith(
        'workspace-1',
        expect.objectContaining({
          agentType: 'claude',
          count: 1,
          name: 'test-agent',
        }),
        'system',
      );
    });
  });

  describe('send (remote mode)', () => {
    it('should POST to runtime endpoint', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });
      global.fetch = mockFetch as any;

      await service.send('session-123', 'Fix the bug', 'workspace-1');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/agents/session-123/send',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ message: 'Fix the bug' }),
        }),
      );
    });
  });

  describe('stop (remote mode)', () => {
    it('should POST stop to runtime endpoint', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ ok: true });
      global.fetch = mockFetch as any;

      await service.stop('session-123');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/agents/session-123/stop',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('checkInstallation (remote mode)', () => {
    it('should health-check the runtime endpoint', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ ok: true });
      global.fetch = mockFetch as any;

      const result = await service.checkInstallation('claude');

      expect(result.available).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/health',
      );
    });

    it('should return false when runtime is unreachable', async () => {
      const mockFetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      global.fetch = mockFetch as any;

      const result = await service.checkInstallation('claude');

      expect(result.available).toBe(false);
    });
  });

  describe('getLogs (remote mode)', () => {
    it('should return empty array', async () => {
      const logs = await service.getLogs('session-123');
      expect(logs).toEqual([]);
    });
  });

  describe('getSession (remote mode)', () => {
    it('should return null', () => {
      expect(service.getSession('session-123')).toBeNull();
    });
  });
});
