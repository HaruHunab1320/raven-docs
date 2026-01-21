import { Controller, Headers, Post, Req, Res } from '@nestjs/common';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';
import { DiscordService } from './discord.service';
import { FastifyReply, FastifyRequest } from 'fastify';

@Controller('integrations/discord')
export class DiscordController {
  constructor(private readonly discordService: DiscordService) {}

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
    const workspace = payload?.guild_id
      ? await this.discordService.getWorkspaceFromGuildId(payload.guild_id)
      : null;
    const settings = workspace
      ? (workspace.settings as any)?.integrations?.discord
      : null;

    const verified = this.discordService.verifyRequest(
      rawBody,
      signature,
      timestamp,
      settings?.publicKey,
    );
    if (!verified) {
      reply.code(401).send({ type: 4, data: { content: 'Invalid signature.' } });
      return;
    }

    const result = await this.discordService.handleInteraction(payload);
    reply.code(result.status).send(result.body);
  }
}
