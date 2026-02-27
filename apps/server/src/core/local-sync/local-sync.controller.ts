import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { User, Workspace } from '@raven-docs/db/types/entity.types';
import { LocalSyncService } from './local-sync.service';
import {
  ConnectorHeartbeatDto,
  CreateLocalSyncSourceDto,
  GetConflictsDto,
  GetConflictPreviewDto,
  GetFileHistoryDto,
  GetSourceDeltasDto,
  GetSourceFilesDto,
  PauseSourceDto,
  PushBatchDto,
  RegisterConnectorDto,
  ResolveConflictDto,
} from './dto/local-sync.dto';

@Controller('local-sync')
@UseGuards(JwtAuthGuard)
export class LocalSyncController {
  constructor(private readonly localSyncService: LocalSyncService) {}

  @Post('connectors/register')
  @HttpCode(HttpStatus.OK)
  registerConnector(
    @Body() dto: RegisterConnectorDto,
    @AuthWorkspace() workspace: Workspace,
    @AuthUser() user: User,
  ) {
    return this.localSyncService.registerConnector({
      dto,
      workspaceId: workspace.id,
      userId: user.id,
    });
  }

  @Post('connectors/heartbeat')
  @HttpCode(HttpStatus.OK)
  heartbeat(
    @Body() dto: ConnectorHeartbeatDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.localSyncService.heartbeat({
      connectorId: dto.connectorId,
      workspaceId: workspace.id,
    });
  }

  @Post('sources')
  @HttpCode(HttpStatus.OK)
  createSource(
    @Body() dto: CreateLocalSyncSourceDto,
    @AuthWorkspace() workspace: Workspace,
    @AuthUser() user: User,
  ) {
    return this.localSyncService.createSource({
      dto,
      workspaceId: workspace.id,
      userId: user.id,
    });
  }

  @Post('sources/list')
  @HttpCode(HttpStatus.OK)
  listSources(@AuthWorkspace() workspace: Workspace) {
    return this.localSyncService.listSources(workspace.id);
  }

  @Post('sources/files')
  @HttpCode(HttpStatus.OK)
  getSourceFiles(
    @Body() dto: GetSourceFilesDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.localSyncService.getFiles({
      sourceId: dto.sourceId,
      workspaceId: workspace.id,
    });
  }

  @Post('sources/push-batch')
  @HttpCode(HttpStatus.OK)
  pushBatch(
    @Body() dto: PushBatchDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.localSyncService.pushBatch({
      dto,
      workspaceId: workspace.id,
    });
  }

  @Post('sources/deltas')
  @HttpCode(HttpStatus.OK)
  getDeltas(
    @Body() dto: GetSourceDeltasDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.localSyncService.getDeltas({
      sourceId: dto.sourceId,
      workspaceId: workspace.id,
      cursor: dto.cursor,
      limit: dto.limit,
    });
  }

  @Post('sources/conflicts')
  @HttpCode(HttpStatus.OK)
  getConflicts(
    @Body() dto: GetConflictsDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.localSyncService.getConflicts({
      sourceId: dto.sourceId,
      workspaceId: workspace.id,
    });
  }

  @Post('sources/conflicts/preview')
  @HttpCode(HttpStatus.OK)
  getConflictPreview(
    @Body() dto: GetConflictPreviewDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.localSyncService.getConflictPreview({
      sourceId: dto.sourceId,
      conflictId: dto.conflictId,
      workspaceId: workspace.id,
      contextLines: dto.contextLines,
    });
  }

  @Post('sources/conflicts/resolve')
  @HttpCode(HttpStatus.OK)
  resolveConflict(
    @Body() dto: ResolveConflictDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.localSyncService.resolveConflict({
      dto,
      workspaceId: workspace.id,
    });
  }

  @Post('sources/pause')
  @HttpCode(HttpStatus.OK)
  pauseSource(
    @Body() dto: PauseSourceDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.localSyncService.pauseSource({
      sourceId: dto.sourceId,
      workspaceId: workspace.id,
    });
  }

  @Post('sources/resume')
  @HttpCode(HttpStatus.OK)
  resumeSource(
    @Body() dto: PauseSourceDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.localSyncService.resumeSource({
      sourceId: dto.sourceId,
      workspaceId: workspace.id,
    });
  }

  @Post('sources/history')
  @HttpCode(HttpStatus.OK)
  getFileHistory(
    @Body() dto: GetFileHistoryDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.localSyncService.getFileHistory({
      sourceId: dto.sourceId,
      workspaceId: workspace.id,
      relativePath: dto.relativePath,
    });
  }
}
