import {
  Controller,
  Post,
  Get,
  Query,
  Res,
  UseGuards,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { GitHubOAuthService } from './github-oauth.service';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { User, Workspace } from '@raven-docs/db/types/entity.types';
import WorkspaceAbilityFactory from '../../core/casl/abilities/workspace-ability.factory';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../../core/casl/interfaces/workspace-ability.type';
import { EnvironmentService } from '../environment/environment.service';

@Controller('integrations/github')
export class GitHubOAuthController {
  constructor(
    private readonly githubOAuthService: GitHubOAuthService,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
    private readonly environmentService: EnvironmentService,
  ) {}

  @Post('authorize')
  @UseGuards(JwtAuthGuard)
  async authorize(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (
      ability.cannot(
        WorkspaceCaslAction.Manage,
        WorkspaceCaslSubject.Settings,
      )
    ) {
      throw new ForbiddenException();
    }

    const authorizationUrl = this.githubOAuthService.generateAuthorizationUrl(
      workspace.id,
      user.id,
    );

    return { authorizationUrl };
  }

  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() reply: FastifyReply,
  ) {
    const appUrl = this.environmentService.getAppUrl();

    if (!code || !state) {
      return reply.redirect(
        `${appUrl}/settings/workspace?github=error&reason=missing_params`,
      );
    }

    const result = await this.githubOAuthService.handleCallback(code, state);

    if (result.success) {
      return reply.redirect(
        `${appUrl}/settings/workspace?github=connected`,
      );
    }

    return reply.redirect(
      `${appUrl}/settings/workspace?github=error`,
    );
  }

  @Post('disconnect')
  @UseGuards(JwtAuthGuard)
  async disconnect(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (
      ability.cannot(
        WorkspaceCaslAction.Manage,
        WorkspaceCaslSubject.Settings,
      )
    ) {
      throw new ForbiddenException();
    }

    await this.githubOAuthService.disconnect(workspace.id);
    return { success: true };
  }

  @Get('status')
  @UseGuards(JwtAuthGuard)
  async status(@AuthWorkspace() workspace: Workspace) {
    return this.githubOAuthService.getConnectionStatus(workspace.id);
  }
}
