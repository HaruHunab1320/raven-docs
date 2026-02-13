import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { UserRepo } from '../../database/repos/user/user.repo';
import { WorkspaceRepo } from '../../database/repos/workspace/workspace.repo';
import { SpaceRepo } from '@raven-docs/db/repos/space/space.repo';
import { User, Workspace } from '@raven-docs/db/types/entity.types';

export interface DiscordLinkingToken {
  token: string;
  discordUserId: string;
  discordGuildId: string;
  expiresAt: Date;
}

export interface ChannelSpaceMapping {
  discordChannelId: string;
  spaceId: string;
  spaceName?: string;
}

@Injectable()
export class DiscordLinkingService {
  private readonly logger = new Logger(DiscordLinkingService.name);

  // In-memory store for pending link tokens (maps token -> discord info)
  // In production, consider using Redis for this
  private pendingLinks = new Map<
    string,
    {
      discordUserId: string;
      discordGuildId: string;
      workspaceId: string;
      expiresAt: Date;
    }
  >();

  constructor(
    private readonly userRepo: UserRepo,
    private readonly workspaceRepo: WorkspaceRepo,
    private readonly spaceRepo: SpaceRepo,
  ) {
    // Clean up expired tokens every 5 minutes
    setInterval(() => this.cleanupExpiredTokens(), 5 * 60 * 1000);
  }

  /**
   * Generate a unique linking token for a Discord user.
   * The user will click a link with this token to authenticate.
   */
  async generateLinkingToken(
    discordUserId: string,
    discordGuildId: string,
    workspaceId: string,
  ): Promise<DiscordLinkingToken> {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Store in memory (could also store in database)
    this.pendingLinks.set(token, {
      discordUserId,
      discordGuildId,
      workspaceId,
      expiresAt,
    });

    this.logger.log(
      `Generated linking token for Discord user ${discordUserId} in guild ${discordGuildId}`,
    );

    return {
      token,
      discordUserId,
      discordGuildId,
      expiresAt,
    };
  }

  /**
   * Verify a linking token and associate the Discord user with a Raven user.
   */
  async verifyAndLink(
    token: string,
    ravenUserId: string,
  ): Promise<{ success: boolean; message: string; user?: User }> {
    const pending = this.pendingLinks.get(token);

    if (!pending) {
      return { success: false, message: 'Invalid or expired linking token' };
    }

    if (new Date() > pending.expiresAt) {
      this.pendingLinks.delete(token);
      return { success: false, message: 'Linking token has expired' };
    }

    // Check if this Discord user is already linked to another Raven user
    const existingUser = await this.userRepo.findByDiscordUserId(
      pending.discordUserId,
      pending.workspaceId,
    );

    if (existingUser && existingUser.id !== ravenUserId) {
      return {
        success: false,
        message: 'This Discord account is already linked to another Raven user',
      };
    }

    // Check if the Raven user exists
    const ravenUser = await this.userRepo.findById(
      ravenUserId,
      pending.workspaceId,
    );

    if (!ravenUser) {
      return { success: false, message: 'Raven user not found' };
    }

    // Link the accounts
    const linkedUser = await this.userRepo.linkDiscordUser(
      ravenUserId,
      pending.workspaceId,
      pending.discordUserId,
    );

    // Clean up the token
    this.pendingLinks.delete(token);

    this.logger.log(
      `Linked Discord user ${pending.discordUserId} to Raven user ${ravenUserId}`,
    );

    return {
      success: true,
      message: 'Accounts linked successfully',
      user: linkedUser,
    };
  }

  /**
   * Get the pending link info for a token (without consuming it).
   */
  getPendingLinkInfo(token: string): {
    discordUserId: string;
    workspaceId: string;
  } | null {
    const pending = this.pendingLinks.get(token);
    if (!pending || new Date() > pending.expiresAt) {
      return null;
    }
    return {
      discordUserId: pending.discordUserId,
      workspaceId: pending.workspaceId,
    };
  }

  /**
   * Find a Raven user by their linked Discord user ID.
   */
  async findUserByDiscordId(
    discordUserId: string,
    workspaceId: string,
  ): Promise<User | undefined> {
    return this.userRepo.findByDiscordUserId(discordUserId, workspaceId);
  }

  /**
   * Unlink a Discord account from a Raven user.
   */
  async unlinkDiscordAccount(
    ravenUserId: string,
    workspaceId: string,
  ): Promise<boolean> {
    const result = await this.userRepo.unlinkDiscordUser(
      ravenUserId,
      workspaceId,
    );
    return !!result;
  }

  /**
   * Get channel → space mappings for a workspace.
   */
  async getChannelMappings(workspaceId: string): Promise<ChannelSpaceMapping[]> {
    const workspace = await this.workspaceRepo.findById(workspaceId);
    if (!workspace) return [];

    const settings = (workspace.settings as any)?.integrations?.discord || {};
    const channelMappings = settings.channelMappings || {};

    const mappings: ChannelSpaceMapping[] = [];
    for (const [channelId, spaceId] of Object.entries(channelMappings)) {
      if (typeof spaceId === 'string') {
        const space = await this.spaceRepo.findById(spaceId, workspaceId);
        mappings.push({
          discordChannelId: channelId,
          spaceId: spaceId,
          spaceName: space?.name,
        });
      }
    }

    return mappings;
  }

  /**
   * Map a Discord channel to a Raven space.
   */
  async mapChannelToSpace(
    workspaceId: string,
    discordChannelId: string,
    spaceId: string,
  ): Promise<boolean> {
    // Verify the space exists
    const space = await this.spaceRepo.findById(spaceId, workspaceId);
    if (!space) {
      return false;
    }

    const workspace = await this.workspaceRepo.findById(workspaceId);
    if (!workspace) {
      return false;
    }

    const settings = (workspace.settings as any) || {};
    const integrations = settings.integrations || {};
    const discord = integrations.discord || {};
    const channelMappings = discord.channelMappings || {};

    channelMappings[discordChannelId] = spaceId;

    await this.workspaceRepo.updateIntegrationSettings(workspaceId, {
      discord: {
        ...discord,
        channelMappings,
      },
    });

    this.logger.log(
      `Mapped Discord channel ${discordChannelId} to space ${spaceId} (${space.name})`,
    );

    return true;
  }

  /**
   * Remove a channel → space mapping.
   */
  async unmapChannel(
    workspaceId: string,
    discordChannelId: string,
  ): Promise<boolean> {
    const workspace = await this.workspaceRepo.findById(workspaceId);
    if (!workspace) {
      return false;
    }

    const settings = (workspace.settings as any) || {};
    const integrations = settings.integrations || {};
    const discord = integrations.discord || {};
    const channelMappings = { ...(discord.channelMappings || {}) };

    delete channelMappings[discordChannelId];

    await this.workspaceRepo.updateIntegrationSettings(workspaceId, {
      discord: {
        ...discord,
        channelMappings,
      },
    });

    return true;
  }

  /**
   * Get the space ID for a given Discord channel.
   */
  async getSpaceForChannel(
    workspaceId: string,
    discordChannelId: string,
  ): Promise<string | null> {
    const workspace = await this.workspaceRepo.findById(workspaceId);
    if (!workspace) return null;

    const settings = (workspace.settings as any)?.integrations?.discord || {};
    const channelMappings = settings.channelMappings || {};

    return channelMappings[discordChannelId] || null;
  }

  /**
   * Clean up expired pending link tokens.
   */
  private cleanupExpiredTokens(): void {
    const now = new Date();
    for (const [token, info] of this.pendingLinks.entries()) {
      if (now > info.expiresAt) {
        this.pendingLinks.delete(token);
      }
    }
  }
}
