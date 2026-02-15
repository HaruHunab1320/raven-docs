import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import nacl from 'tweetnacl';
import { WorkspaceRepo } from '../../database/repos/workspace/workspace.repo';
import { UserRepo } from '../../database/repos/user/user.repo';
import { AgentService } from '../../core/agent/agent.service';
import { ResearchJobService } from '../../core/research/research-job.service';
import { MCPApprovalService } from '../mcp/services/mcp-approval.service';
import { MCPService } from '../mcp/mcp.service';
import { DiscordLinkingService } from './discord-linking.service';
import { TaskService } from '../../core/project/services/task.service';
import { TaskBucket } from '../../core/project/constants/task-enums';
import { User, Workspace } from '@raven-docs/db/types/entity.types';
import { EnvironmentService } from '../../integrations/environment/environment.service';

type DiscordIntegrationSettings = {
  enabled?: boolean;
  guildId?: string;
  botToken?: string;
  publicKey?: string;
  applicationId?: string;
  defaultChannelId?: string;
  defaultUserId?: string;
};

@Injectable()
export class DiscordService {
  private readonly logger = new Logger(DiscordService.name);

  constructor(
    private readonly workspaceRepo: WorkspaceRepo,
    private readonly userRepo: UserRepo,
    @Inject(forwardRef(() => AgentService))
    private readonly agentService: AgentService,
    @Inject(forwardRef(() => ResearchJobService))
    private readonly researchService: ResearchJobService,
    @Inject(forwardRef(() => MCPApprovalService))
    private readonly approvalService: MCPApprovalService,
    @Inject(forwardRef(() => MCPService))
    private readonly mcpService: MCPService,
    @Inject(forwardRef(() => DiscordLinkingService))
    private readonly linkingService: DiscordLinkingService,
    @Inject(forwardRef(() => TaskService))
    private readonly taskService: TaskService,
    private readonly environmentService: EnvironmentService,
  ) {}

  private getDiscordSettings(workspace?: Workspace | null): DiscordIntegrationSettings {
    const integrations = (workspace?.settings as any)?.integrations || {};
    return integrations.discord || {};
  }

  async getWorkspaceFromGuildId(guildId: string): Promise<Workspace | null> {
    if (!guildId) return null;
    return this.workspaceRepo.findByDiscordGuildId(guildId);
  }

  async getWorkspaceFromApplicationId(applicationId: string): Promise<Workspace | null> {
    if (!applicationId) return null;
    return this.workspaceRepo.findByDiscordApplicationId(applicationId);
  }

  async resolveDefaultUser(
    workspace: Workspace,
    settings: DiscordIntegrationSettings,
  ): Promise<User | null> {
    if (settings.defaultUserId) {
      const user = await this.userRepo.findById(
        settings.defaultUserId,
        workspace.id,
      );
      if (user) return user;
    }
    return this.userRepo.findFirstOwner(workspace.id);
  }

  verifyRequest(
    rawBody: string,
    signature: string | undefined,
    timestamp: string | undefined,
    publicKey: string | undefined,
  ): boolean {
    if (!rawBody || !signature || !timestamp || !publicKey) {
      this.logger.warn(`Discord verify missing params: rawBody=${!!rawBody} (${rawBody?.length}), sig=${!!signature}, ts=${!!timestamp}, key=${!!publicKey}`);
      return false;
    }
    try {
      // Trim any whitespace from inputs
      const cleanPublicKey = publicKey.trim();
      const cleanSignature = signature.trim();
      const cleanTimestamp = timestamp.trim();

      const message = Buffer.concat([
        Buffer.from(cleanTimestamp),
        Buffer.from(rawBody),
      ]);
      const sig = Buffer.from(cleanSignature, 'hex');
      const key = Buffer.from(cleanPublicKey, 'hex');
      this.logger.log(`Discord verify: msgLen=${message.length}, sigLen=${sig.length}, keyLen=${key.length}`);
      this.logger.log(`Discord verify: ts="${cleanTimestamp}", bodyStart="${rawBody.substring(0, 50)}", bodyEnd="${rawBody.substring(rawBody.length - 30)}"`);
      this.logger.log(`Discord verify: fullKey=${cleanPublicKey}`);
      const result = nacl.sign.detached.verify(message, sig, key);
      this.logger.log(`Discord verify result: ${result}`);
      return result;
    } catch (error: any) {
      this.logger.warn(`Discord signature verify failed: ${error?.message || error}`);
      return false;
    }
  }

  private async sendFollowUp(
    settings: DiscordIntegrationSettings,
    interactionToken: string,
    content: string,
    components?: any[],
  ) {
    if (!settings.applicationId || !settings.botToken) return;
    await fetch(
      `https://discord.com/api/v10/webhooks/${settings.applicationId}/${interactionToken}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bot ${settings.botToken}`,
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({ content, components }),
      },
    );
  }

  private parseActionFromText(text: string) {
    const trimmed = (text || '').trim();
    if (!trimmed) return { action: 'ask', payload: '' };
    const [first, ...rest] = trimmed.split(' ');
    const action = first.toLowerCase();
    const payload = rest.join(' ').trim();
    if (['ask', 'research', 'approve', 'reject', 'link', 'status', 'task'].includes(action)) {
      return { action, payload };
    }
    return { action: 'ask', payload: trimmed };
  }

  /**
   * Resolve user from Discord ID, falling back to default user.
   */
  private async resolveUser(
    discordUserId: string,
    workspace: Workspace,
    settings: DiscordIntegrationSettings,
  ): Promise<User | null> {
    // Try to find a linked user first
    const linkedUser = await this.linkingService.findUserByDiscordId(
      discordUserId,
      workspace.id,
    );
    if (linkedUser) {
      this.logger.log(`Discord: Resolved linked user ${linkedUser.email} for Discord user ${discordUserId}`);
      return linkedUser;
    }

    // Fall back to default user
    this.logger.log(`Discord: No linked user found for ${discordUserId}, using default user`);
    return this.resolveDefaultUser(workspace, settings);
  }

  /**
   * Handle the /raven link command.
   */
  private async handleLinkCommand(
    discordUserId: string,
    guildId: string,
    workspace: Workspace,
  ): Promise<string> {
    const appUrl = this.environmentService.getAppUrl();
    const linkToken = await this.linkingService.generateLinkingToken(
      discordUserId,
      guildId,
      workspace.id,
    );

    return `To link your Discord account to Raven Docs, click here:\n${appUrl}/auth/discord-link?token=${linkToken.token}\n\nThis link will expire in 24 hours.`;
  }

  /**
   * Handle the /raven status command.
   */
  private async handleStatusCommand(
    discordUserId: string,
    workspace: Workspace,
  ): Promise<string> {
    const linkedUser = await this.linkingService.findUserByDiscordId(
      discordUserId,
      workspace.id,
    );

    if (linkedUser) {
      return `Your Discord account is linked to Raven Docs user: ${linkedUser.email}\nCommands will run with your permissions.`;
    }

    return 'Your Discord account is not linked to a Raven Docs account.\nUse `/raven link` to connect your account.';
  }

  private async handleApproval(token: string, user: User): Promise<string> {
    const approval = await this.approvalService.getApproval(user.id, token);
    if (!approval) {
      return 'Approval not found or expired.';
    }

    const response = await this.mcpService.processRequest(
      {
        jsonrpc: '2.0',
        method: approval.method,
        params: {
          ...(approval.params || {}),
          approvalToken: token,
        },
        id: Date.now(),
      },
      user,
    );

    if (response.error) {
      return `Approval failed: ${response.error.message}`;
    }
    return `Approved and applied: ${approval.method}`;
  }

  async handleInteraction(payload: any) {
    if (!payload) {
      return { status: 400, body: { type: 4, data: { content: 'Invalid payload.' } } };
    }

    const guildId = payload.guild_id || payload.guildId;
    const discordUserId = payload.member?.user?.id || payload.user?.id;
    const channelId = payload.channel_id;
    const workspace = await this.getWorkspaceFromGuildId(guildId);
    const settings = this.getDiscordSettings(workspace);
    if (!workspace || settings.enabled !== true) {
      return { status: 401, body: { type: 4, data: { content: 'Discord integration not authorized.' } } };
    }

    if (payload.type === 1) {
      return { status: 200, body: { type: 1 } };
    }

    // Resolve user - try linked user first, then default
    const user = await this.resolveUser(discordUserId, workspace, settings);
    if (!user) {
      return { status: 403, body: { type: 4, data: { content: 'No user configured. Use `/raven link` to link your account.' } } };
    }

    if (payload.type === 3) {
      const customId = payload.data?.custom_id || '';
      const [action, token] = customId.split(':');
      if (!token) {
        return { status: 200, body: { type: 4, data: { content: 'No action taken.' } } };
      }
      if (action === 'approve') {
        const result = await this.handleApproval(token, user);
        return { status: 200, body: { type: 4, data: { content: result } } };
      }
      if (action === 'reject') {
        await this.approvalService.deleteApproval(user.id, token);
        return { status: 200, body: { type: 4, data: { content: 'Approval rejected.' } } };
      }
      return { status: 200, body: { type: 4, data: { content: 'No action taken.' } } };
    }

    if (payload.type !== 2) {
      return { status: 200, body: { type: 4, data: { content: 'Unsupported command.' } } };
    }

    // Get space from channel mapping or use default
    const mappedSpaceId = channelId
      ? await this.linkingService.getSpaceForChannel(workspace.id, channelId)
      : null;
    const spaceId = mappedSpaceId || workspace.defaultSpaceId;

    const option = payload.data?.options?.[0];
    const rawText = option?.value || payload.data?.options?.[0]?.options?.[0]?.value || '';
    const { action, payload: text } = this.parseActionFromText(rawText);

    const interactionToken = payload.token;
    const immediate = { status: 200, body: { type: 5 } };

    setImmediate(async () => {
      try {
        // Handle link command
        if (action === 'link') {
          const linkMessage = await this.handleLinkCommand(discordUserId, guildId, workspace);
          await this.sendFollowUp(settings, interactionToken, linkMessage);
          return;
        }

        // Handle status command
        if (action === 'status') {
          const statusMessage = await this.handleStatusCommand(discordUserId, workspace);
          await this.sendFollowUp(settings, interactionToken, statusMessage);
          return;
        }

        if (action === 'approve' && text) {
          const result = await this.handleApproval(text, user);
          await this.sendFollowUp(settings, interactionToken, result);
          return;
        }
        if (action === 'reject' && text) {
          await this.approvalService.deleteApproval(user.id, text);
          await this.sendFollowUp(settings, interactionToken, 'Approval rejected.');
          return;
        }
        if (action === 'research') {
          const job = await this.researchService.createJob(
            { spaceId, topic: text || 'Discord research request' },
            user.id,
            workspace.id,
          );
          await this.sendFollowUp(
            settings,
            interactionToken,
            `Research queued: ${job.topic}`,
          );
          return;
        }

        if (action === 'task') {
          if (!text) {
            await this.sendFollowUp(
              settings,
              interactionToken,
              'Please provide a task title. Usage: `/raven task <title>`',
            );
            return;
          }
          const task = await this.taskService.create(user.id, workspace.id, {
            title: text,
            spaceId,
            bucket: TaskBucket.INBOX,
          });
          await this.sendFollowUp(
            settings,
            interactionToken,
            `Added to inbox: "${task.title}"`,
          );
          return;
        }

        const result = await this.agentService.chat(
          {
            spaceId,
            message: text || 'Discord request',
            autoApprove: false,
          },
          user,
          workspace,
        );
        if (result.approvalsRequired && result.approvalItems.length) {
          const token = result.approvalItems[0].token;
          const components = [
            {
              type: 1,
              components: [
                {
                  type: 2,
                  style: 3,
                  label: 'Approve',
                  custom_id: `approve:${token}`,
                },
                {
                  type: 2,
                  style: 4,
                  label: 'Reject',
                  custom_id: `reject:${token}`,
                },
              ],
            },
          ];
          await this.sendFollowUp(
            settings,
            interactionToken,
            result.reply || 'Approval required.',
            components,
          );
        } else {
          await this.sendFollowUp(
            settings,
            interactionToken,
            result.reply || 'Agent response unavailable.',
          );
        }
      } catch (error: any) {
        this.logger.warn(`Discord interaction failed: ${error?.message || error}`);
        await this.sendFollowUp(
          settings,
          interactionToken,
          'Discord command failed.',
        );
      }
    });

    return immediate;
  }

  async notifyResearchStatus(
    workspaceId: string,
    message: string,
  ): Promise<void> {
    const workspace = await this.workspaceRepo.findById(workspaceId);
    const settings = this.getDiscordSettings(workspace);
    if (
      settings.enabled !== true ||
      !settings.botToken ||
      !settings.defaultChannelId
    ) {
      return;
    }
    await fetch(`https://discord.com/api/v10/channels/${settings.defaultChannelId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${settings.botToken}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({ content: message }),
    });
  }
}
