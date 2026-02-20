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
  async getStatus(@Body() dto: SwarmStatusDto) {
    return this.codingSwarmService.getStatus(dto.executionId);
  }

  @Post('list')
  @HttpCode(HttpStatus.OK)
  async list(
    @Body() dto: ListSwarmDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.codingSwarmService.list(workspace.id, {
      status: dto.status,
      experimentId: dto.experimentId,
      limit: dto.limit,
    });
  }

  @Post('stop')
  @HttpCode(HttpStatus.OK)
  async stop(@Body() dto: StopSwarmDto) {
    return this.codingSwarmService.stop(dto.executionId);
  }

  @Post('logs')
  @HttpCode(HttpStatus.OK)
  async getLogs(@Body() dto: SwarmLogsDto) {
    return this.codingSwarmService.getLogs(dto.executionId, dto.limit);
  }
}
