import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import nacl from 'tweetnacl';
import { WorkspaceRepo } from '../../database/repos/workspace/workspace.repo';
import { UserRepo } from '../../database/repos/user/user.repo';
import { AgentService } from '../../core/agent/agent.service';
import { ResearchJobService } from '../../core/research/research-job.service';
import { MCPApprovalService } from '../mcp/services/mcp-approval.service';
import { MCPService } from '../mcp/mcp.service';
import { User, Workspace } from '@raven-docs/db/types/entity.types';

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
    private readonly agentService: AgentService,
    @Inject(forwardRef(() => ResearchJobService))
    private readonly researchService: ResearchJobService,
    private readonly approvalService: MCPApprovalService,
    private readonly mcpService: MCPService,
  ) {}

  private getDiscordSettings(workspace?: Workspace | null): DiscordIntegrationSettings {
    const integrations = (workspace?.settings as any)?.integrations || {};
    return integrations.discord || {};
  }

  async getWorkspaceFromGuildId(guildId: string): Promise<Workspace | null> {
    if (!guildId) return null;
    return this.workspaceRepo.findByDiscordGuildId(guildId);
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
      return false;
    }
    try {
      const message = Buffer.concat([
        Buffer.from(timestamp),
        Buffer.from(rawBody),
      ]);
      const sig = Buffer.from(signature, 'hex');
      const key = Buffer.from(publicKey, 'hex');
      return nacl.sign.detached.verify(message, sig, key);
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
    if (['ask', 'research', 'approve', 'reject'].includes(action)) {
      return { action, payload };
    }
    return { action: 'ask', payload: trimmed };
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
    const workspace = await this.getWorkspaceFromGuildId(guildId);
    const settings = this.getDiscordSettings(workspace);
    if (!workspace || settings.enabled !== true) {
      return { status: 401, body: { type: 4, data: { content: 'Discord integration not authorized.' } } };
    }

    if (payload.type === 1) {
      return { status: 200, body: { type: 1 } };
    }

    const user = await this.resolveDefaultUser(workspace, settings);
    if (!user) {
      return { status: 403, body: { type: 4, data: { content: 'No default user configured.' } } };
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

    const spaceId = workspace.defaultSpaceId;
    const option = payload.data?.options?.[0];
    const rawText = option?.value || payload.data?.options?.[0]?.options?.[0]?.value || '';
    const { action, payload: text } = this.parseActionFromText(rawText);

    const interactionToken = payload.token;
    const immediate = { status: 200, body: { type: 5 } };

    setImmediate(async () => {
      try {
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
