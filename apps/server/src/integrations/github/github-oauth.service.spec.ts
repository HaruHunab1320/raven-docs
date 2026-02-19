import { Test, TestingModule } from '@nestjs/testing';
import { GitHubOAuthService } from './github-oauth.service';
import { EnvironmentService } from '../environment/environment.service';
import { WorkspaceRepo } from '../../database/repos/workspace/workspace.repo';
import { encryptToken } from './github-crypto.util';

const mockEnvironmentService = {
  getGitHubAppClientId: jest.fn().mockReturnValue('test-client-id'),
  getGitHubAppClientSecret: jest.fn().mockReturnValue('test-client-secret'),
  getAppUrl: jest.fn().mockReturnValue('http://localhost:3000'),
  getAppSecret: jest.fn().mockReturnValue('test-app-secret-that-is-at-least-32-chars-long'),
};

const mockWorkspaceRepo = {
  findById: jest.fn(),
  updateIntegrationSettings: jest.fn(),
};

describe('GitHubOAuthService', () => {
  let service: GitHubOAuthService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GitHubOAuthService,
        { provide: EnvironmentService, useValue: mockEnvironmentService },
        { provide: WorkspaceRepo, useValue: mockWorkspaceRepo },
      ],
    }).compile();

    service = module.get<GitHubOAuthService>(GitHubOAuthService);
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  describe('generateAuthorizationUrl', () => {
    it('should generate a valid GitHub authorization URL', () => {
      const url = service.generateAuthorizationUrl('workspace-1', 'user-1');

      expect(url).toContain('https://github.com/login/oauth/authorize');
      expect(url).toContain('client_id=test-client-id');
      expect(url).toContain('scope=repo+read%3Auser+user%3Aemail');
      expect(url).toContain(
        'redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fapi%2Fintegrations%2Fgithub%2Fcallback',
      );
      expect(url).toContain('state=');
    });

    it('should throw if client ID is not configured', () => {
      mockEnvironmentService.getGitHubAppClientId.mockReturnValueOnce(null);

      expect(() =>
        service.generateAuthorizationUrl('workspace-1', 'user-1'),
      ).toThrow('GitHub App client ID is not configured');
    });

    it('should generate unique state for each call', () => {
      const url1 = service.generateAuthorizationUrl('workspace-1', 'user-1');
      const url2 = service.generateAuthorizationUrl('workspace-1', 'user-1');

      const state1 = new URL(url1).searchParams.get('state');
      const state2 = new URL(url2).searchParams.get('state');

      expect(state1).not.toBe(state2);
    });
  });

  describe('handleCallback', () => {
    it('should return failure for invalid state', async () => {
      const result = await service.handleCallback('code', 'invalid-state');

      expect(result).toEqual({ success: false, workspaceId: null });
    });

    it('should return failure for expired state', async () => {
      // Generate a valid authorization URL to create state
      const url = service.generateAuthorizationUrl('workspace-1', 'user-1');
      const state = new URL(url).searchParams.get('state');

      // Manually expire the state by reaching into the private map
      const pendingStates = (service as any).pendingStates as Map<string, any>;
      const pending = pendingStates.get(state);
      pending.expiresAt = Date.now() - 1000;

      const result = await service.handleCallback('code', state);

      expect(result).toEqual({ success: false, workspaceId: null });
    });
  });

  describe('getConnectionStatus', () => {
    it('should return connected status when GitHub is connected', async () => {
      mockWorkspaceRepo.findById.mockResolvedValue({
        settings: {
          integrations: {
            github: {
              connected: true,
              githubUsername: 'testuser',
              githubAvatarUrl: 'https://avatars.githubusercontent.com/u/1',
              connectedAt: '2025-01-01T00:00:00.000Z',
              tokenExpiresAt: '2025-01-02T00:00:00.000Z',
              scopes: ['repo', 'read:user', 'user:email'],
            },
          },
        },
      });

      const status = await service.getConnectionStatus('workspace-1');

      expect(status).toEqual({
        connected: true,
        githubUsername: 'testuser',
        githubAvatarUrl: 'https://avatars.githubusercontent.com/u/1',
        connectedAt: '2025-01-01T00:00:00.000Z',
        tokenExpiresAt: '2025-01-02T00:00:00.000Z',
        scopes: ['repo', 'read:user', 'user:email'],
      });
    });

    it('should return disconnected status when GitHub is not connected', async () => {
      mockWorkspaceRepo.findById.mockResolvedValue({
        settings: { integrations: {} },
      });

      const status = await service.getConnectionStatus('workspace-1');

      expect(status).toEqual({ connected: false });
    });

    it('should return disconnected status on error', async () => {
      mockWorkspaceRepo.findById.mockRejectedValue(new Error('DB error'));

      const status = await service.getConnectionStatus('workspace-1');

      expect(status).toEqual({ connected: false });
    });
  });

  describe('getDecryptedToken', () => {
    it('should return null when GitHub is not connected', async () => {
      mockWorkspaceRepo.findById.mockResolvedValue({
        settings: { integrations: {} },
      });

      const token = await service.getDecryptedToken('workspace-1');

      expect(token).toBeNull();
    });

    it('should return decrypted token when connected', async () => {
      const appSecret = mockEnvironmentService.getAppSecret();
      const encrypted = encryptToken('gho_test_token_123', appSecret);

      mockWorkspaceRepo.findById.mockResolvedValue({
        settings: {
          integrations: {
            github: {
              connected: true,
              accessToken: encrypted,
            },
          },
        },
      });

      const token = await service.getDecryptedToken('workspace-1');

      expect(token).toBe('gho_test_token_123');
    });

    it('should return null on decryption error', async () => {
      mockWorkspaceRepo.findById.mockResolvedValue({
        settings: {
          integrations: {
            github: {
              connected: true,
              accessToken: 'invalid-encrypted-data',
            },
          },
        },
      });

      const token = await service.getDecryptedToken('workspace-1');

      expect(token).toBeNull();
    });
  });

  describe('disconnect', () => {
    it('should clear GitHub settings', async () => {
      mockWorkspaceRepo.findById.mockResolvedValue({
        settings: { integrations: {} },
      });
      mockWorkspaceRepo.updateIntegrationSettings.mockResolvedValue({});

      await service.disconnect('workspace-1');

      expect(mockWorkspaceRepo.updateIntegrationSettings).toHaveBeenCalledWith(
        'workspace-1',
        {
          github: {
            connected: false,
            accessToken: null,
            refreshToken: null,
            tokenExpiresAt: null,
            refreshTokenExpiresAt: null,
            githubUserId: null,
            githubUsername: null,
            githubAvatarUrl: null,
            connectedAt: null,
            connectedBy: null,
            scopes: null,
          },
        },
      );
    });
  });
});
