import { Test, TestingModule } from '@nestjs/testing';
import { WorkspacePreparationService } from './workspace-preparation.service';
import { MCPApiKeyService } from '../../integrations/mcp/services/mcp-api-key.service';
import * as fs from 'fs';
import * as path from 'path';

// Mock adapters
const mockWriteMemoryFile = jest.fn().mockResolvedValue('/tmp/test/CLAUDE.md');
const mockWriteApprovalConfig = jest.fn().mockResolvedValue([]);

const mockAdapters = [
  { adapterType: 'claude', memoryFilePath: 'CLAUDE.md', writeMemoryFile: mockWriteMemoryFile, writeApprovalConfig: mockWriteApprovalConfig },
  { adapterType: 'gemini', memoryFilePath: 'GEMINI.md', writeMemoryFile: mockWriteMemoryFile, writeApprovalConfig: mockWriteApprovalConfig },
  { adapterType: 'codex', memoryFilePath: 'AGENTS.md', writeMemoryFile: mockWriteMemoryFile, writeApprovalConfig: mockWriteApprovalConfig },
  { adapterType: 'aider', memoryFilePath: '.aider.conventions.md', writeMemoryFile: mockWriteMemoryFile, writeApprovalConfig: mockWriteApprovalConfig },
];

const mockGenerateApprovalConfig = jest.fn().mockReturnValue({
  preset: 'autonomous',
  cliFlags: ['--dangerously-skip-permissions'],
  workspaceFiles: [],
  envVars: { CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS: 'true' },
  summary: 'All tools auto-approved',
});

jest.mock('coding-agent-adapters', () => ({
  createAllAdapters: () => mockAdapters,
  BaseCodingAdapter: class {},
  generateApprovalConfig: (...args: unknown[]) => mockGenerateApprovalConfig(...args),
}));

jest.mock('fs', () => {
  const originalFs = jest.requireActual('fs');
  return {
    ...originalFs,
    existsSync: jest.fn(originalFs.existsSync),
    readFileSync: jest.fn(originalFs.readFileSync),
    writeFileSync: jest.fn(),
    appendFileSync: jest.fn(),
  };
});

describe('WorkspacePreparationService', () => {
  let service: WorkspacePreparationService;

  const mockMcpApiKeyService = {
    generateApiKey: jest.fn(),
    listApiKeys: jest.fn(),
    revokeApiKey: jest.fn(),
  };

  const baseParams = {
    workspacePath: '/tmp/raven-workspaces/test-repo',
    workspaceId: 'workspace-123',
    executionId: 'exec-abcdef12-3456-7890',
    agentType: 'claude-code',
    triggeredBy: 'user-789',
    taskDescription: 'Fix the authentication bug',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkspacePreparationService,
        { provide: MCPApiKeyService, useValue: mockMcpApiKeyService },
      ],
    }).compile();

    service = module.get<WorkspacePreparationService>(
      WorkspacePreparationService,
    );

    // Default mock behavior
    mockMcpApiKeyService.generateApiKey.mockResolvedValue('mcp_testapikey123');
    mockWriteMemoryFile.mockResolvedValue('/tmp/test/CLAUDE.md');
    mockWriteApprovalConfig.mockResolvedValue([]);
    mockGenerateApprovalConfig.mockReturnValue({
      preset: 'autonomous',
      cliFlags: ['--dangerously-skip-permissions'],
      workspaceFiles: [],
      envVars: { CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS: 'true' },
      summary: 'All tools auto-approved',
    });
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    // Let readFileSync use real implementation for the template file
    const realReadFileSync = jest.requireActual('fs').readFileSync;
    (fs.readFileSync as jest.Mock).mockImplementation((p: string, ...args: any[]) => {
      if (String(p).includes('templates/agent-context.md')) {
        return realReadFileSync(p, ...args);
      }
      return '';
    });
    (fs.writeFileSync as jest.Mock).mockImplementation(() => {});
    (fs.appendFileSync as jest.Mock).mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('prepareWorkspace', () => {
    it('should generate an API key with correct params', async () => {
      await service.prepareWorkspace(baseParams);

      expect(mockMcpApiKeyService.generateApiKey).toHaveBeenCalledWith(
        'user-789',
        'workspace-123',
        'swarm-exec-abc',
      );
    });

    it('should return correct env vars', async () => {
      const result = await service.prepareWorkspace(baseParams);

      expect(result.env).toEqual(expect.objectContaining({
        MCP_SERVER_URL: expect.any(String),
        MCP_API_KEY: 'mcp_testapikey123',
        RAVEN_WORKSPACE_ID: 'workspace-123',
        RAVEN_EXECUTION_ID: baseParams.executionId,
      }));
    });

    it('should use APP_URL env var for server URL', async () => {
      const originalAppUrl = process.env.APP_URL;
      process.env.APP_URL = 'https://raven.example.com';

      const result = await service.prepareWorkspace(baseParams);

      expect(result.env.MCP_SERVER_URL).toBe('https://raven.example.com');

      process.env.APP_URL = originalAppUrl;
    });

    it('should default to localhost when APP_URL not set', async () => {
      const originalAppUrl = process.env.APP_URL;
      delete process.env.APP_URL;

      const result = await service.prepareWorkspace(baseParams);

      expect(result.env.MCP_SERVER_URL).toBe('http://localhost:3000');

      process.env.APP_URL = originalAppUrl;
    });

    it('should call adapter.writeMemoryFile for claude-code', async () => {
      await service.prepareWorkspace(baseParams);

      expect(mockWriteMemoryFile).toHaveBeenCalledWith(
        baseParams.workspacePath,
        expect.stringContaining('Raven Docs'),
      );
    });

    it('should call adapter.writeMemoryFile for gemini', async () => {
      await service.prepareWorkspace({
        ...baseParams,
        agentType: 'gemini',
      });

      expect(mockWriteMemoryFile).toHaveBeenCalledWith(
        baseParams.workspacePath,
        expect.stringContaining('Raven Docs'),
      );
    });

    it('should call adapter.writeMemoryFile for codex', async () => {
      await service.prepareWorkspace({
        ...baseParams,
        agentType: 'codex',
      });

      expect(mockWriteMemoryFile).toHaveBeenCalledWith(
        baseParams.workspacePath,
        expect.stringContaining('Raven Docs'),
      );
    });

    it('should call adapter.writeMemoryFile for aider', async () => {
      await service.prepareWorkspace({
        ...baseParams,
        agentType: 'aider',
      });

      expect(mockWriteMemoryFile).toHaveBeenCalledWith(
        baseParams.workspacePath,
        expect.stringContaining('Raven Docs'),
      );
    });

    it('should fill all template placeholders in content passed to adapter', async () => {
      await service.prepareWorkspace(baseParams);

      const content = mockWriteMemoryFile.mock.calls[0][1] as string;

      expect(content).toContain('Fix the authentication bug');
      expect(content).toContain(baseParams.executionId);
      expect(content).toContain('workspace-123');
      expect(content).toContain('/api/mcp-standard');
      // Should contain at least some tool categories
      expect(content).toContain('Page Management');
      expect(content).toContain('Search');
      // Should not contain unresolved template placeholders
      expect(content).not.toMatch(/\{\{serverUrl\}\}/);
      expect(content).not.toMatch(/\{\{apiKey\}\}/);
      expect(content).not.toMatch(/\{\{executionId\}\}/);
      expect(content).not.toMatch(/\{\{workspaceId\}\}/);
      expect(content).not.toMatch(/\{\{taskDescription\}\}/);
      expect(content).not.toMatch(/\{\{toolCategories\}\}/);
    });

    it('should update .gitignore with memory file entry', async () => {
      await service.prepareWorkspace(baseParams);

      expect((fs.appendFileSync as jest.Mock)).toHaveBeenCalledWith(
        path.resolve(baseParams.workspacePath, '.gitignore'),
        expect.stringContaining('CLAUDE.md'),
      );
    });

    it('should use adapter memoryFilePath for .gitignore (aider)', async () => {
      await service.prepareWorkspace({
        ...baseParams,
        agentType: 'aider',
      });

      expect((fs.appendFileSync as jest.Mock)).toHaveBeenCalledWith(
        path.resolve(baseParams.workspacePath, '.gitignore'),
        expect.stringContaining('.aider.conventions.md'),
      );
    });

    it('should not duplicate .gitignore entries', async () => {
      const realReadFileSync = jest.requireActual('fs').readFileSync;
      (fs.existsSync as jest.Mock).mockImplementation((p) => {
        return String(p).endsWith('.gitignore');
      });
      (fs.readFileSync as jest.Mock).mockImplementation((p: string, ...args: any[]) => {
        if (String(p).includes('templates/agent-context.md')) {
          return realReadFileSync(p, ...args);
        }
        if (String(p).endsWith('.gitignore'))
          return 'node_modules/\nCLAUDE.md\n.git-workspace/\n';
        return '';
      });

      await service.prepareWorkspace(baseParams);

      // Should not append if entries already exist
      expect((fs.appendFileSync as jest.Mock)).not.toHaveBeenCalledWith(
        path.resolve(baseParams.workspacePath, '.gitignore'),
        expect.anything(),
      );
    });

    it('should throw when API key generation fails', async () => {
      mockMcpApiKeyService.generateApiKey.mockRejectedValue(
        new Error('DB connection failed'),
      );

      await expect(service.prepareWorkspace(baseParams)).rejects.toThrow(
        'DB connection failed',
      );
    });

    it('should still succeed when adapter.writeMemoryFile fails', async () => {
      mockWriteMemoryFile.mockRejectedValue(
        new Error('EACCES: permission denied'),
      );

      // Should not throw — memory file write failure is non-fatal
      const result = await service.prepareWorkspace(baseParams);
      expect(result.env.MCP_API_KEY).toBe('mcp_testapikey123');
    });

    it('should skip memory file for unknown agent type', async () => {
      await service.prepareWorkspace({
        ...baseParams,
        agentType: 'unknown-agent',
      });

      expect(mockWriteMemoryFile).not.toHaveBeenCalled();
    });

    it('should return adapterConfig with approvalPreset', async () => {
      const result = await service.prepareWorkspace(baseParams);

      expect(result.adapterConfig).toEqual({
        interactive: true,
        approvalPreset: 'standard',
      });
    });

    it('should default to standard approval preset', async () => {
      await service.prepareWorkspace(baseParams);

      expect(mockGenerateApprovalConfig).toHaveBeenCalledWith(
        'claude',
        'standard',
      );
    });

    it('should use provided approvalPreset', async () => {
      await service.prepareWorkspace({
        ...baseParams,
        approvalPreset: 'readonly',
      });

      expect(mockGenerateApprovalConfig).toHaveBeenCalledWith(
        'claude',
        'readonly',
      );
    });

    it('should call adapter.writeApprovalConfig', async () => {
      await service.prepareWorkspace(baseParams);

      expect(mockWriteApprovalConfig).toHaveBeenCalledWith(
        baseParams.workspacePath,
        expect.objectContaining({
          adapterConfig: { approvalPreset: 'standard' },
        }),
      );
    });

    it('should merge approval envVars into returned env', async () => {
      mockGenerateApprovalConfig.mockReturnValue({
        preset: 'autonomous',
        cliFlags: [],
        workspaceFiles: [],
        envVars: { CUSTOM_APPROVAL_VAR: 'yes' },
        summary: 'test',
      });

      const result = await service.prepareWorkspace(baseParams);

      expect(result.env.CUSTOM_APPROVAL_VAR).toBe('yes');
      // Core env vars should still be present
      expect(result.env.MCP_API_KEY).toBe('mcp_testapikey123');
    });

    it('should still succeed when writeApprovalConfig fails', async () => {
      mockWriteApprovalConfig.mockRejectedValue(
        new Error('EACCES: permission denied'),
      );

      const result = await service.prepareWorkspace(baseParams);
      expect(result.env.MCP_API_KEY).toBe('mcp_testapikey123');
      expect(result.adapterConfig).toBeDefined();
    });

    it('should still succeed when generateApprovalConfig throws', async () => {
      mockGenerateApprovalConfig.mockImplementation(() => {
        throw new Error('Unknown adapter type');
      });

      const result = await service.prepareWorkspace(baseParams);
      expect(result.env.MCP_API_KEY).toBe('mcp_testapikey123');
    });
  });

  describe('cleanupApiKey', () => {
    it('should revoke the correct API key', async () => {
      mockMcpApiKeyService.listApiKeys.mockResolvedValue([
        { id: 'key-1', name: 'swarm-exec-abc', userId: 'user-789' },
        { id: 'key-2', name: 'other-key', userId: 'user-789' },
      ]);
      mockMcpApiKeyService.revokeApiKey.mockResolvedValue(true);

      await service.cleanupApiKey(baseParams.executionId, 'user-789');

      expect(mockMcpApiKeyService.listApiKeys).toHaveBeenCalledWith(
        'user-789',
      );
      expect(mockMcpApiKeyService.revokeApiKey).toHaveBeenCalledWith(
        'key-1',
        'user-789',
      );
    });

    it('should not throw when key not found', async () => {
      mockMcpApiKeyService.listApiKeys.mockResolvedValue([]);

      await expect(
        service.cleanupApiKey(baseParams.executionId, 'user-789'),
      ).resolves.not.toThrow();
    });

    it('should not throw when revoke fails', async () => {
      mockMcpApiKeyService.listApiKeys.mockResolvedValue([
        { id: 'key-1', name: 'swarm-exec-abc', userId: 'user-789' },
      ]);
      mockMcpApiKeyService.revokeApiKey.mockRejectedValue(
        new Error('DB error'),
      );

      await expect(
        service.cleanupApiKey(baseParams.executionId, 'user-789'),
      ).resolves.not.toThrow();
    });
  });
});
