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
import { TaskService } from './services/task.service';
import {
  TaskIdDto,
  CreateTaskDto,
  UpdateTaskDto,
  TaskListByProjectDto,
  TaskListBySpaceDto,
  TaskAssignmentDto,
  TaskCompletionDto,
  MoveTaskToProjectDto,
  TaskTriageSummaryDto,
  TaskByPageDto,
  TaskBacklinksDto,
} from './dto/task.dto';
import {
  ListTaskLabelsDto,
  CreateTaskLabelDto,
  UpdateTaskLabelDto,
  DeleteTaskLabelDto,
  AssignTaskLabelDto,
  RemoveTaskLabelDto,
} from './dto/task-label.dto';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { User, Workspace } from '../../database/types/entity.types';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../casl/interfaces/space-ability.type';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import { ProjectService } from './services/project.service';
import { Paginated } from '../../lib/pagination/paginated';
import { Task } from '../../database/types/entity.types';

// Adapter function to transform server pagination format to client format
function adaptPaginationFormat<T>(paginated: Paginated<T>): any {
  return {
    items: paginated.data,
    meta: {
      limit: paginated.pagination.limit,
      page: paginated.pagination.page,
      hasNextPage: paginated.pagination.page < paginated.pagination.totalPages,
      hasPrevPage: paginated.pagination.page > 1,
    },
  };
}

// Empty result adapter
function createEmptyResult(page: number = 1, limit: number = 10): any {
  return {
    items: [],
    meta: {
      limit,
      page,
      hasNextPage: false,
      hasPrevPage: false,
    },
  };
}

@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class TaskController {
  private readonly logger = new Logger(TaskController.name);

  constructor(
    private readonly taskService: TaskService,
    private readonly projectService: ProjectService,
    private readonly spaceAbility: SpaceAbilityFactory,
  ) {}

  private logDebug(message: string, meta?: Record<string, unknown>) {
    if (meta) {
      this.logger.debug(`${message} ${JSON.stringify(meta)}`);
    } else {
      this.logger.debug(message);
    }
  }

  private logWarn(message: string, meta?: Record<string, unknown>) {
    if (meta) {
      this.logger.warn(`${message} ${JSON.stringify(meta)}`);
    } else {
      this.logger.warn(message);
    }
  }

  private logError(
    message: string,
    error?: unknown,
    meta?: Record<string, unknown>,
  ) {
    const details = meta ? `${message} ${JSON.stringify(meta)}` : message;
    if (error instanceof Error) {
      this.logger.error(details, error.stack);
    } else {
      this.logger.error(details);
    }
  }

  @HttpCode(HttpStatus.OK)
  @Post('/info')
  async getTask(@Body() dto: TaskIdDto, @AuthUser() user: User) {
    const task = await this.taskService.findById(dto.taskId, {
      includeCreator: true,
      includeAssignee: true,
      includeProject: true,
      includeParentTask: true,
      includeLabels: true,
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    const ability = await this.spaceAbility.createForUser(user, task.spaceId);
    if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }

    return task;
  }

  @HttpCode(HttpStatus.OK)
  @Post('/byPage')
  async getTaskByPage(@Body() dto: TaskByPageDto, @AuthUser() user: User) {
    const task = await this.taskService.findByPageId(dto.pageId, {
      includeCreator: true,
      includeAssignee: true,
      includeProject: true,
      includeParentTask: true,
      includeLabels: true,
    });

    if (!task) {
      return null;
    }

    const ability = await this.spaceAbility.createForUser(user, task.spaceId);
    if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }

    return task;
  }

  @HttpCode(HttpStatus.OK)
  @Post('/backlinks')
  async listTaskBacklinks(
    @Body() dto: TaskBacklinksDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const task = await this.taskService.findById(dto.taskId);

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    const ability = await this.spaceAbility.createForUser(user, task.spaceId);
    if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }

    return this.taskService.listBacklinkPages(
      dto.taskId,
      workspace.id,
      dto.limit ?? 20,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('/listByProject')
  async listTasksByProject(
    @Body() dto: TaskListByProjectDto,
    @AuthUser() user: User,
  ) {
    try {
      this.logDebug('listTasksByProject started', {
        projectId: dto.projectId,
        hasProjectId: !!dto.projectId,
        projectIdType: typeof dto.projectId,
        projectIdLength: dto.projectId?.length,
        userDetails: { id: user.id, name: user.name },
      });

      if (!dto.projectId || dto.projectId.trim() === '') {
        this.logWarn('Empty projectId, returning empty result', {
          userId: user.id,
        });
        return createEmptyResult(dto.page, dto.limit);
      }

      // Try to find the project
      let project;
      try {
        project = await this.projectService.findById(dto.projectId);
        this.logDebug('Project lookup result', {
          found: !!project,
          projectId: dto.projectId,
        });
      } catch (error: any) {
        this.logError('Project lookup failed', error, {
          projectId: dto.projectId,
        });
        throw error;
      }

      if (!project) {
        this.logWarn('Project not found', { projectId: dto.projectId });
        throw new NotFoundException('Project not found');
      }

      // Check permissions
      try {
        const ability = await this.spaceAbility.createForUser(
          user,
          project.spaceId,
        );
        if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
          this.logWarn('Permission denied for user', { userId: user.id });
          throw new ForbiddenException();
        }
      } catch (error: any) {
        if (error instanceof ForbiddenException) {
          throw error;
        }
        this.logError('Permission check failed', error, {
          userId: user.id,
          projectId: dto.projectId,
        });
        throw error;
      }

      // Fetch tasks
      const {
        page,
        limit,
        projectId,
        status,
        bucket,
        searchTerm,
        includeSubtasks,
      } = dto;
      this.logDebug('Calling taskService.findByProjectId', {
        projectId,
        page,
        limit,
      });

      let result;
      try {
        result = await this.taskService.findByProjectId(
          projectId,
          { page, limit },
          {
            status,
            bucket,
            searchTerm,
            includeSubtasks,
            includeCreator: true,
            includeAssignee: true,
            includeLabels: true,
          },
        );
        this.logDebug('Got result from taskService', {
          hasResult: !!result,
          dataLength: result?.data?.length,
          paginationInfo: result?.pagination,
        });
      } catch (error: any) {
        this.logError('taskService.findByProjectId failed', error, {
          projectId,
        });
        throw error;
      }

      // Transform the pagination format to match client expectations
      this.logDebug('Transforming result format');
      try {
        const transformed = adaptPaginationFormat(result);
        this.logDebug('Successfully transformed result format', {
          itemsLength: transformed?.items?.length,
          meta: transformed?.meta,
        });
        return transformed;
      } catch (error: any) {
        this.logError('Failed to transform result format', error);
        throw error;
      }
    } catch (error: any) {
      this.logError('Unhandled error in listTasksByProject', error, {
        projectId: dto.projectId,
      });
      throw error;
    }
  }

  @HttpCode(HttpStatus.OK)
  @Post('/triageSummary')
  async getDailyTriageSummary(
    @Body() dto: TaskTriageSummaryDto,
    @AuthUser() user: User,
  ) {
    const ability = await this.spaceAbility.createForUser(user, dto.spaceId);
    if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }

    return this.taskService.getDailyTriageSummary(dto.spaceId, {
      limit: dto.limit,
      workspaceId: user.workspaceId,
    });
  }

  @HttpCode(HttpStatus.OK)
  @Post('/listBySpace')
  async listTasksBySpace(
    @Body() dto: TaskListBySpaceDto,
    @AuthUser() user: User,
  ) {
    try {
      this.logDebug('listTasksBySpace started', {
        spaceId: dto.spaceId,
        hasSpaceId: !!dto.spaceId,
        spaceIdType: typeof dto.spaceId,
        spaceIdLength: dto.spaceId?.length,
        userDetails: { id: user.id, name: user.name },
      });

      if (!dto.spaceId || dto.spaceId.trim() === '') {
        this.logWarn('Empty spaceId, returning empty result', {
          userId: user.id,
        });
        return createEmptyResult(dto.page, dto.limit);
      }

      // Check permissions
      try {
        const ability = await this.spaceAbility.createForUser(
          user,
          dto.spaceId,
        );
        if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
          this.logWarn('Permission denied for user', { userId: user.id });
          throw new ForbiddenException();
        }
      } catch (error: any) {
        if (error instanceof ForbiddenException) {
          throw error;
        }
        this.logError('Permission check failed', error, {
          userId: user.id,
          spaceId: dto.spaceId,
        });
        throw error;
      }

      // Fetch tasks
      const { page, limit, spaceId, status, bucket, searchTerm } = dto;
      this.logDebug('Calling taskService.findBySpaceId', {
        spaceId,
        page,
        limit,
      });

      let result;
      try {
        result = await this.taskService.findBySpaceId(
          spaceId,
          { page, limit },
          {
            status,
            bucket,
            searchTerm,
            includeCreator: true,
            includeAssignee: true,
            includeLabels: true,
            includeProject: true,
          },
        );
        this.logDebug('Got result from taskService', {
          hasResult: !!result,
          dataLength: result?.data?.length,
          paginationInfo: result?.pagination,
        });
      } catch (error: any) {
        this.logError('taskService.findBySpaceId failed', error, {
          spaceId,
        });
        throw error;
      }

      // Transform the pagination format to match client expectations
      this.logDebug('Transforming result format');
      try {
        const transformed = adaptPaginationFormat(result);
        this.logDebug('Successfully transformed result format', {
          itemsLength: transformed?.items?.length,
          meta: transformed?.meta,
        });
        return transformed;
      } catch (error: any) {
        this.logError('Failed to transform result format', error);
        throw error;
      }
    } catch (error: any) {
      this.logError('Unhandled error in listTasksBySpace', error, {
        spaceId: dto.spaceId,
      });
      throw error;
    }
  }

  @HttpCode(HttpStatus.OK)
  @Post('/labels/list')
  async listLabels(
    @Body() dto: ListTaskLabelsDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    if (dto.workspaceId !== workspace.id) {
      throw new ForbiddenException();
    }
    return this.taskService.listLabels(workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('/labels/create')
  async createLabel(
    @Body() dto: CreateTaskLabelDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    if (dto.workspaceId !== workspace.id) {
      throw new ForbiddenException();
    }
    return this.taskService.createLabel(workspace.id, {
      name: dto.name,
      color: dto.color,
    });
  }

  @HttpCode(HttpStatus.OK)
  @Post('/labels/update')
  async updateLabel(
    @Body() dto: UpdateTaskLabelDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.taskService.updateLabel(workspace.id, dto.labelId, {
      name: dto.name,
      color: dto.color,
    });
  }

  @HttpCode(HttpStatus.OK)
  @Post('/labels/delete')
  async deleteLabel(
    @Body() dto: DeleteTaskLabelDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.taskService.deleteLabel(workspace.id, dto.labelId);
  }

  @HttpCode(HttpStatus.OK)
  @Post('/labels/assign')
  async assignLabel(
    @Body() dto: AssignTaskLabelDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.taskService.assignLabel(workspace.id, dto.taskId, dto.labelId);
  }

  @HttpCode(HttpStatus.OK)
  @Post('/labels/remove')
  async removeLabel(
    @Body() dto: RemoveTaskLabelDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.taskService.removeLabel(workspace.id, dto.taskId, dto.labelId);
  }

  @HttpCode(HttpStatus.OK)
  @Post('/create')
  async createTask(
    @Body() dto: CreateTaskDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const ability = await this.spaceAbility.createForUser(user, dto.spaceId);
    if (ability.cannot(SpaceCaslAction.Create, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }

    return this.taskService.create(user.id, workspace.id, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('/update')
  async updateTask(@Body() dto: UpdateTaskDto, @AuthUser() user: User) {
    const task = await this.taskService.findById(dto.taskId);
    if (!task) {
      throw new NotFoundException('Task not found');
    }

    const ability = await this.spaceAbility.createForUser(user, task.spaceId);
    if (ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }

    const { taskId, ...updateData } = dto;
    return this.taskService.update(taskId, updateData);
  }

  @HttpCode(HttpStatus.OK)
  @Post('/delete')
  async deleteTask(@Body() dto: TaskIdDto, @AuthUser() user: User) {
    const task = await this.taskService.findById(dto.taskId);
    if (!task) {
      throw new NotFoundException('Task not found');
    }

    const ability = await this.spaceAbility.createForUser(user, task.spaceId);
    if (ability.cannot(SpaceCaslAction.Manage, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }

    await this.taskService.delete(dto.taskId);
    return { success: true };
  }

  @HttpCode(HttpStatus.OK)
  @Post('/assign')
  async assignTask(@Body() dto: TaskAssignmentDto, @AuthUser() user: User) {
    const task = await this.taskService.findById(dto.taskId);
    if (!task) {
      throw new NotFoundException('Task not found');
    }

    const ability = await this.spaceAbility.createForUser(user, task.spaceId);
    if (ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }

    return this.taskService.assignTask(dto.taskId, dto.assigneeId);
  }

  @HttpCode(HttpStatus.OK)
  @Post('/complete')
  async completeTask(@Body() dto: TaskCompletionDto, @AuthUser() user: User) {
    const task = await this.taskService.findById(dto.taskId);
    if (!task) {
      throw new NotFoundException('Task not found');
    }

    const ability = await this.spaceAbility.createForUser(user, task.spaceId);
    if (ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }

    if (dto.isCompleted) {
      return this.taskService.markCompleted(dto.taskId);
    } else {
      return this.taskService.markIncomplete(dto.taskId);
    }
  }

  @HttpCode(HttpStatus.OK)
  @Post('/moveToProject')
  async moveTaskToProject(
    @Body() dto: MoveTaskToProjectDto,
    @AuthUser() user: User,
  ) {
    const task = await this.taskService.findById(dto.taskId);
    if (!task) {
      throw new NotFoundException('Task not found');
    }

    const ability = await this.spaceAbility.createForUser(user, task.spaceId);
    if (ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }

    return this.taskService.moveToProject(dto.taskId, dto.projectId);
  }
}
