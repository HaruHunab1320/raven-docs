import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { EnvironmentService } from '../environment/environment.service';
import { WorkspaceRepo } from '../../database/repos/workspace/workspace.repo';
import { encryptToken, decryptToken } from './github-crypto.util';

interface PendingState {
  workspaceId: string;
  userId: string;
  expiresAt: number;
}

export interface GitHubOAuthTokens {
  connected: boolean;
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt?: string;
  refreshTokenExpiresAt?: string;
  githubUserId: number;
  githubUsername: string;
  githubAvatarUrl?: string;
  connectedAt: string;
  connectedBy: string;
  scopes: string[];
}

export interface GitHubConnectionStatus {
  connected: boolean;
  githubUsername?: string;
  githubAvatarUrl?: string;
  connectedAt?: string;
  tokenExpiresAt?: string;
  scopes?: string[];
}

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes before expiry

@Injectable()
export class GitHubOAuthService implements OnModuleDestroy {
  private readonly logger = new Logger(GitHubOAuthService.name);
  private readonly pendingStates = new Map<string, PendingState>();
  private cleanupInterval: NodeJS.Timeout;

  constructor(
    private readonly environmentService: EnvironmentService,
    private readonly workspaceRepo: WorkspaceRepo,
  ) {
    this.cleanupInterval = setInterval(
      () => this.cleanupExpiredStates(),
      CLEANUP_INTERVAL_MS,
    );
  }

  onModuleDestroy() {
    clearInterval(this.cleanupInterval);
  }

  generateAuthorizationUrl(workspaceId: string, userId: string): string {
    const clientId = this.environmentService.getGitHubAppClientId();
    if (!clientId) {
      throw new Error('GitHub App client ID is not configured');
    }

    const state = randomBytes(32).toString('hex');
    this.pendingStates.set(state, {
      workspaceId,
      userId,
      expiresAt: Date.now() + STATE_TTL_MS,
    });

    const appUrl = this.environmentService.getAppUrl();
    const redirectUri = `${appUrl}/api/integrations/github/callback`;
    const scopes = 'repo read:user user:email';

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scopes,
      state,
    });

    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  async handleCallback(
    code: string,
    state: string,
  ): Promise<{ success: boolean; workspaceId: string | null }> {
    const pending = this.pendingStates.get(state);
    if (!pending) {
      this.logger.warn('Invalid or expired OAuth state parameter');
      return { success: false, workspaceId: null };
    }

    if (Date.now() > pending.expiresAt) {
      this.pendingStates.delete(state);
      this.logger.warn('Expired OAuth state parameter');
      return { success: false, workspaceId: null };
    }

    this.pendingStates.delete(state);

    try {
      const tokens = await this.exchangeCodeForTokens(code);
      const profile = await this.fetchGitHubUser(tokens.access_token);
      const appSecret = this.environmentService.getAppSecret();

      const githubSettings: GitHubOAuthTokens = {
        connected: true,
        accessToken: encryptToken(tokens.access_token, appSecret),
        refreshToken: tokens.refresh_token
          ? encryptToken(tokens.refresh_token, appSecret)
          : undefined,
        tokenExpiresAt: tokens.expires_in
          ? new Date(
              Date.now() + tokens.expires_in * 1000,
            ).toISOString()
          : undefined,
        refreshTokenExpiresAt: tokens.refresh_token_expires_in
          ? new Date(
              Date.now() + tokens.refresh_token_expires_in * 1000,
            ).toISOString()
          : undefined,
        githubUserId: profile.id,
        githubUsername: profile.login,
        githubAvatarUrl: profile.avatar_url,
        connectedAt: new Date().toISOString(),
        connectedBy: pending.userId,
        scopes: tokens.scope ? tokens.scope.split(',') : [],
      };

      await this.workspaceRepo.updateIntegrationSettings(
        pending.workspaceId,
        { github: githubSettings },
      );

      this.logger.log(
        `GitHub connected for workspace ${pending.workspaceId} by user ${pending.userId} (${profile.login})`,
      );

      return { success: true, workspaceId: pending.workspaceId };
    } catch (error: any) {
      this.logger.error(
        `GitHub OAuth callback failed: ${error.message}`,
        error.stack,
      );
      return { success: false, workspaceId: pending.workspaceId };
    }
  }

  async getDecryptedToken(workspaceId: string): Promise<string | null> {
    try {
      const workspace = await this.workspaceRepo.findById(workspaceId);
      const settings = workspace?.settings as any;
      const github = settings?.integrations?.github;

      if (!github?.connected || !github?.accessToken) {
        return null;
      }

      await this.refreshTokenIfNeeded(workspaceId, github);

      const appSecret = this.environmentService.getAppSecret();

      // Re-read in case refresh updated the token
      if (github.tokenExpiresAt) {
        const freshWorkspace = await this.workspaceRepo.findById(workspaceId);
        const freshGithub = (freshWorkspace?.settings as any)?.integrations
          ?.github;
        if (freshGithub?.accessToken) {
          return decryptToken(freshGithub.accessToken, appSecret);
        }
      }

      return decryptToken(github.accessToken, appSecret);
    } catch (error: any) {
      this.logger.error(
        `Failed to get decrypted GitHub token: ${error.message}`,
      );
      return null;
    }
  }

  async disconnect(workspaceId: string): Promise<void> {
    try {
      const workspace = await this.workspaceRepo.findById(workspaceId);
      const settings = workspace?.settings as any;
      const github = settings?.integrations?.github;

      if (github?.accessToken) {
        const appSecret = this.environmentService.getAppSecret();
        const token = decryptToken(github.accessToken, appSecret);
        await this.revokeTokenOnGitHub(token).catch((err) =>
          this.logger.warn(`Failed to revoke GitHub token: ${err.message}`),
        );
      }
    } catch (error: any) {
      this.logger.warn(
        `Error during GitHub disconnect cleanup: ${error.message}`,
      );
    }

    await this.workspaceRepo.updateIntegrationSettings(workspaceId, {
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
    });

    this.logger.log(`GitHub disconnected for workspace ${workspaceId}`);
  }

  async getConnectionStatus(
    workspaceId: string,
  ): Promise<GitHubConnectionStatus> {
    try {
      const workspace = await this.workspaceRepo.findById(workspaceId);
      const settings = workspace?.settings as any;
      const github = settings?.integrations?.github;

      if (!github?.connected) {
        return { connected: false };
      }

      return {
        connected: true,
        githubUsername: github.githubUsername,
        githubAvatarUrl: github.githubAvatarUrl,
        connectedAt: github.connectedAt,
        tokenExpiresAt: github.tokenExpiresAt,
        scopes: github.scopes,
      };
    } catch {
      return { connected: false };
    }
  }

  private async refreshTokenIfNeeded(
    workspaceId: string,
    github: any,
  ): Promise<void> {
    if (!github.tokenExpiresAt || !github.refreshToken) return;

    const expiresAt = new Date(github.tokenExpiresAt).getTime();
    if (Date.now() + REFRESH_BUFFER_MS < expiresAt) return;

    this.logger.log(`Refreshing GitHub token for workspace ${workspaceId}`);

    try {
      const appSecret = this.environmentService.getAppSecret();
      const refreshToken = decryptToken(github.refreshToken, appSecret);

      const clientId = this.environmentService.getGitHubAppClientId();
      const clientSecret = this.environmentService.getGitHubAppClientSecret();

      const response = await fetch(
        'https://github.com/login/oauth/access_token',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
          }),
        },
      );

      const data = await response.json();

      if (data.error) {
        throw new Error(`GitHub refresh failed: ${data.error_description || data.error}`);
      }

      const updatedSettings: Partial<GitHubOAuthTokens> = {
        accessToken: encryptToken(data.access_token, appSecret),
        tokenExpiresAt: data.expires_in
          ? new Date(Date.now() + data.expires_in * 1000).toISOString()
          : undefined,
      };

      if (data.refresh_token) {
        updatedSettings.refreshToken = encryptToken(
          data.refresh_token,
          appSecret,
        );
        updatedSettings.refreshTokenExpiresAt = data.refresh_token_expires_in
          ? new Date(
              Date.now() + data.refresh_token_expires_in * 1000,
            ).toISOString()
          : undefined;
      }

      await this.workspaceRepo.updateIntegrationSettings(workspaceId, {
        github: updatedSettings,
      });

      this.logger.log(
        `GitHub token refreshed for workspace ${workspaceId}`,
      );
    } catch (error: any) {
      this.logger.error(
        `Failed to refresh GitHub token: ${error.message}`,
        error.stack,
      );
    }
  }

  private async exchangeCodeForTokens(code: string): Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    refresh_token_expires_in?: number;
    scope?: string;
    token_type: string;
  }> {
    const clientId = this.environmentService.getGitHubAppClientId();
    const clientSecret = this.environmentService.getGitHubAppClientSecret();
    const appUrl = this.environmentService.getAppUrl();
    const redirectUri = `${appUrl}/api/integrations/github/callback`;

    const response = await fetch(
      'https://github.com/login/oauth/access_token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
        }),
      },
    );

    const data = await response.json();

    if (data.error) {
      throw new Error(
        `GitHub token exchange failed: ${data.error_description || data.error}`,
      );
    }

    return data;
  }

  private async fetchGitHubUser(
    accessToken: string,
  ): Promise<{ id: number; login: string; avatar_url: string }> {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub user fetch failed: ${response.statusText}`);
    }

    return response.json();
  }

  private async revokeTokenOnGitHub(token: string): Promise<void> {
    const clientId = this.environmentService.getGitHubAppClientId();
    const clientSecret = this.environmentService.getGitHubAppClientSecret();

    if (!clientId || !clientSecret) return;

    const response = await fetch(
      `https://api.github.com/applications/${clientId}/token`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
          Accept: 'application/vnd.github+json',
        },
        body: JSON.stringify({ access_token: token }),
      },
    );

    if (!response.ok && response.status !== 404) {
      throw new Error(`GitHub token revocation failed: ${response.statusText}`);
    }
  }

  private cleanupExpiredStates(): void {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, value] of this.pendingStates) {
      if (now > value.expiresAt) {
        this.pendingStates.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      this.logger.debug(`Cleaned up ${cleaned} expired GitHub OAuth states`);
    }
  }
}
