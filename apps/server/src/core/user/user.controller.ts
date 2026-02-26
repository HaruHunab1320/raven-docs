import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserService } from './user.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@raven-docs/db/types/entity.types';
import { WorkspaceRepo } from '@raven-docs/db/repos/workspace/workspace.repo';
import { UpdateAgentProviderAuthDto } from './dto/update-agent-provider-auth.dto';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly workspaceRepo: WorkspaceRepo,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('me')
  async getUserInfo(
    @AuthUser() authUser: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const memberCount = await this.workspaceRepo.getActiveUserCount(
      workspace.id,
    );

    const workspaceInfo = {
      ...workspace,
      memberCount,
    };

    return { user: this.sanitizeUserSettings(authUser), workspace: workspaceInfo };
  }

  @HttpCode(HttpStatus.OK)
  @Post('update')
  async updateUser(
    @Body() updateUserDto: UpdateUserDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.userService.update(updateUserDto, user.id, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('agent-providers')
  async getAgentProviderAvailability(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.userService.getAgentProviderAvailability(user.id, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('agent-providers/update')
  async updateAgentProviderAvailability(
    @Body() dto: UpdateAgentProviderAuthDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.userService.updateAgentProviderAuth(user.id, workspace.id, dto);
  }

  private sanitizeUserSettings(user: User): User {
    const nextUser = { ...user } as any;
    const settings = (nextUser.settings || {}) as Record<string, any>;
    const integrations = (settings.integrations || {}) as Record<string, any>;
    const agentProviders = {
      ...(integrations.agentProviders || {}),
    } as Record<string, any>;

    if (agentProviders.anthropicApiKey) {
      agentProviders.anthropicApiKey = '••••••••';
    }
    if (agentProviders.claudeSubscriptionToken) {
      agentProviders.claudeSubscriptionToken = '••••••••';
    }
    if (agentProviders.claudeSubscriptionRefreshToken) {
      agentProviders.claudeSubscriptionRefreshToken = '••••••••';
    }
    if (agentProviders.openaiApiKey) {
      agentProviders.openaiApiKey = '••••••••';
    }
    if (agentProviders.openaiSubscriptionToken) {
      agentProviders.openaiSubscriptionToken = '••••••••';
    }
    if (agentProviders.openaiSubscriptionRefreshToken) {
      agentProviders.openaiSubscriptionRefreshToken = '••••••••';
    }
    if (agentProviders.googleApiKey) {
      agentProviders.googleApiKey = '••••••••';
    }

    nextUser.settings = {
      ...settings,
      integrations: {
        ...integrations,
        agentProviders,
      },
    };

    return nextUser;
  }
}
