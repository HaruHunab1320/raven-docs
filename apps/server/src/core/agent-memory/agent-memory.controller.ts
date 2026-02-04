import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@raven-docs/db/types/entity.types';
import { UserRole } from '../../common/helpers/types/permission';
import {
  MemoryDailyDto,
  MemoryDaysDto,
  MemoryEntityDto,
  MemoryEntityDetailsDto,
  MemoryGraphDto,
  MemoryIngestDto,
  MemoryLinksDto,
  MemoryActivityDto,
  MemoryDeleteDto,
  MemoryProfileDistillDto,
  MemoryQueryDto,
} from './dto/memory.dto';
import { AgentMemoryService } from './agent-memory.service';
import { AgentProfileService } from './agent-profile.service';
import { resolveAgentSettings } from '../agent/agent-settings';

@UseGuards(JwtAuthGuard)
@Controller('memory')
export class AgentMemoryController {
  constructor(
    private readonly memoryService: AgentMemoryService,
    private readonly profileService: AgentProfileService,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('ingest')
  async ingest(
    @Body() dto: MemoryIngestDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    if (dto.workspaceId !== workspace.id) {
      throw new ForbiddenException('Workspace mismatch');
    }

    return this.memoryService.ingestMemory({
      workspaceId: workspace.id,
      spaceId: dto.spaceId,
      creatorId: user.id,
      source: dto.source,
      content: dto.content,
      summary: dto.summary,
      tags: dto.tags,
      timestamp: dto.timestamp,
      entities: dto.entities,
    });
  }

  @HttpCode(HttpStatus.OK)
  @Post('activity')
  async activity(
    @Body() dto: MemoryActivityDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    if (dto.workspaceId !== workspace.id) {
      throw new ForbiddenException('Workspace mismatch');
    }

    const agentSettings = resolveAgentSettings(workspace.settings);
    const userSettings =
      user.settings && typeof user.settings === 'object'
        ? (user.settings as { preferences?: { enableActivityTracking?: boolean } })
        : undefined;
    const userPref = userSettings?.preferences?.enableActivityTracking;
    if (
      !agentSettings.enabled ||
      !agentSettings.enableActivityTracking ||
      userPref === false
    ) {
      return { status: 'skipped' };
    }

    if (dto.durationMs < 10_000) {
      return { status: 'ignored' };
    }

    const contextLabel = dto.title || dto.pageId || dto.projectId || 'activity';
    const summary =
      dto.pageId || dto.projectId
        ? `Viewed ${contextLabel}`
        : `Active session: ${contextLabel}`;

    const tags = ['activity', 'view', 'user', `user:${user.id}`];
    if (dto.pageId) {
      tags.push('page', `page:${dto.pageId}`);
    }
    if (dto.projectId) {
      tags.push('project', `project:${dto.projectId}`);
    }

    const source = dto.pageId
      ? 'page.view'
      : dto.projectId
        ? 'project.view'
        : 'activity.view';

    return this.memoryService.ingestMemory({
      workspaceId: workspace.id,
      spaceId: dto.spaceId,
      creatorId: user.id,
      source,
      summary,
      tags,
      timestamp: dto.endedAt,
      content: {
        pageId: dto.pageId,
        projectId: dto.projectId,
        title: dto.title,
        route: dto.route,
        durationMs: dto.durationMs,
        startedAt: dto.startedAt,
        endedAt: dto.endedAt,
      },
    });
  }

  @HttpCode(HttpStatus.OK)
  @Post('query')
  async query(
    @Body() dto: MemoryQueryDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    if (dto.workspaceId !== workspace.id) {
      throw new ForbiddenException('Workspace mismatch');
    }

    return this.memoryService.queryMemories(
      {
        workspaceId: workspace.id,
        spaceId: dto.spaceId,
        creatorId: user.id,
        tags: dto.tags,
        sources: dto.sources,
        from: dto.from,
        to: dto.to,
        limit: dto.limit,
      },
      dto.query,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('delete')
  async delete(
    @Body() dto: MemoryDeleteDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    if (dto.workspaceId !== workspace.id) {
      throw new ForbiddenException('Workspace mismatch');
    }

    return this.memoryService.deleteMemories(
      {
        workspaceId: workspace.id,
        spaceId: dto.spaceId,
        creatorId: user.id,
        tags: dto.tags,
        sources: dto.sources,
        limit: dto.limit,
      },
      dto.contentPrefixes || [],
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('daily')
  async daily(
    @Body() dto: MemoryDailyDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    if (dto.workspaceId !== workspace.id) {
      throw new ForbiddenException('Workspace mismatch');
    }

    return this.memoryService.getDailyMemories(
      {
        workspaceId: workspace.id,
        spaceId: dto.spaceId,
        creatorId: user.id,
        limit: dto.limit,
      },
      dto.date,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('days')
  async days(
    @Body() dto: MemoryDaysDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    if (dto.workspaceId !== workspace.id) {
      throw new ForbiddenException('Workspace mismatch');
    }

    return this.memoryService.listMemoryDays({
      workspaceId: workspace.id,
      spaceId: dto.spaceId,
      creatorId: user.id,
      limit: dto.days,
    });
  }

  @HttpCode(HttpStatus.OK)
  @Post('graph')
  async graph(
    @Body() dto: MemoryGraphDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    if (dto.workspaceId !== workspace.id) {
      throw new ForbiddenException('Workspace mismatch');
    }

    return this.memoryService.getMemoryGraph({
      workspaceId: workspace.id,
      spaceId: dto.spaceId,
      creatorId: user.id,
      tags: dto.tags,
      sources: dto.sources,
      from: dto.from,
      to: dto.to,
      maxNodes: dto.maxNodes,
      maxEdges: dto.maxEdges,
      minWeight: dto.minWeight,
    });
  }

  @HttpCode(HttpStatus.OK)
  @Post('entity')
  async entity(
    @Body() dto: MemoryEntityDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    if (dto.workspaceId !== workspace.id) {
      throw new ForbiddenException('Workspace mismatch');
    }

    return this.memoryService.getEntityMemories({
      workspaceId: workspace.id,
      spaceId: dto.spaceId,
      creatorId: user.id,
      entityId: dto.entityId,
      limit: dto.limit,
    });
  }

  @HttpCode(HttpStatus.OK)
  @Post('entity-details')
  async entityDetails(
    @Body() dto: MemoryEntityDetailsDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    if (dto.workspaceId !== workspace.id) {
      throw new ForbiddenException('Workspace mismatch');
    }

    return this.memoryService.getEntityDetails({
      workspaceId: workspace.id,
      spaceId: dto.spaceId,
      creatorId: user.id,
      entityId: dto.entityId,
      limit: dto.limit,
    });
  }

  @HttpCode(HttpStatus.OK)
  @Post('links')
  async links(
    @Body() dto: MemoryLinksDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    if (dto.workspaceId !== workspace.id) {
      throw new ForbiddenException('Workspace mismatch');
    }

    return this.memoryService.getEntityLinks({
      workspaceId: workspace.id,
      spaceId: dto.spaceId,
      creatorId: user.id,
      taskIds: dto.taskIds,
      goalIds: dto.goalIds,
      limit: dto.limit,
    });
  }

  @HttpCode(HttpStatus.OK)
  @Post('profile/distill')
  async distillProfile(
    @Body() dto: MemoryProfileDistillDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    if (dto.workspaceId !== workspace.id) {
      throw new ForbiddenException('Workspace mismatch');
    }
    if (!dto.spaceId) {
      throw new ForbiddenException('Missing space');
    }

    if (dto.userId && dto.userId !== user.id) {
      const role = user.role as UserRole | null;
      if (role !== UserRole.ADMIN && role !== UserRole.OWNER) {
        throw new ForbiddenException('Admin role required');
      }
    }

    if (dto.userId) {
      await this.profileService.distillForUser(dto.spaceId, workspace, dto.userId);
    } else {
      await this.profileService.distillForSpace(dto.spaceId, workspace);
    }

    return { status: 'completed' };
  }
}
