import {
  Controller,
  Headers,
  Post,
  Get,
  Body,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';
import { SlackService } from './slack.service';
import { SlackLinkingService } from './slack-linking.service';
import { FastifyReply, FastifyRequest } from 'fastify';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { JwtAuthGuard } from '../../core/auth/guards/jwt-auth.guard';
import { User, Workspace } from '@raven-docs/db/types/entity.types';

@Controller('integrations/slack')
export class SlackController {
  constructor(
    private readonly slackService: SlackService,
    private readonly linkingService: SlackLinkingService,
  ) {}

  @Post('commands')
  @SkipTransform()
  async handleCommands(
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
    @Headers() headers: Record<string, any>,
  ) {
    const rawBody = (req as any).rawBody?.toString('utf8') || '';
    const result = await this.slackService.handleCommandRequest(rawBody, headers);
    reply.code(result.status).send(result.body);
  }

  @Post('interactions')
  @SkipTransform()
  async handleInteractions(
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
    @Headers() headers: Record<string, any>,
  ) {
    const rawBody = (req as any).rawBody?.toString('utf8') || '';
    const result = await this.slackService.handleInteractionRequest(rawBody, headers);
    reply.code(result.status).send(result.body);
  }

  @Post('events')
  @SkipTransform()
  async handleEvents(
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
    @Headers() headers: Record<string, any>,
  ) {
    const rawBody = (req as any).rawBody?.toString('utf8') || '';
    const result = await this.slackService.handleEventRequest(rawBody, headers);
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
      slackUserId: info.slackUserId,
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
   * Map a Slack channel to a Raven space.
   */
  @Post('channel-mappings')
  @UseGuards(JwtAuthGuard)
  async mapChannel(
    @AuthWorkspace() workspace: Workspace,
    @Body() body: { slackChannelId: string; spaceId: string },
  ) {
    if (!body.slackChannelId || !body.spaceId) {
      throw new BadRequestException('slackChannelId and spaceId are required');
    }

    const success = await this.linkingService.mapChannelToSpace(
      workspace.id,
      body.slackChannelId,
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
    @Body() body: { slackChannelId: string },
  ) {
    if (!body.slackChannelId) {
      throw new BadRequestException('slackChannelId is required');
    }

    await this.linkingService.unmapChannel(workspace.id, body.slackChannelId);
    return { success: true };
  }
}
