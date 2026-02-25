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
  constructor(private userRepo: UserRepo) {}

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
    openaiApiKey?: string;
    openaiSubscriptionToken?: string;
    googleApiKey?: string;
  } {
    const record = (settings || {}) as Record<string, any>;
    const integrations = (record.integrations || {}) as Record<string, any>;
    return (integrations.agentProviders || {}) as {
      anthropicApiKey?: string;
      claudeSubscriptionToken?: string;
      openaiApiKey?: string;
      openaiSubscriptionToken?: string;
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
}
