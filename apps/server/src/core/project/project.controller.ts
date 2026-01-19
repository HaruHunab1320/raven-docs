import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ProjectService } from './services/project.service';
import {
  ProjectIdDto,
  CreateProjectDto,
  UpdateProjectDto,
  ProjectListDto,
  ProjectArchiveDto,
  ProjectTrashDto,
  ProjectPlaybookDraftDto,
  ProjectPlaybookChatDraftDto,
  ProjectPlaybookChatSummaryDto,
  ProjectRecapDto,
} from './dto/project.dto';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { User, Workspace } from '../../database/types/entity.types';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../casl/interfaces/space-ability.type';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';

@UseGuards(JwtAuthGuard)
@Controller('projects')
export class ProjectController {
  private readonly logger = new Logger(ProjectController.name);

  constructor(
    private readonly projectService: ProjectService,
    private readonly spaceAbility: SpaceAbilityFactory,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('/info')
  async getProject(@Body() dto: ProjectIdDto, @AuthUser() user: User) {
    const project = await this.projectService.findById(dto.projectId, {
      includeCreator: true,
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const ability = await this.spaceAbility.createForUser(
      user,
      project.spaceId,
    );
    if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }

    return project;
  }

  @HttpCode(HttpStatus.OK)
  @Post('/list')
  async listProjects(@Body() dto: ProjectListDto, @AuthUser() user: User) {
    this.logger.debug('Project list requested', {
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      spaceId: dto.spaceId,
      page: dto.page,
      limit: dto.limit,
    });

    const ability = await this.spaceAbility.createForUser(user, dto.spaceId);
    if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }

    const { page, limit, ...options } = dto;
    const result = await this.projectService.findBySpaceId(
      dto.spaceId,
      { page, limit },
      {
        includeArchived: options.includeArchived,
        includeCreator: true,
        searchTerm: options.searchTerm,
      },
    );

    this.logger.debug('Project list response', {
      count: result.data.length,
    });
    if (result.data.length > 0) {
      this.logger.debug('Project list sample', {
        projects: result.data.slice(0, 3).map((p) => ({
          id: p.id,
          name: p.name,
          description:
            p.description?.substring(0, 20) +
              (p.description?.length > 20 ? '...' : '') || '',
          createdAt: p.createdAt,
        })),
      });
    }

    return result;
  }

  @HttpCode(HttpStatus.OK)
  @Post('/create')
  async createProject(
    @Body() dto: CreateProjectDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.logger.debug('Project create requested', {
      project: dto,
      userId: user.id,
      workspaceId: workspace.id,
    });

    const ability = await this.spaceAbility.createForUser(user, dto.spaceId);
    if (ability.cannot(SpaceCaslAction.Create, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }

    const result = await this.projectService.create(user.id, workspace.id, dto);
    this.logger.debug('Project created', {
      projectId: result?.id,
      name: result?.name,
    });
    return result;
  }

  @HttpCode(HttpStatus.OK)
  @Post('/create-page')
  async createProjectPage(
    @Body() dto: ProjectIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const project = await this.projectService.findById(dto.projectId);
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const ability = await this.spaceAbility.createForUser(
      user,
      project.spaceId,
    );
    if (ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }

    return this.projectService.createProjectPage(
      user.id,
      workspace.id,
      project.id,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('/update')
  async updateProject(@Body() dto: UpdateProjectDto, @AuthUser() user: User) {
    this.logger.debug('Project update requested', {
      projectId: dto.projectId,
      userId: user.id,
    });

    const project = await this.projectService.findById(dto.projectId);
    if (!project) {
      this.logger.warn(`Project not found: ${dto.projectId}`);
      throw new NotFoundException('Project not found');
    }

    const ability = await this.spaceAbility.createForUser(
      user,
      project.spaceId,
    );
    if (ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }

    const { projectId, ...updateData } = dto;
    this.logger.debug('Project update payload', {
      projectId,
      updateData,
    });

    try {
      const result = await this.projectService.update(projectId, updateData);
      this.logger.debug('Project update completed', {
        projectId,
      });
      return result;
    } catch (error) {
      this.logger.error('Project update failed', error as Error);
      throw error;
    }
  }

  @HttpCode(HttpStatus.OK)
  @Post('/delete')
  async deleteProject(@Body() dto: ProjectIdDto, @AuthUser() user: User) {
    const project = await this.projectService.findById(dto.projectId);
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const ability = await this.spaceAbility.createForUser(
      user,
      project.spaceId,
    );
    if (ability.cannot(SpaceCaslAction.Manage, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }

    await this.projectService.delete(dto.projectId, user.id);
    return { success: true };
  }

  @HttpCode(HttpStatus.OK)
  @Post('/trash')
  async getDeletedProjects(
    @Body() dto: ProjectTrashDto,
    @AuthUser() user: User,
  ) {
    const ability = await this.spaceAbility.createForUser(user, dto.spaceId);
    if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }

    return this.projectService.listDeleted(dto.spaceId);
  }

  @HttpCode(HttpStatus.OK)
  @Post('/restore')
  async restoreProject(@Body() dto: ProjectIdDto, @AuthUser() user: User) {
    const project = await this.projectService.findById(dto.projectId, {
      includeDeleted: true,
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const ability = await this.spaceAbility.createForUser(
      user,
      project.spaceId,
    );
    if (ability.cannot(SpaceCaslAction.Manage, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }

    const restored = await this.projectService.restore(dto.projectId, user.id);
    if (!restored) {
      throw new NotFoundException('Project not found');
    }

    return restored;
  }

  @HttpCode(HttpStatus.OK)
  @Post('/archive')
  async archiveProject(@Body() dto: ProjectArchiveDto, @AuthUser() user: User) {
    const project = await this.projectService.findById(dto.projectId);
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const ability = await this.spaceAbility.createForUser(
      user,
      project.spaceId,
    );
    if (ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }

    if (dto.isArchived) {
      return this.projectService.archive(dto.projectId);
    } else {
      return this.projectService.unarchive(dto.projectId);
    }
  }

  @HttpCode(HttpStatus.OK)
  @Post('/recap')
  async generateProjectRecap(
    @Body() dto: ProjectRecapDto,
    @AuthUser() user: User,
  ) {
    const project = await this.projectService.findById(dto.projectId);
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const ability = await this.spaceAbility.createForUser(
      user,
      project.spaceId,
    );
    if (ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }

    return this.projectService.generateProjectRecap(dto.projectId, user.id, {
      days: dto.days,
      includeOpenTasks: dto.includeOpenTasks,
    });
  }

  @HttpCode(HttpStatus.OK)
  @Post('/playbook/draft')
  async generatePlaybookDraft(
    @Body() dto: ProjectPlaybookDraftDto,
    @AuthUser() user: User,
  ) {
    const project = await this.projectService.findById(dto.projectId);
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const ability = await this.spaceAbility.createForUser(
      user,
      project.spaceId,
    );
    if (ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }

    return this.projectService.generatePlaybookDraft(
      dto.projectId,
      dto.brief,
      user.id,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('/playbook/draft-from-chat')
  async generatePlaybookDraftFromChat(
    @Body() dto: ProjectPlaybookChatDraftDto,
    @AuthUser() user: User,
  ) {
    const project = await this.projectService.findById(dto.projectId);
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const ability = await this.spaceAbility.createForUser(
      user,
      project.spaceId,
    );
    if (ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }

    return this.projectService.generatePlaybookDraftFromChat(
      dto.projectId,
      dto.pageId,
      dto.sessionId,
      user.id,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('/playbook/chat-summary')
  async summarizePlaybookChat(
    @Body() dto: ProjectPlaybookChatSummaryDto,
    @AuthUser() user: User,
  ) {
    const project = await this.projectService.findById(dto.projectId);
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const ability = await this.spaceAbility.createForUser(
      user,
      project.spaceId,
    );
    if (ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }

    return this.projectService.summarizePlaybookChat(
      dto.projectId,
      dto.pageId,
      dto.sessionId,
    );
  }
}
