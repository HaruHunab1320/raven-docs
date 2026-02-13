import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { UserTokenRepo } from '../../database/repos/user-token/user-token.repo';
import { UserRepo } from '../../database/repos/user/user.repo';
import { WorkspaceRepo } from '../../database/repos/workspace/workspace.repo';
import { SpaceRepo } from '@raven-docs/db/repos/space/space.repo';
import { UserTokenType } from '../../core/auth/auth.constants';
import { User, Workspace } from '@raven-docs/db/types/entity.types';

export interface SlackLinkingToken {
  token: string;
  slackUserId: string;
  slackTeamId: string;
  expiresAt: Date;
}

export interface ChannelSpaceMapping {
  slackChannelId: string;
  spaceId: string;
  spaceName?: string;
}

@Injectable()
export class SlackLinkingService {
  private readonly logger = new Logger(SlackLinkingService.name);

  // In-memory store for pending link tokens (maps token -> slack info)
  // In production, consider using Redis for this
  private pendingLinks = new Map<
    string,
    {
      slackUserId: string;
      slackTeamId: string;
      workspaceId: string;
      expiresAt: Date;
    }
  >();

  constructor(
    private readonly userTokenRepo: UserTokenRepo,
    private readonly userRepo: UserRepo,
    private readonly workspaceRepo: WorkspaceRepo,
    private readonly spaceRepo: SpaceRepo,
  ) {
    // Clean up expired tokens every 5 minutes
    setInterval(() => this.cleanupExpiredTokens(), 5 * 60 * 1000);
  }

  /**
   * Generate a unique linking token for a Slack user.
   * The user will click a link with this token to authenticate.
   */
  async generateLinkingToken(
    slackUserId: string,
    slackTeamId: string,
    workspaceId: string,
  ): Promise<SlackLinkingToken> {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Store in memory (could also store in database)
    this.pendingLinks.set(token, {
      slackUserId,
      slackTeamId,
      workspaceId,
      expiresAt,
    });

    this.logger.log(
      `Generated linking token for Slack user ${slackUserId} in team ${slackTeamId}`,
    );

    return {
      token,
      slackUserId,
      slackTeamId,
      expiresAt,
    };
  }

  /**
   * Verify a linking token and associate the Slack user with a Raven user.
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

    // Check if this Slack user is already linked to another Raven user
    const existingUser = await this.userRepo.findBySlackUserId(
      pending.slackUserId,
      pending.workspaceId,
    );

    if (existingUser && existingUser.id !== ravenUserId) {
      return {
        success: false,
        message: 'This Slack account is already linked to another Raven user',
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
    const linkedUser = await this.userRepo.linkSlackUser(
      ravenUserId,
      pending.workspaceId,
      pending.slackUserId,
    );

    // Clean up the token
    this.pendingLinks.delete(token);

    this.logger.log(
      `Linked Slack user ${pending.slackUserId} to Raven user ${ravenUserId}`,
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
    slackUserId: string;
    workspaceId: string;
  } | null {
    const pending = this.pendingLinks.get(token);
    if (!pending || new Date() > pending.expiresAt) {
      return null;
    }
    return {
      slackUserId: pending.slackUserId,
      workspaceId: pending.workspaceId,
    };
  }

  /**
   * Find a Raven user by their linked Slack user ID.
   */
  async findUserBySlackId(
    slackUserId: string,
    workspaceId: string,
  ): Promise<User | undefined> {
    return this.userRepo.findBySlackUserId(slackUserId, workspaceId);
  }

  /**
   * Unlink a Slack account from a Raven user.
   */
  async unlinkSlackAccount(
    ravenUserId: string,
    workspaceId: string,
  ): Promise<boolean> {
    const result = await this.userRepo.unlinkSlackUser(
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

    const settings = (workspace.settings as any)?.integrations?.slack || {};
    const channelMappings = settings.channelMappings || {};

    const mappings: ChannelSpaceMapping[] = [];
    for (const [channelId, spaceId] of Object.entries(channelMappings)) {
      if (typeof spaceId === 'string') {
        const space = await this.spaceRepo.findById(spaceId, workspaceId);
        mappings.push({
          slackChannelId: channelId,
          spaceId: spaceId,
          spaceName: space?.name,
        });
      }
    }

    return mappings;
  }

  /**
   * Map a Slack channel to a Raven space.
   */
  async mapChannelToSpace(
    workspaceId: string,
    slackChannelId: string,
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
    const slack = integrations.slack || {};
    const channelMappings = slack.channelMappings || {};

    channelMappings[slackChannelId] = spaceId;

    await this.workspaceRepo.updateIntegrationSettings(workspaceId, {
      slack: {
        ...slack,
        channelMappings,
      },
    });

    this.logger.log(
      `Mapped Slack channel ${slackChannelId} to space ${spaceId} (${space.name})`,
    );

    return true;
  }

  /**
   * Remove a channel → space mapping.
   */
  async unmapChannel(
    workspaceId: string,
    slackChannelId: string,
  ): Promise<boolean> {
    const workspace = await this.workspaceRepo.findById(workspaceId);
    if (!workspace) {
      return false;
    }

    const settings = (workspace.settings as any) || {};
    const integrations = settings.integrations || {};
    const slack = integrations.slack || {};
    const channelMappings = { ...slack.channelMappings } || {};

    delete channelMappings[slackChannelId];

    await this.workspaceRepo.updateIntegrationSettings(workspaceId, {
      slack: {
        ...slack,
        channelMappings,
      },
    });

    return true;
  }

  /**
   * Get the space ID for a given Slack channel.
   */
  async getSpaceForChannel(
    workspaceId: string,
    slackChannelId: string,
  ): Promise<string | null> {
    const workspace = await this.workspaceRepo.findById(workspaceId);
    if (!workspace) return null;

    const settings = (workspace.settings as any)?.integrations?.slack || {};
    const channelMappings = settings.channelMappings || {};

    return channelMappings[slackChannelId] || null;
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
