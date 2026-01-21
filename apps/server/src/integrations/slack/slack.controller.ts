import { Controller, Headers, Post, Req, Res } from '@nestjs/common';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';
import { SlackService } from './slack.service';
import { FastifyReply, FastifyRequest } from 'fastify';

@Controller('integrations/slack')
export class SlackController {
  constructor(private readonly slackService: SlackService) {}

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
}
