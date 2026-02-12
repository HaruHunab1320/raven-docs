import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { WorkspaceRepo } from '../../database/repos/workspace/workspace.repo';
import { UserRepo } from '../../database/repos/user/user.repo';
import { AgentService } from '../../core/agent/agent.service';
import { ResearchJobService } from '../../core/research/research-job.service';
import { MCPApprovalService } from '../mcp/services/mcp-approval.service';
import { MCPService } from '../mcp/mcp.service';
import { User, Workspace } from '@raven-docs/db/types/entity.types';

type SlackIntegrationSettings = {
  enabled?: boolean;
  teamId?: string;
  botToken?: string;
  signingSecret?: string;
  defaultChannelId?: string;
  defaultUserId?: string;
};

type SlackCommandPayload = {
  command: string;
  text: string;
  team_id: string;
  user_id: string;
  channel_id: string;
  response_url: string;
};

@Injectable()
export class SlackService {
  private readonly logger = new Logger(SlackService.name);

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
  ) {}

  async verifyRequest(
    rawBody: string,
    timestamp: string | undefined,
    signature: string | undefined,
    signingSecret: string | undefined,
  ): Promise<boolean> {
    if (!rawBody || !timestamp || !signature || !signingSecret) {
      this.logger.log(`Slack verify: missing params - body=${!!rawBody}, ts=${!!timestamp}, sig=${!!signature}, secret=${!!signingSecret}`);
      return false;
    }

    const fiveMinutes = 60 * 5;
    const now = Math.floor(Date.now() / 1000);
    const ts = Number(timestamp);
    if (!Number.isFinite(ts) || Math.abs(now - ts) > fiveMinutes) {
      this.logger.log(`Slack verify: timestamp rejected - ts=${ts}, now=${now}, diff=${Math.abs(now - ts)}`);
      return false;
    }

    const base = `v0:${timestamp}:${rawBody}`;
    const digest = createHmac('sha256', signingSecret)
      .update(base)
      .digest('hex');
    const expected = `v0=${digest}`;
    const expectedBuf = Buffer.from(expected, 'utf8');
    const signatureBuf = Buffer.from(signature, 'utf8');

    if (expectedBuf.length !== signatureBuf.length) {
      this.logger.log(`Slack verify: signature length mismatch - expected=${expectedBuf.length}, got=${signatureBuf.length}`);
      return false;
    }

    const isValid = timingSafeEqual(expectedBuf, signatureBuf);
    if (!isValid) {
      this.logger.log(`Slack verify: signature mismatch - expected=${expected.slice(0, 20)}..., got=${signature.slice(0, 20)}...`);
    }
    return isValid;
  }

  private getSlackSettings(workspace?: Workspace | null): SlackIntegrationSettings {
    const integrations = (workspace?.settings as any)?.integrations || {};
    return integrations.slack || {};
  }

  async getWorkspaceFromTeamId(teamId: string): Promise<Workspace | null> {
    if (!teamId) return null;
    return this.workspaceRepo.findBySlackTeamId(teamId);
  }

  async resolveDefaultUser(
    workspace: Workspace,
    settings: SlackIntegrationSettings,
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

  private parseCommand(rawBody: string): SlackCommandPayload {
    const params = new URLSearchParams(rawBody);
    return {
      command: params.get('command') || '',
      text: params.get('text') || '',
      team_id: params.get('team_id') || '',
      user_id: params.get('user_id') || '',
      channel_id: params.get('channel_id') || '',
      response_url: params.get('response_url') || '',
    };
  }

  private parseInteraction(rawBody: string): any {
    const params = new URLSearchParams(rawBody);
    const payload = params.get('payload');
    if (!payload) return null;
    try {
      return JSON.parse(payload);
    } catch {
      return null;
    }
  }

  private parseEvent(rawBody: string): any {
    try {
      return JSON.parse(rawBody);
    } catch {
      return null;
    }
  }

  private async sendMessage(
    botToken: string,
    channel: string,
    text: string,
    blocks?: any[],
  ) {
    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${botToken}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        channel,
        text,
        blocks,
      }),
    });
  }

  private async sendResponse(responseUrl: string, payload: any) {
    if (!responseUrl) return;
    await fetch(responseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload),
    });
  }

  private parseTextCommand(text: string) {
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

  private async handleApproval(
    token: string,
    user: User,
  ): Promise<string> {
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

  private buildApprovalBlocks(approvalItems: Array<{ token: string; method: string }>) {
    return [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `Approval required for:\n${approvalItems
            .map((item) => `• ${item.method} (\`${item.token}\`)`)
            .join('\n')}`,
        },
      },
      {
        type: 'actions',
        elements: approvalItems.flatMap((item) => [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Approve' },
            style: 'primary',
            action_id: 'approve',
            value: item.token,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Reject' },
            style: 'danger',
            action_id: 'reject',
            value: item.token,
          },
        ]),
      },
    ];
  }

  async handleCommandRequest(rawBody: string, headers: Record<string, any>) {
    const payload = this.parseCommand(rawBody);
    const workspace = await this.getWorkspaceFromTeamId(payload.team_id);
    const settings = this.getSlackSettings(workspace);

    const verified = await this.verifyRequest(
      rawBody,
      headers['x-slack-request-timestamp'],
      headers['x-slack-signature'],
      settings.signingSecret,
    );

    if (!verified || !workspace || settings.enabled !== true) {
      return { status: 401, body: { text: 'Slack integration not authorized.' } };
    }

    const user = await this.resolveDefaultUser(workspace, settings);
    if (!user) {
      return { status: 403, body: { text: 'No default user configured.' } };
    }

    const spaceId = workspace.defaultSpaceId;
    const { action, payload: text } = this.parseTextCommand(payload.text);
    const channelId = payload.channel_id || settings.defaultChannelId || '';

    setImmediate(async () => {
      try {
        if (action === 'approve' && text) {
          const result = await this.handleApproval(text, user);
          await this.sendResponse(payload.response_url, {
            response_type: 'ephemeral',
            text: result,
          });
          return;
        }

        if (action === 'reject' && text) {
          await this.approvalService.deleteApproval(user.id, text);
          await this.sendResponse(payload.response_url, {
            response_type: 'ephemeral',
            text: 'Approval rejected.',
          });
          return;
        }

        if (action === 'research') {
          const job = await this.researchService.createJob(
            { spaceId, topic: text || 'Slack research request' },
            user.id,
            workspace.id,
          );
          await this.sendResponse(payload.response_url, {
            response_type: 'ephemeral',
            text: `Research started: ${job.topic}`,
          });
          if (channelId && settings.botToken) {
            await this.sendMessage(
              settings.botToken,
              channelId,
              `Research queued: ${job.topic}`,
            );
          }
          return;
        }

        const result = await this.agentService.chat(
          {
            spaceId,
            message: text || payload.text,
            autoApprove: false,
          },
          user,
          workspace,
        );

        const responseText = result.reply || 'Agent response unavailable.';
        await this.sendResponse(payload.response_url, {
          response_type: 'ephemeral',
          text: responseText,
        });

        if (result.approvalsRequired && result.approvalItems.length && settings.botToken && channelId) {
          const blocks = this.buildApprovalBlocks(
            result.approvalItems.map((item) => ({
              token: item.token,
              method: item.method,
            })),
          );
          await this.sendMessage(
            settings.botToken,
            channelId,
            'Approval required for agent actions.',
            blocks,
          );
        }
      } catch (error: any) {
        this.logger.warn(`Slack command failed: ${error?.message || error}`);
        await this.sendResponse(payload.response_url, {
          response_type: 'ephemeral',
          text: 'Slack command failed.',
        });
      }
    });

    return { status: 200, body: { response_type: 'ephemeral', text: 'Working on it…' } };
  }

  async handleInteractionRequest(rawBody: string, headers: Record<string, any>) {
    const payload = this.parseInteraction(rawBody);
    if (!payload) {
      return { status: 400, body: { text: 'Invalid payload.' } };
    }

    const workspace = await this.getWorkspaceFromTeamId(payload.team?.id);
    const settings = this.getSlackSettings(workspace);
    const verified = await this.verifyRequest(
      rawBody,
      headers['x-slack-request-timestamp'],
      headers['x-slack-signature'],
      settings.signingSecret,
    );
    if (!verified || !workspace || settings.enabled !== true) {
      return { status: 401, body: { text: 'Slack integration not authorized.' } };
    }

    const user = await this.resolveDefaultUser(workspace, settings);
    if (!user) {
      return { status: 403, body: { text: 'No default user configured.' } };
    }

    const action = payload.actions?.[0];
    const token = action?.value;
    const actionId = action?.action_id;
    if (!token || !actionId) {
      return { status: 200, body: { text: 'No action taken.' } };
    }

    if (actionId === 'approve') {
      const result = await this.handleApproval(token, user);
      return { status: 200, body: { text: result } };
    }

    if (actionId === 'reject') {
      await this.approvalService.deleteApproval(user.id, token);
      return { status: 200, body: { text: 'Approval rejected.' } };
    }

    return { status: 200, body: { text: 'No action taken.' } };
  }

  async handleEventRequest(rawBody: string, headers: Record<string, any>) {
    const payload = this.parseEvent(rawBody);
    if (!payload) {
      this.logger.log('Slack event: Invalid payload');
      return { status: 400, body: { text: 'Invalid payload.' } };
    }

    // Handle URL verification challenge before any auth checks
    // This allows Slack to verify the endpoint during initial setup
    if (payload.type === 'url_verification') {
      return { status: 200, body: { challenge: payload.challenge } };
    }

    this.logger.log(`Slack event received: type=${payload.type}, team_id=${payload.team_id}`);

    const workspace = await this.getWorkspaceFromTeamId(payload.team_id);
    if (!workspace) {
      this.logger.warn(`Slack event: No workspace found for team_id=${payload.team_id}`);
      return { status: 401, body: { text: 'Slack integration not authorized.' } };
    }

    const settings = this.getSlackSettings(workspace);
    this.logger.log(`Slack settings: enabled=${settings.enabled}, hasToken=${!!settings.botToken}, hasSecret=${!!settings.signingSecret}`);

    const verified = await this.verifyRequest(
      rawBody,
      headers['x-slack-request-timestamp'],
      headers['x-slack-signature'],
      settings.signingSecret,
    );

    if (!verified) {
      this.logger.log('Slack event: Signature verification failed');
      return { status: 401, body: { text: 'Slack integration not authorized.' } };
    }

    if (settings.enabled !== true) {
      this.logger.log('Slack event: Integration not enabled');
      return { status: 401, body: { text: 'Slack integration not authorized.' } };
    }

    if (payload.type !== 'event_callback') {
      this.logger.log(`Slack event: Ignoring type=${payload.type}`);
      return { status: 200, body: { text: 'Ignored' } };
    }

    const event = payload.event;
    this.logger.log(`Slack event callback: event.type=${event?.type}`);

    if (event?.type !== 'app_mention') {
      this.logger.log(`Slack event: Ignoring event.type=${event?.type}`);
      return { status: 200, body: { text: 'Ignored' } };
    }

    const user = await this.resolveDefaultUser(workspace, settings);
    if (!user) {
      this.logger.log('Slack event: No default user found');
      return { status: 403, body: { text: 'No default user configured.' } };
    }

    const channelId = event.channel || settings.defaultChannelId;
    const cleaned = (event.text || '').replace(/<@[^>]+>/g, '').trim();
    this.logger.log(`Slack event: channel=${channelId}, cleaned="${cleaned}", hasToken=${!!settings.botToken}`);

    if (!cleaned || !channelId || !settings.botToken) {
      this.logger.log(`Slack event: Missing required data - cleaned=${!!cleaned}, channel=${!!channelId}, token=${!!settings.botToken}`);
      return { status: 200, body: { text: 'No action taken.' } };
    }

    this.logger.log(`Slack event: Processing message for workspace=${workspace.id}, space=${workspace.defaultSpaceId}`);

    setImmediate(async () => {
      try {
        const result = await this.agentService.chat(
          { spaceId: workspace.defaultSpaceId, message: cleaned, autoApprove: false },
          user,
          workspace,
        );
        this.logger.log(`Slack event: Agent replied, sending to channel`);
        await this.sendMessage(settings.botToken, channelId, result.reply || 'Agent response unavailable.');
      } catch (error: any) {
        this.logger.log(`Slack event: Agent chat failed - ${error?.message || error}`);
        await this.sendMessage(settings.botToken, channelId, 'Sorry, something went wrong processing your request.');
      }
    });

    return { status: 200, body: { text: 'OK' } };
  }

  async notifyResearchStatus(
    workspaceId: string,
    message: string,
  ): Promise<void> {
    const workspace = await this.workspaceRepo.findById(workspaceId);
    const settings = this.getSlackSettings(workspace);
    if (
      settings.enabled !== true ||
      !settings.botToken ||
      !settings.defaultChannelId
    ) {
      return;
    }
    await this.sendMessage(settings.botToken, settings.defaultChannelId, message);
  }
}
