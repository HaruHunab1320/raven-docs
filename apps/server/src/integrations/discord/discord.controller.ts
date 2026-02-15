import {
  Controller,
  Headers,
  Post,
  Get,
  Body,
  Param,
  Req,
  Res,
  UseGuards,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';
import { DiscordService } from './discord.service';
import { DiscordLinkingService } from './discord-linking.service';
import { FastifyReply, FastifyRequest } from 'fastify';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { User, Workspace } from '@raven-docs/db/types/entity.types';

@Controller('integrations/discord')
export class DiscordController {
  private readonly logger = new Logger(DiscordController.name);

  constructor(
    private readonly discordService: DiscordService,
    private readonly linkingService: DiscordLinkingService,
  ) {}

  @Post('interactions')
  @SkipTransform()
  async handleInteractions(
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
    @Headers() headers: Record<string, any>,
  ) {
    const rawBody = (req as any).rawBody?.toString('utf8') || '';
    const signature = headers['x-signature-ed25519'];
    const timestamp = headers['x-signature-timestamp'];

    let payload: any = null;
    try {
      payload = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      reply.code(400).send({ type: 4, data: { content: 'Invalid payload.' } });
      return;
    }

    // Try to find workspace by guild_id first, then by application_id (for verification pings)
    let workspace = payload?.guild_id
      ? await this.discordService.getWorkspaceFromGuildId(payload.guild_id)
      : null;

    this.logger.log(`Discord interaction: guild_id=${payload?.guild_id}, application_id=${payload?.application_id}, type=${payload?.type}`);

    if (!workspace && payload?.application_id) {
      workspace = await this.discordService.getWorkspaceFromApplicationId(payload.application_id);
      this.logger.log(`Looked up by application_id: found=${!!workspace}`);
    }

    const settings = workspace
      ? (workspace.settings as any)?.integrations?.discord
      : null;

    this.logger.log(`Workspace found: ${!!workspace}, has publicKey: ${!!settings?.publicKey}, publicKey prefix: ${settings?.publicKey?.substring(0, 8) || 'none'}`);

    const verified = this.discordService.verifyRequest(
      rawBody,
      signature,
      timestamp,
      settings?.publicKey,
    );
    if (!verified) {
      this.logger.warn(`Discord signature verification failed. Has signature: ${!!signature}, has timestamp: ${!!timestamp}`);
      reply.code(401).send({ type: 4, data: { content: 'Invalid signature.' } });
      return;
    }

    const result = await this.discordService.handleInteraction(payload);
    reply.code(result.status).send(result.body);
  }

  /**
   * Get pending link info for a token (used by frontend to display linking page).
   */
  @Get('link/:token')
  async getLinkInfo(@Param('token') token: string) {
    const info = this.linkingService.getPendingLinkInfo(token);
    if (!info) {
      throw new BadRequestException('Invalid or expired linking token');
    }
    return {
      discordUserId: info.discordUserId,
      workspaceId: info.workspaceId,
    };
  }

  /**
   * Complete the account linking (called after user authenticates).
   */
  @Post('link/:token')
  @UseGuards(JwtAuthGuard)
  async completeLink(
    @Param('token') token: string,
    @AuthUser() user: User,
  ) {
    const result = await this.linkingService.verifyAndLink(token, user.id);
    if (!result.success) {
      throw new BadRequestException(result.message);
    }
    return {
      success: true,
      message: result.message,
      user: {
        id: result.user?.id,
        email: result.user?.email,
        name: result.user?.name,
      },
    };
  }

  /**
   * Get channel → space mappings for the workspace.
   */
  @Get('channel-mappings')
  @UseGuards(JwtAuthGuard)
  async getChannelMappings(@AuthWorkspace() workspace: Workspace) {
    const mappings = await this.linkingService.getChannelMappings(workspace.id);
    return { mappings };
  }

  /**
   * Map a Discord channel to a Raven space.
   */
  @Post('channel-mappings')
  @UseGuards(JwtAuthGuard)
  async mapChannel(
    @AuthWorkspace() workspace: Workspace,
    @Body() body: { discordChannelId: string; spaceId: string },
  ) {
    if (!body.discordChannelId || !body.spaceId) {
      throw new BadRequestException('discordChannelId and spaceId are required');
    }

    const success = await this.linkingService.mapChannelToSpace(
      workspace.id,
      body.discordChannelId,
      body.spaceId,
    );

    if (!success) {
      throw new BadRequestException('Failed to map channel. Space may not exist.');
    }

    return { success: true };
  }

  /**
   * Remove a channel → space mapping.
   */
  @Post('channel-mappings/remove')
  @UseGuards(JwtAuthGuard)
  async unmapChannel(
    @AuthWorkspace() workspace: Workspace,
    @Body() body: { discordChannelId: string },
  ) {
    if (!body.discordChannelId) {
      throw new BadRequestException('discordChannelId is required');
    }

    await this.linkingService.unmapChannel(workspace.id, body.discordChannelId);
    return { success: true };
  }
}
