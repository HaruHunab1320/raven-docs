import { UserRepo } from '@raven-docs/db/repos/user/user.repo';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { UpdateUserDto } from './dto/update-user.dto';
import { PaginationOptions } from '@raven-docs/db/pagination/pagination-options';
import { PaginationResult } from '@raven-docs/db/pagination/pagination';
import { User } from '@raven-docs/db/types/entity.types';
import { UpdateAgentProviderAuthDto } from './dto/update-agent-provider-auth.dto';
import { randomUUID } from 'crypto';
import { Cron } from '@nestjs/schedule';
import {
  ExchangeSubscriptionDto,
  SubscriptionProvider,
} from './dto/subscription-auth.dto';

type AgentProviderStatus = {
  keyPresent: boolean;
  source: 'user' | 'global' | 'none';
  available: boolean;
};

export type AgentProviderAvailabilityResponse = {
  providers: {
    claude: AgentProviderStatus;
    codex: AgentProviderStatus;
    gemini: AgentProviderStatus;
    aider: AgentProviderStatus;
  };
};

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);
  private readonly subscriptionFlowStates = new Map<
    string,
    {
      userId: string;
      workspaceId: string;
      provider: SubscriptionProvider;
      createdAt: number;
    }
  >();

  constructor(private userRepo: UserRepo) {}

  @Cron('*/5 * * * *')
  async refreshExpiringSubscriptionTokensJob() {
    if (process.env.SUBSCRIPTION_REFRESH_ENABLED === 'false') {
      return;
    }

    const leadMinutes = Number(process.env.SUBSCRIPTION_REFRESH_LEAD_MINUTES || 10);
    const leadMs = Number.isFinite(leadMinutes) && leadMinutes > 0 ? leadMinutes * 60_000 : 10 * 60_000;
    const batchSizeRaw = Number(process.env.SUBSCRIPTION_REFRESH_BATCH_SIZE || 500);
    const batchSize =
      Number.isFinite(batchSizeRaw) && batchSizeRaw > 0 ? batchSizeRaw : 500;

    try {
      const users =
        await this.userRepo.listUsersWithSubscriptionRefreshTokens(batchSize);
      if (!users.length) return;

      let refreshedCount = 0;
      for (const user of users) {
        const providerSettings = this.getAgentProviderSettings(user.settings);
        const oauthMeta = this.getAgentProviderOAuthMeta(user.settings);
        const workspaceId = user.workspaceId;
        if (!workspaceId) continue;

        if (
          providerSettings.claudeSubscriptionToken &&
          providerSettings.claudeSubscriptionRefreshToken &&
          this.isNearExpiryWindow(
            oauthMeta.anthropicSubscription?.expiresAt || null,
            leadMs,
          )
        ) {
          const refreshed = await this.tryRefreshSubscriptionToken(
            user,
            workspaceId,
            'anthropic-subscription',
          );
          if (refreshed) refreshedCount += 1;
        }

        if (
          providerSettings.openaiSubscriptionToken &&
          providerSettings.openaiSubscriptionRefreshToken &&
          this.isNearExpiryWindow(
            oauthMeta.openaiCodex?.expiresAt || null,
            leadMs,
          )
        ) {
          const refreshed = await this.tryRefreshSubscriptionToken(
            user,
            workspaceId,
            'openai-codex',
          );
          if (refreshed) refreshedCount += 1;
        }
      }

      if (refreshedCount > 0) {
        this.logger.log(
          `Subscription refresh job rotated ${refreshedCount} token(s)`,
        );
      }
    } catch (error: any) {
      this.logger.warn(
        `Subscription refresh job failed: ${error?.message || 'unknown error'}`,
      );
    }
  }

  async findById(userId: string, workspaceId: string) {
    const logger = new Logger('UserService');
    logger.debug(
      `UserService: Finding user by ID: ${userId}, workspace: ${workspaceId}`,
    );

    try {
      const user = await this.userRepo.findById(userId, workspaceId);

      if (!user) {
        logger.warn(
          `UserService: User not found - userId: ${userId}, workspaceId: ${workspaceId}`,
        );
        return null;
      }

      if (user.workspaceId !== workspaceId) {
        logger.warn(
          `UserService: User found but workspaceId mismatch - userId: ${userId}, user.workspaceId: ${user.workspaceId}, requested workspaceId: ${workspaceId}`,
        );
      }

      logger.debug(`UserService: User found - ${user.email}`);
      return user;
    } catch (error: any) {
      logger.error(
        `UserService: Error finding user - ${error.message || 'Unknown error'}`,
        error.stack || '',
      );
      if (error.code) {
        logger.error(`UserService: Error code: ${error.code}`);
      }
      if (error.detail) {
        logger.error(`UserService: Error detail: ${error.detail}`);
      }
      return null;
    }
  }

  async getWorkspaceUsers(
    workspaceId: string,
    pagination: PaginationOptions,
  ): Promise<PaginationResult<User>> {
    return this.userRepo.getUsersPaginated(workspaceId, pagination);
  }

  async update(
    updateUserDto: UpdateUserDto,
    userId: string,
    workspaceId: string,
  ) {
    const user = await this.userRepo.findById(userId, workspaceId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // preference updates
    if (typeof updateUserDto.fullPageWidth !== 'undefined') {
      return this.userRepo.updatePreference(
        userId,
        'fullPageWidth',
        updateUserDto.fullPageWidth,
      );
    }

    if (typeof updateUserDto.themeId !== 'undefined') {
      return this.userRepo.updatePreference(
        userId,
        'themeId',
        updateUserDto.themeId,
      );
    }

    if (typeof updateUserDto.enableActivityTracking !== 'undefined') {
      return this.userRepo.updatePreference(
        userId,
        'enableActivityTracking',
        updateUserDto.enableActivityTracking,
      );
    }

    if (updateUserDto.name) {
      user.name = updateUserDto.name;
    }

    if (updateUserDto.email && user.email != updateUserDto.email) {
      if (await this.userRepo.findByEmail(updateUserDto.email, workspaceId)) {
        throw new BadRequestException('A user with this email already exists');
      }
      user.email = updateUserDto.email;
    }

    if (updateUserDto.avatarUrl) {
      user.avatarUrl = updateUserDto.avatarUrl;
    }

    if (updateUserDto.locale) {
      user.locale = updateUserDto.locale;
    }

    await this.userRepo.updateUser(updateUserDto, userId, workspaceId);
    return user;
  }

  async getAgentProviderAvailability(
    userId: string,
    workspaceId: string,
  ): Promise<AgentProviderAvailabilityResponse> {
    const user = await this.userRepo.findById(userId, workspaceId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const providerSettings = this.getAgentProviderSettings(user.settings);
    const hasAnthropic = Boolean(providerSettings.anthropicApiKey);
    const hasClaudeSubscription = Boolean(
      providerSettings.claudeSubscriptionToken,
    );
    const hasOpenAI = Boolean(providerSettings.openaiApiKey);
    const hasOpenAISubscription = Boolean(
      providerSettings.openaiSubscriptionToken,
    );
    const hasGoogle = Boolean(providerSettings.googleApiKey);

    const globalAnthropic = Boolean(
      process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN,
    );
    const globalOpenAI = Boolean(
      process.env.OPENAI_API_KEY || process.env.OPENAI_AUTH_TOKEN,
    );
    const globalGoogle = Boolean(
      process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY,
    );

    const claudeAvailable =
      hasAnthropic || hasClaudeSubscription || globalAnthropic;
    const codexAvailable = hasOpenAI || hasOpenAISubscription || globalOpenAI;
    const geminiAvailable = hasGoogle || globalGoogle;
    const aiderAvailable = claudeAvailable || codexAvailable || geminiAvailable;

    return {
      providers: {
        claude: {
          keyPresent: claudeAvailable,
          source:
            hasAnthropic || hasClaudeSubscription
              ? 'user'
              : globalAnthropic
                ? 'global'
                : 'none',
          available: claudeAvailable,
        },
        codex: {
          keyPresent: codexAvailable,
          source:
            hasOpenAI || hasOpenAISubscription
              ? 'user'
              : globalOpenAI
                ? 'global'
                : 'none',
          available: codexAvailable,
        },
        gemini: {
          keyPresent: geminiAvailable,
          source: hasGoogle ? 'user' : globalGoogle ? 'global' : 'none',
          available: geminiAvailable,
        },
        aider: {
          keyPresent: aiderAvailable,
          source: hasOpenAI || hasOpenAISubscription
            ? 'user'
            : hasAnthropic || hasClaudeSubscription
              ? 'user'
              : hasGoogle
                ? 'user'
                : globalOpenAI || globalAnthropic || globalGoogle
                  ? 'global'
                  : 'none',
          available: aiderAvailable,
        },
      },
    };
  }

  async updateAgentProviderAuth(
    userId: string,
    workspaceId: string,
    dto: UpdateAgentProviderAuthDto,
  ): Promise<AgentProviderAvailabilityResponse> {
    const user = await this.userRepo.findById(userId, workspaceId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const settings = ((user.settings as any) || {}) as Record<string, any>;
    const integrations = (settings.integrations || {}) as Record<string, any>;
    const agentProviders = {
      ...(integrations.agentProviders || {}),
    } as Record<string, any>;

    this.applySecretUpdate(agentProviders, 'anthropicApiKey', dto.anthropicApiKey);
    this.applySecretUpdate(
      agentProviders,
      'claudeSubscriptionToken',
      dto.claudeSubscriptionToken,
    );
    this.applySecretUpdate(agentProviders, 'openaiApiKey', dto.openaiApiKey);
    this.applySecretUpdate(
      agentProviders,
      'openaiSubscriptionToken',
      dto.openaiSubscriptionToken,
    );
    this.applySecretUpdate(agentProviders, 'googleApiKey', dto.googleApiKey);

    const nextSettings = {
      ...settings,
      integrations: {
        ...integrations,
        agentProviders,
      },
    };

    await this.userRepo.updateUser(
      {
        settings: nextSettings,
      } as any,
      userId,
      workspaceId,
    );

    return this.getAgentProviderAvailability(userId, workspaceId);
  }

  private getAgentProviderSettings(settings: unknown): {
    anthropicApiKey?: string;
    claudeSubscriptionToken?: string;
    claudeSubscriptionRefreshToken?: string;
    openaiApiKey?: string;
    openaiSubscriptionToken?: string;
    openaiSubscriptionRefreshToken?: string;
    googleApiKey?: string;
  } {
    const record = (settings || {}) as Record<string, any>;
    const integrations = (record.integrations || {}) as Record<string, any>;
    return (integrations.agentProviders || {}) as {
      anthropicApiKey?: string;
      claudeSubscriptionToken?: string;
      claudeSubscriptionRefreshToken?: string;
      openaiApiKey?: string;
      openaiSubscriptionToken?: string;
      openaiSubscriptionRefreshToken?: string;
      googleApiKey?: string;
    };
  }

  private applySecretUpdate(
    target: Record<string, any>,
    key: string,
    value: string | undefined,
  ) {
    if (typeof value === 'undefined') return;
    const trimmed = value.trim();
    if (!trimmed) {
      delete target[key];
      return;
    }
    target[key] = trimmed;
  }

  async getSubscriptionStatus(userId: string, workspaceId: string) {
    const user = await this.userRepo.findById(userId, workspaceId);
    if (!user) throw new NotFoundException('User not found');

    const providerSettings = this.getAgentProviderSettings(user.settings);
    const oauthMeta = this.getAgentProviderOAuthMeta(user.settings);

    return {
      providers: {
        'anthropic-subscription': {
          connected: Boolean(
            providerSettings.claudeSubscriptionToken ||
              process.env.ANTHROPIC_AUTH_TOKEN,
          ),
          source: providerSettings.claudeSubscriptionToken
            ? 'user'
            : process.env.ANTHROPIC_AUTH_TOKEN
              ? 'global'
              : 'none',
          connectedAt: oauthMeta.anthropicSubscription?.connectedAt || null,
          expiresAt: oauthMeta.anthropicSubscription?.expiresAt || null,
        },
        'openai-codex': {
          connected: Boolean(
            providerSettings.openaiSubscriptionToken ||
              process.env.OPENAI_AUTH_TOKEN,
          ),
          source: providerSettings.openaiSubscriptionToken
            ? 'user'
            : process.env.OPENAI_AUTH_TOKEN
              ? 'global'
              : 'none',
          connectedAt: oauthMeta.openaiCodex?.connectedAt || null,
          expiresAt: oauthMeta.openaiCodex?.expiresAt || null,
        },
      },
    };
  }

  async resolveAgentProviderEnv(
    userId: string | undefined,
    workspaceId: string,
  ): Promise<Record<string, string>> {
    const env: Record<string, string> = {};

    if (!userId) {
      if (process.env.ANTHROPIC_API_KEY) env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
      if (process.env.ANTHROPIC_AUTH_TOKEN)
        env.ANTHROPIC_AUTH_TOKEN = process.env.ANTHROPIC_AUTH_TOKEN;
      if (process.env.OPENAI_API_KEY) env.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
      if (process.env.OPENAI_AUTH_TOKEN)
        env.OPENAI_AUTH_TOKEN = process.env.OPENAI_AUTH_TOKEN;
      if (process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY) {
        env.GOOGLE_API_KEY =
          process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '';
      }
      return env;
    }

    const user = await this.userRepo.findById(userId, workspaceId);
    if (!user) return env;

    let providerSettings = this.getAgentProviderSettings(user.settings);
    let oauthMeta = this.getAgentProviderOAuthMeta(user.settings);

    // Refresh near-expiry subscription tokens on demand.
    const anthropicExpiry = oauthMeta.anthropicSubscription?.expiresAt || null;
    if (
      providerSettings.claudeSubscriptionToken &&
      providerSettings.claudeSubscriptionRefreshToken &&
      this.isNearExpiry(anthropicExpiry)
    ) {
      const refreshed = await this.tryRefreshSubscriptionToken(
        user,
        workspaceId,
        'anthropic-subscription',
      );
      if (refreshed) {
        providerSettings = this.getAgentProviderSettings(refreshed.settings);
        oauthMeta = this.getAgentProviderOAuthMeta(refreshed.settings);
      }
    }

    const openaiExpiry = oauthMeta.openaiCodex?.expiresAt || null;
    if (
      providerSettings.openaiSubscriptionToken &&
      providerSettings.openaiSubscriptionRefreshToken &&
      this.isNearExpiry(openaiExpiry)
    ) {
      const refreshed = await this.tryRefreshSubscriptionToken(
        user,
        workspaceId,
        'openai-codex',
      );
      if (refreshed) {
        providerSettings = this.getAgentProviderSettings(refreshed.settings);
      }
    }

    if (providerSettings.anthropicApiKey) {
      env.ANTHROPIC_API_KEY = providerSettings.anthropicApiKey;
    } else if (providerSettings.claudeSubscriptionToken) {
      env.ANTHROPIC_AUTH_TOKEN = providerSettings.claudeSubscriptionToken;
    } else if (process.env.ANTHROPIC_API_KEY) {
      env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    } else if (process.env.ANTHROPIC_AUTH_TOKEN) {
      env.ANTHROPIC_AUTH_TOKEN = process.env.ANTHROPIC_AUTH_TOKEN;
    }

    if (providerSettings.openaiApiKey) {
      env.OPENAI_API_KEY = providerSettings.openaiApiKey;
    } else if (providerSettings.openaiSubscriptionToken) {
      env.OPENAI_AUTH_TOKEN = providerSettings.openaiSubscriptionToken;
    } else if (process.env.OPENAI_API_KEY) {
      env.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    } else if (process.env.OPENAI_AUTH_TOKEN) {
      env.OPENAI_AUTH_TOKEN = process.env.OPENAI_AUTH_TOKEN;
    }

    if (providerSettings.googleApiKey) {
      env.GOOGLE_API_KEY = providerSettings.googleApiKey;
    } else if (process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY) {
      env.GOOGLE_API_KEY =
        process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '';
    }

    return env;
  }

  async startSubscriptionAuth(
    userId: string,
    workspaceId: string,
    provider: SubscriptionProvider,
  ) {
    const user = await this.userRepo.findById(userId, workspaceId);
    if (!user) throw new NotFoundException('User not found');

    this.cleanupExpiredSubscriptionStates();

    const state = randomUUID();
    this.subscriptionFlowStates.set(state, {
      userId,
      workspaceId,
      provider,
      createdAt: Date.now(),
    });

    const config = this.getSubscriptionOAuthConfig(provider);
    if (!config.clientId || !config.authUrl) {
      throw new BadRequestException(
        `${provider} OAuth is not configured on this server`,
      );
    }

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      state,
      scope: config.scope,
    });

    return {
      provider,
      state,
      authUrl: `${config.authUrl}?${params.toString()}`,
    };
  }

  async exchangeSubscriptionCode(
    userId: string,
    workspaceId: string,
    dto: ExchangeSubscriptionDto,
  ) {
    const user = await this.userRepo.findById(userId, workspaceId);
    if (!user) throw new NotFoundException('User not found');

    const state = dto.state?.trim();
    if (!state) {
      throw new BadRequestException('state is required');
    }
    const flow = this.subscriptionFlowStates.get(state);
    if (!flow) {
      throw new BadRequestException('Invalid or expired OAuth state');
    }
    if (
      flow.userId !== userId ||
      flow.workspaceId !== workspaceId ||
      flow.provider !== dto.provider
    ) {
      throw new BadRequestException('OAuth state does not match request context');
    }
    this.subscriptionFlowStates.delete(state);

    const config = this.getSubscriptionOAuthConfig(dto.provider);
    if (!config.tokenUrl || !config.clientId || !config.clientSecret) {
      throw new BadRequestException(
        `${dto.provider} token exchange is not configured on this server`,
      );
    }

    const payload = new URLSearchParams({
      grant_type: 'authorization_code',
      code: dto.code.trim(),
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
    });

    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: payload.toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new BadRequestException(
        `Failed to exchange OAuth code for ${dto.provider}: ${text || response.statusText}`,
      );
    }

    const body = (await response.json()) as Record<string, any>;
    const accessToken = String(body.access_token || '').trim();
    if (!accessToken) {
      throw new BadRequestException('OAuth provider returned no access_token');
    }

    const expiresIn =
      typeof body.expires_in === 'number' && body.expires_in > 0
        ? body.expires_in
        : null;
    const expiresAt = expiresIn
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : null;

    await this.persistSubscriptionToken(
      user,
      workspaceId,
      dto.provider,
      accessToken,
      typeof body.refresh_token === 'string' ? body.refresh_token : null,
      {
        connectedAt: new Date().toISOString(),
        expiresAt,
        refreshTokenPresent: Boolean(body.refresh_token),
        tokenType: typeof body.token_type === 'string' ? body.token_type : null,
      },
    );

    return {
      success: true,
      provider: dto.provider,
      connected: true,
      expiresAt,
    };
  }

  async setupSubscriptionToken(
    userId: string,
    workspaceId: string,
    provider: SubscriptionProvider,
    token: string,
  ) {
    const user = await this.userRepo.findById(userId, workspaceId);
    if (!user) throw new NotFoundException('User not found');
    const trimmed = token.trim();
    if (!trimmed) {
      throw new BadRequestException('token is required');
    }

    await this.persistSubscriptionToken(
      user,
      workspaceId,
      provider,
      trimmed,
      null,
      {
        connectedAt: new Date().toISOString(),
        expiresAt: null,
        refreshTokenPresent: false,
        tokenType: null,
      },
    );

    return {
      success: true,
      provider,
      connected: true,
    };
  }

  async deleteSubscription(
    userId: string,
    workspaceId: string,
    provider: SubscriptionProvider,
  ) {
    const user = await this.userRepo.findById(userId, workspaceId);
    if (!user) throw new NotFoundException('User not found');

    const settings = ((user.settings as any) || {}) as Record<string, any>;
    const integrations = (settings.integrations || {}) as Record<string, any>;
    const agentProviders = {
      ...(integrations.agentProviders || {}),
    } as Record<string, any>;
    const oauthMeta = {
      ...(integrations.agentProvidersOAuth || {}),
    } as Record<string, any>;

    if (provider === 'anthropic-subscription') {
      delete agentProviders.claudeSubscriptionToken;
      delete agentProviders.claudeSubscriptionRefreshToken;
      delete oauthMeta.anthropicSubscription;
    } else {
      delete agentProviders.openaiSubscriptionToken;
      delete agentProviders.openaiSubscriptionRefreshToken;
      delete oauthMeta.openaiCodex;
    }

    await this.userRepo.updateUser(
      {
        settings: {
          ...settings,
          integrations: {
            ...integrations,
            agentProviders,
            agentProvidersOAuth: oauthMeta,
          },
        },
      } as any,
      userId,
      workspaceId,
    );

    return { success: true, provider };
  }

  private async persistSubscriptionToken(
    user: User,
    workspaceId: string,
    provider: SubscriptionProvider,
    token: string,
    refreshToken: string | null,
    meta: {
      connectedAt: string;
      expiresAt: string | null;
      refreshTokenPresent: boolean;
      tokenType: string | null;
    },
  ) {
    const settings = ((user.settings as any) || {}) as Record<string, any>;
    const integrations = (settings.integrations || {}) as Record<string, any>;
    const agentProviders = {
      ...(integrations.agentProviders || {}),
    } as Record<string, any>;
    const oauthMeta = {
      ...(integrations.agentProvidersOAuth || {}),
    } as Record<string, any>;

    if (provider === 'anthropic-subscription') {
      agentProviders.claudeSubscriptionToken = token;
      if (refreshToken) {
        agentProviders.claudeSubscriptionRefreshToken = refreshToken;
      }
      oauthMeta.anthropicSubscription = meta;
    } else {
      agentProviders.openaiSubscriptionToken = token;
      if (refreshToken) {
        agentProviders.openaiSubscriptionRefreshToken = refreshToken;
      }
      oauthMeta.openaiCodex = meta;
    }

    await this.userRepo.updateUser(
      {
        settings: {
          ...settings,
          integrations: {
            ...integrations,
            agentProviders,
            agentProvidersOAuth: oauthMeta,
          },
        },
      } as any,
      user.id,
      workspaceId,
    );
  }

  private getAgentProviderOAuthMeta(settings: unknown): {
    anthropicSubscription?: {
      connectedAt?: string;
      expiresAt?: string | null;
    };
    openaiCodex?: {
      connectedAt?: string;
      expiresAt?: string | null;
    };
  } {
    const record = (settings || {}) as Record<string, any>;
    const integrations = (record.integrations || {}) as Record<string, any>;
    return (integrations.agentProvidersOAuth || {}) as {
      anthropicSubscription?: {
        connectedAt?: string;
        expiresAt?: string | null;
      };
      openaiCodex?: {
        connectedAt?: string;
        expiresAt?: string | null;
      };
    };
  }

  private getSubscriptionOAuthConfig(provider: SubscriptionProvider): {
    authUrl: string;
    tokenUrl: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    scope: string;
  } {
    const appUrl = process.env.APP_URL || 'http://localhost:3000';

    if (provider === 'anthropic-subscription') {
      return {
        authUrl:
          process.env.ANTHROPIC_SUBSCRIPTION_AUTH_URL ||
          'https://claude.ai/oauth/authorize',
        tokenUrl:
          process.env.ANTHROPIC_SUBSCRIPTION_TOKEN_URL ||
          'https://api.anthropic.com/oauth/token',
        clientId: process.env.ANTHROPIC_SUBSCRIPTION_CLIENT_ID || '',
        clientSecret: process.env.ANTHROPIC_SUBSCRIPTION_CLIENT_SECRET || '',
        redirectUri:
          process.env.ANTHROPIC_SUBSCRIPTION_REDIRECT_URI ||
          `${appUrl}/settings/workspace/agents`,
        scope: process.env.ANTHROPIC_SUBSCRIPTION_SCOPE || 'offline_access',
      };
    }

    return {
      authUrl:
        process.env.OPENAI_SUBSCRIPTION_AUTH_URL ||
        'https://auth.openai.com/oauth/authorize',
      tokenUrl:
        process.env.OPENAI_SUBSCRIPTION_TOKEN_URL ||
        'https://auth.openai.com/oauth/token',
      clientId: process.env.OPENAI_SUBSCRIPTION_CLIENT_ID || '',
      clientSecret: process.env.OPENAI_SUBSCRIPTION_CLIENT_SECRET || '',
      redirectUri:
        process.env.OPENAI_SUBSCRIPTION_REDIRECT_URI ||
        `${appUrl}/settings/workspace/agents`,
      scope: process.env.OPENAI_SUBSCRIPTION_SCOPE || 'openid profile email',
    };
  }

  private cleanupExpiredSubscriptionStates() {
    const maxAgeMs = 10 * 60 * 1000;
    const now = Date.now();
    for (const [state, value] of this.subscriptionFlowStates.entries()) {
      if (now - value.createdAt > maxAgeMs) {
        this.subscriptionFlowStates.delete(state);
      }
    }
  }

  private isNearExpiry(expiresAt: string | null | undefined): boolean {
    if (!expiresAt) return false;
    const expiry = Date.parse(expiresAt);
    if (Number.isNaN(expiry)) return false;
    return expiry - Date.now() <= 60_000;
  }

  private isNearExpiryWindow(
    expiresAt: string | null | undefined,
    leadMs: number,
  ): boolean {
    if (!expiresAt) return false;
    const expiry = Date.parse(expiresAt);
    if (Number.isNaN(expiry)) return false;
    return expiry - Date.now() <= leadMs;
  }

  private async tryRefreshSubscriptionToken(
    user: User,
    workspaceId: string,
    provider: SubscriptionProvider,
  ): Promise<User | null> {
    try {
      const providerSettings = this.getAgentProviderSettings(user.settings);
      const refreshToken =
        provider === 'anthropic-subscription'
          ? providerSettings.claudeSubscriptionRefreshToken
          : providerSettings.openaiSubscriptionRefreshToken;
      if (!refreshToken) return null;

      const config = this.getSubscriptionOAuthConfig(provider);
      if (!config.tokenUrl || !config.clientId || !config.clientSecret) return null;

      const payload = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      });

      const response = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: payload.toString(),
      });
      if (!response.ok) {
        this.logger.warn(
          `Subscription token refresh failed for ${provider}: ${response.status}`,
        );
        return null;
      }

      const body = (await response.json()) as Record<string, any>;
      const accessToken = String(body.access_token || '').trim();
      if (!accessToken) return null;

      const expiresIn =
        typeof body.expires_in === 'number' && body.expires_in > 0
          ? body.expires_in
          : null;
      const expiresAt = expiresIn
        ? new Date(Date.now() + expiresIn * 1000).toISOString()
        : null;
      const nextRefreshToken =
        typeof body.refresh_token === 'string' && body.refresh_token.trim()
          ? body.refresh_token.trim()
          : refreshToken;

      await this.persistSubscriptionToken(
        user,
        workspaceId,
        provider,
        accessToken,
        nextRefreshToken,
        {
          connectedAt: new Date().toISOString(),
          expiresAt,
          refreshTokenPresent: true,
          tokenType: typeof body.token_type === 'string' ? body.token_type : null,
        },
      );

      this.logger.log(`Refreshed subscription token for ${provider}`);
      return this.userRepo.findById(user.id, workspaceId);
    } catch (error: any) {
      this.logger.warn(
        `Failed to refresh subscription token for ${provider}: ${error?.message || 'unknown error'}`,
      );
      return null;
    }
  }
}
