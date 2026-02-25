import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { Workspace, User } from '@raven-docs/db/types/entity.types';
import { CodingSwarmService } from './coding-swarm.service';
import {
  ExecuteSwarmDto,
  SwarmStatusDto,
  ListSwarmDto,
  StopSwarmDto,
  SwarmLogsDto,
  ResetSwarmDto,
} from './dto/coding-swarm.dto';

@Controller('coding-swarm')
@UseGuards(JwtAuthGuard)
export class CodingSwarmController {
  constructor(private readonly codingSwarmService: CodingSwarmService) {}

  @Post('execute')
  @HttpCode(HttpStatus.OK)
  async execute(
    @Body() dto: ExecuteSwarmDto,
    @AuthWorkspace() workspace: Workspace,
    @AuthUser() user: User,
  ) {
    return this.codingSwarmService.execute({
      workspaceId: workspace.id,
      repoUrl: dto.repoUrl,
      taskDescription: dto.taskDescription,
      experimentId: dto.experimentId,
      spaceId: dto.spaceId,
      agentType: dto.agentType,
      baseBranch: dto.baseBranch,
      taskContext: dto.taskContext,
      triggeredBy: user.id,
    });
  }

  @Post('status')
  @HttpCode(HttpStatus.OK)
  async getStatus(
    @Body() dto: SwarmStatusDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.codingSwarmService.getStatus(workspace.id, dto.executionId);
  }

  @Post('list')
  @HttpCode(HttpStatus.OK)
  async list(
    @Body() dto: ListSwarmDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.codingSwarmService.list(workspace.id, {
      status: dto.status,
      spaceId: dto.spaceId,
      experimentId: dto.experimentId,
      limit: dto.limit,
    });
  }

  @Post('stop')
  @HttpCode(HttpStatus.OK)
  async stop(@Body() dto: StopSwarmDto, @AuthWorkspace() workspace: Workspace) {
    return this.codingSwarmService.stop(workspace.id, dto.executionId);
  }

  @Post('reset')
  @HttpCode(HttpStatus.OK)
  async reset(
    @Body() dto: ResetSwarmDto,
    @AuthWorkspace() workspace: Workspace,
    @AuthUser() user: User,
  ) {
    return this.codingSwarmService.reset(dto.executionId, workspace.id, user.id);
  }

  @Post('logs')
  @HttpCode(HttpStatus.OK)
  async getLogs(
    @Body() dto: SwarmLogsDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.codingSwarmService.getLogs(
      workspace.id,
      dto.executionId,
      dto.limit,
    );
  }
}
