import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@raven-docs/db/types/entity.types';
import { UserService } from './user.service';
import {
  DeleteSubscriptionDto,
  ExchangeSubscriptionDto,
  SetupSubscriptionTokenDto,
  StartSubscriptionDto,
  SubscriptionProvider,
} from './dto/subscription-auth.dto';

@UseGuards(JwtAuthGuard)
@Controller('subscription')
export class SubscriptionController {
  constructor(private readonly userService: UserService) {}

  @HttpCode(HttpStatus.OK)
  @Post('status')
  async status(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    return this.userService.getSubscriptionStatus(user.id, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('start')
  async start(
    @Body() dto: StartSubscriptionDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.userService.startSubscriptionAuth(
      user.id,
      workspace.id,
      dto.provider,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('anthropic/start')
  async startAnthropic(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.userService.startSubscriptionAuth(
      user.id,
      workspace.id,
      'anthropic-subscription',
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('openai/start')
  async startOpenAI(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.userService.startSubscriptionAuth(
      user.id,
      workspace.id,
      'openai-codex',
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('exchange')
  async exchange(
    @Body() dto: ExchangeSubscriptionDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.userService.exchangeSubscriptionCode(user.id, workspace.id, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('anthropic/exchange')
  async exchangeAnthropic(
    @Body() dto: Omit<ExchangeSubscriptionDto, 'provider'>,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.userService.exchangeSubscriptionCode(user.id, workspace.id, {
      provider: 'anthropic-subscription',
      code: dto.code,
      state: dto.state,
    });
  }

  @HttpCode(HttpStatus.OK)
  @Post('openai/exchange')
  async exchangeOpenAI(
    @Body() dto: Omit<ExchangeSubscriptionDto, 'provider'>,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.userService.exchangeSubscriptionCode(user.id, workspace.id, {
      provider: 'openai-codex',
      code: dto.code,
      state: dto.state,
    });
  }

  @HttpCode(HttpStatus.OK)
  @Post('setup-token')
  async setupToken(
    @Body() dto: SetupSubscriptionTokenDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.userService.setupSubscriptionToken(
      user.id,
      workspace.id,
      dto.provider,
      dto.token,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('anthropic/setup-token')
  async setupAnthropicToken(
    @Body() dto: Omit<SetupSubscriptionTokenDto, 'provider'>,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.userService.setupSubscriptionToken(
      user.id,
      workspace.id,
      'anthropic-subscription',
      dto.token,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Delete()
  async remove(
    @Body() dto: DeleteSubscriptionDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.userService.deleteSubscription(user.id, workspace.id, dto.provider);
  }

  @HttpCode(HttpStatus.OK)
  @Delete(':provider')
  async removeByParam(
    @Param('provider') provider: string,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const normalized =
      provider === 'anthropic-subscription' || provider === 'openai-codex'
        ? (provider as SubscriptionProvider)
        : null;
    if (!normalized) {
      throw new BadRequestException('Invalid subscription provider');
    }
    return this.userService.deleteSubscription(user.id, workspace.id, normalized);
  }
}
