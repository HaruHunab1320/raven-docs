import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { MCPRequest } from '../interfaces/mcp.interface';
import { User } from '@raven-docs/db/types/entity.types';
import { UserRole } from '../../../common/helpers/types/permission';
import SpaceAbilityFactory from '../../../core/casl/abilities/space-ability.factory';
import WorkspaceAbilityFactory from '../../../core/casl/abilities/workspace-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../../core/casl/interfaces/space-ability.type';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../../../core/casl/interfaces/workspace-ability.type';
import { PageRepo } from '@raven-docs/db/repos/page/page.repo';
import { TaskService } from '../../../core/project/services/task.service';
import { ProjectService } from '../../../core/project/services/project.service';
import { CommentRepo } from '@raven-docs/db/repos/comment/comment.repo';
import { AttachmentRepo } from '@raven-docs/db/repos/attachment/attachment.repo';
import { ResearchJobService } from '../../../core/research/research-job.service';
import { WorkspaceRepo } from '@raven-docs/db/repos/workspace/workspace.repo';

/**
 * Permission levels for MCP operations
 */
export enum MCPPermissionLevel {
  READ = 'read',
  WRITE = 'write',
  ADMIN = 'admin',
}

/**
 * Guard for MCP operation-level permissions
 *
 * This guard checks if the user has the required permission level
 * to perform a specific MCP operation.
 */
@Injectable()
export class MCPPermissionGuard implements CanActivate {
  private readonly logger = new Logger(MCPPermissionGuard.name);

  // Permission requirements for each resource.operation
  private readonly permissionMap = {
    // Page operations
    'page.get': MCPPermissionLevel.READ,
    'page.list': MCPPermissionLevel.READ,
    'page.create': MCPPermissionLevel.WRITE,
    'page.update': MCPPermissionLevel.WRITE,
    'page.delete': MCPPermissionLevel.WRITE,

    // Space operations
    'space.get': MCPPermissionLevel.READ,
    'space.list': MCPPermissionLevel.READ,
    'space.create': MCPPermissionLevel.WRITE,
    'space.update': MCPPermissionLevel.ADMIN,
    'space.delete': MCPPermissionLevel.ADMIN,

    // User operations
    'user.get': MCPPermissionLevel.READ,
    'user.list': MCPPermissionLevel.READ,
    'user.update': MCPPermissionLevel.ADMIN,

    // Group operations
    'group.get': MCPPermissionLevel.READ,
    'group.list': MCPPermissionLevel.READ,
    'group.create': MCPPermissionLevel.ADMIN,
    'group.update': MCPPermissionLevel.ADMIN,
    'group.delete': MCPPermissionLevel.ADMIN,
    'group.addMember': MCPPermissionLevel.ADMIN,
    'group.removeMember': MCPPermissionLevel.ADMIN,

    // Workspace operations
    'workspace.get': MCPPermissionLevel.READ,
    'workspace.update': MCPPermissionLevel.ADMIN,
    'workspace.create': MCPPermissionLevel.ADMIN,
    'workspace.addMember': MCPPermissionLevel.ADMIN,
    'workspace.removeMember': MCPPermissionLevel.ADMIN,

    // Attachment operations
    'attachment.get': MCPPermissionLevel.READ,
    'attachment.list': MCPPermissionLevel.READ,
    'attachment.upload': MCPPermissionLevel.WRITE,
    'attachment.download': MCPPermissionLevel.READ,
    'attachment.delete': MCPPermissionLevel.WRITE,

    // Comment operations
    'comment.get': MCPPermissionLevel.READ,
    'comment.list': MCPPermissionLevel.READ,
    'comment.create': MCPPermissionLevel.WRITE,
    'comment.update': MCPPermissionLevel.WRITE,
    'comment.delete': MCPPermissionLevel.WRITE,

    // Memory operations
    'memory.ingest': MCPPermissionLevel.WRITE,
    'memory.query': MCPPermissionLevel.READ,
    'memory.daily': MCPPermissionLevel.READ,
    'memory.days': MCPPermissionLevel.READ,

    // Research operations
    'research.create': MCPPermissionLevel.WRITE,
    'research.list': MCPPermissionLevel.READ,
    'research.info': MCPPermissionLevel.READ,

    // Repo operations
    'repo.listTree': MCPPermissionLevel.READ,
    'repo.readFile': MCPPermissionLevel.READ,

    // UI operations
    'ui.navigate': MCPPermissionLevel.ADMIN,

    // Default to admin for any operation not explicitly defined
    default: MCPPermissionLevel.ADMIN,
  };

  /**
   * Check if the user can activate the route
   *
   * @param context The execution context
   * @returns true if the user has permission, false otherwise
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user: User = request.user?.user || request.user;
    const mcpRequest: MCPRequest = request.body;

    if (!user) {
      this.logger.warn('User not found in request');
      throw new UnauthorizedException('User not authenticated');
    }

    if (!mcpRequest || !mcpRequest.method) {
      // Not an MCP request, or method validation will be handled elsewhere
      return true;
    }

    const caslAllowed = await this.checkCaslPermission(
      mcpRequest,
      user,
      request.workspaceId,
    );
    if (caslAllowed !== null) {
      return caslAllowed;
    }

    return this.hasPermission(mcpRequest.method, user);
  }

  /**
   * Check if a user has permission to perform an operation
   *
   * @param method The MCP method
   * @param user The user
   * @returns true if the user has permission, false otherwise
   */
  private hasPermission(method: string, user: User): boolean {
    // Get the required permission level for the method
    const requiredLevel =
      this.permissionMap[method] || this.permissionMap.default;

    const role = (user.role || '').toLowerCase();
    const isAdmin = role === UserRole.ADMIN || role === UserRole.OWNER;

    const allowed =
      requiredLevel === MCPPermissionLevel.READ
        ? true
        : requiredLevel === MCPPermissionLevel.WRITE
          ? role === UserRole.MEMBER || isAdmin
          : isAdmin;

    this.logger.debug(
      `Checking permission for method ${method}, required level: ${requiredLevel}`,
    );

    return allowed;
  }

  constructor(
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
    private readonly pageRepo: PageRepo,
    private readonly taskService: TaskService,
    private readonly projectService: ProjectService,
    private readonly commentRepo: CommentRepo,
    private readonly attachmentRepo: AttachmentRepo,
    private readonly researchService: ResearchJobService,
    private readonly workspaceRepo: WorkspaceRepo,
  ) {}

  private readonly readOperations = new Set(['get', 'list', 'info']);

  private async checkCaslPermission(
    request: MCPRequest,
    user: User,
    workspaceId?: string,
  ): Promise<boolean | null> {
    const [resource, operation] = (request.method || '').split('.');
    if (!resource || !operation) {
      return null;
    }

    const action = this.readOperations.has(operation.toLowerCase())
      ? SpaceCaslAction.Read
      : SpaceCaslAction.Manage;

    if (resource === 'space') {
      return this.checkSpaceResourcePermission(
        operation,
        request.params,
        user,
        workspaceId,
      );
    }

    if (['workspace', 'group'].includes(resource)) {
      return this.checkWorkspaceResourcePermission(
        resource,
        operation,
        request.params,
        user,
        workspaceId,
      );
    }

    const spaceId = await this.resolveSpaceId(
      resource,
      request.params || {},
      workspaceId,
    );
    if (!spaceId) {
      return null;
    }

    const ability = await this.spaceAbility.createForUser(user, spaceId);
    return ability.cannot(action, SpaceCaslSubject.Page) ? false : true;
  }

  private async checkWorkspaceResourcePermission(
    resource: string,
    operation: string,
    params: Record<string, any>,
    user: User,
    workspaceId?: string,
  ): Promise<boolean | null> {
    const resolvedWorkspaceId = params?.workspaceId || workspaceId;
    if (!resolvedWorkspaceId) {
      return null;
    }

    const workspace = await this.workspaceRepo.findById(resolvedWorkspaceId);
    if (!workspace) {
      return null;
    }

    const ability = this.workspaceAbility.createForUser(user, workspace);
    const isRead = this.readOperations.has(operation.toLowerCase());
    const workspaceAction = isRead
      ? WorkspaceCaslAction.Read
      : WorkspaceCaslAction.Manage;

    const subject =
      resource === 'group'
        ? WorkspaceCaslSubject.Group
        : WorkspaceCaslSubject.Settings;

    return ability.cannot(workspaceAction, subject) ? false : true;
  }

  private async checkSpaceResourcePermission(
    operation: string,
    params: Record<string, any>,
    user: User,
    workspaceId?: string,
  ): Promise<boolean | null> {
    const normalizedOp = operation.toLowerCase();
    if (normalizedOp === 'list' || normalizedOp === 'create') {
      const resolvedWorkspaceId = params?.workspaceId || workspaceId;
      if (!resolvedWorkspaceId) {
        return null;
      }
      const workspace = await this.workspaceRepo.findById(resolvedWorkspaceId);
      if (!workspace) {
        return null;
      }
      const ability = this.workspaceAbility.createForUser(user, workspace);
      const action = normalizedOp === 'list'
        ? WorkspaceCaslAction.Read
        : WorkspaceCaslAction.Manage;
      return ability.cannot(action, WorkspaceCaslSubject.Space) ? false : true;
    }

    const spaceId = params?.spaceId || (await this.resolveSpaceId('space', params));
    if (!spaceId) {
      return null;
    }

    const ability = await this.spaceAbility.createForUser(user, spaceId);
    const isRead = this.readOperations.has(normalizedOp);
    const action = isRead ? SpaceCaslAction.Read : SpaceCaslAction.Manage;
    const subject =
      normalizedOp.includes('member') || normalizedOp.includes('role')
        ? SpaceCaslSubject.Member
        : SpaceCaslSubject.Settings;

    return ability.cannot(action, subject) ? false : true;
  }

  private async resolveSpaceId(
    resource: string,
    params: Record<string, any>,
    workspaceId?: string,
  ): Promise<string | null> {
    if (params?.spaceId) {
      return params.spaceId;
    }

    if (resource === 'page' && params?.pageId) {
      const page = await this.pageRepo.findById(params.pageId);
      return page?.spaceId || null;
    }

    if (resource === 'task') {
      if (params?.taskId) {
        const task = await this.taskService.findById(params.taskId);
        return task?.spaceId || null;
      }
      if (params?.projectId) {
        const project = await this.projectService.findById(params.projectId);
        return project?.spaceId || null;
      }
    }

    if (resource === 'project' && params?.projectId) {
      const project = await this.projectService.findById(params.projectId);
      return project?.spaceId || null;
    }

    if (resource === 'comment') {
      if (params?.commentId) {
        const comment = await this.commentRepo.findById(params.commentId);
        if (comment?.pageId) {
          const page = await this.pageRepo.findById(comment.pageId);
          return page?.spaceId || null;
        }
      }
      if (params?.pageId) {
        const page = await this.pageRepo.findById(params.pageId);
        return page?.spaceId || null;
      }
    }

    if (resource === 'attachment') {
      if (params?.attachmentId) {
        const attachment = await this.attachmentRepo.findById(
          params.attachmentId,
        );
        if (attachment?.spaceId) {
          return attachment.spaceId;
        }
        if (attachment?.pageId) {
          const page = await this.pageRepo.findById(attachment.pageId);
          return page?.spaceId || null;
        }
      }
      if (params?.pageId) {
        const page = await this.pageRepo.findById(params.pageId);
        return page?.spaceId || null;
      }
    }

    if (resource === 'research' && params?.jobId) {
      const resolvedWorkspaceId = params?.workspaceId || workspaceId;
      if (!resolvedWorkspaceId) {
        return null;
      }
      const job = await this.researchService.getJob(
        params.jobId,
        resolvedWorkspaceId,
      );
      return job?.spaceId || null;
    }

    return null;
  }
}
