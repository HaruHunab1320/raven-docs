import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { CreateWorkspaceDto } from '../dto/create-workspace.dto';
import { UpdateWorkspaceDto } from '../dto/update-workspace.dto';
import { SpaceService } from '../../space/services/space.service';
import { CreateSpaceDto } from '../../space/dto/create-space.dto';
import { SpaceRole, UserRole } from '../../../common/helpers/types/permission';
import { SpaceMemberService } from '../../space/services/space-member.service';
import { WorkspaceRepo } from '@raven-docs/db/repos/workspace/workspace.repo';
import { KyselyDB, KyselyTransaction } from '@raven-docs/db/types/kysely.types';
import { executeTx } from '@raven-docs/db/utils';
import { InjectKysely } from 'nestjs-kysely';
import { User } from '@raven-docs/db/types/entity.types';
import { GroupUserRepo } from '@raven-docs/db/repos/group/group-user.repo';
import { GroupRepo } from '@raven-docs/db/repos/group/group.repo';
import { PaginationOptions } from '@raven-docs/db/pagination/pagination-options';
import { PaginationResult } from '@raven-docs/db/pagination/pagination';
import { UpdateWorkspaceUserRoleDto } from '../dto/update-workspace-user-role.dto';
import { UserRepo } from '@raven-docs/db/repos/user/user.repo';
import { DomainService } from '../../../integrations/environment/domain.service';
import { DISALLOWED_HOSTNAMES, WorkspaceStatus } from '../workspace.constants';
import { v4 } from 'uuid';
import { AgentSettingsDto } from '../dto/agent-settings.dto';
import { WorkspaceIntegrationSettingsDto } from '../dto/workspace-integration-settings.dto';
import { resolveAgentSettings } from '../../agent/agent-settings';
import { QueueJob, QueueName } from '../../../integrations/queue/constants';

@Injectable()
export class WorkspaceService {
  private readonly logger = new Logger(WorkspaceService.name);

  constructor(
    private workspaceRepo: WorkspaceRepo,
    private spaceService: SpaceService,
    private spaceMemberService: SpaceMemberService,
    private groupRepo: GroupRepo,
    private groupUserRepo: GroupUserRepo,
    private userRepo: UserRepo,
    private domainService: DomainService,
    @InjectKysely() private readonly db: KyselyDB,
    @InjectQueue(QueueName.ATTACHMENT_QUEUE) private attachmentQueue: Queue,
  ) {}

  async findById(workspaceId: string) {
    return this.workspaceRepo.findById(workspaceId);
  }

  async getWorkspaceInfo(workspaceId: string) {
    const workspace = await this.workspaceRepo.findById(workspaceId);
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    return workspace;
  }

  async getAgentSettings(workspaceId: string) {
    const workspace = await this.workspaceRepo.findById(workspaceId);
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }
    return resolveAgentSettings(workspace.settings);
  }

  async getIntegrationSettings(workspaceId: string) {
    const workspace = await this.workspaceRepo.findById(workspaceId);
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }
    const integrations = (workspace.settings as any)?.integrations;
    return this.buildIntegrationResponse(integrations);
  }

  async getWorkspacePublicData(workspaceId: string) {
    const workspace = await this.db
      .selectFrom('workspaces')
      .select(['id', 'name', 'logo', 'hostname'])
      .where('id', '=', workspaceId)
      .executeTakeFirst();

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    return workspace;
  }

  async create(
    user: User,
    createWorkspaceDto: CreateWorkspaceDto,
    trx?: KyselyTransaction,
  ) {
    const createdWorkspace = await executeTx(
      this.db,
      async (trx) => {
        const hostname = createWorkspaceDto.hostname || undefined;

        // create workspace
        const workspace = await this.workspaceRepo.insertWorkspace(
          {
            name: createWorkspaceDto.name,
            description: createWorkspaceDto.description,
            hostname,
            status: WorkspaceStatus.Active,
          },
          trx,
        );

        // create default group
        const group = await this.groupRepo.createDefaultGroup(workspace.id, {
          userId: user.id,
          trx: trx,
        });

        // add user to workspace
        await trx
          .updateTable('users')
          .set({
            workspaceId: workspace.id,
            role: UserRole.OWNER,
          })
          .where('users.id', '=', user.id)
          .execute();

        // add user to default group created above
        await this.groupUserRepo.insertGroupUser(
          {
            userId: user.id,
            groupId: group.id,
          },
          trx,
        );

        // create default space
        const spaceInfo: CreateSpaceDto = {
          name: 'General',
          slug: 'general',
        };

        const createdSpace = await this.spaceService.create(
          user.id,
          workspace.id,
          spaceInfo,
          trx,
        );

        // and add user to space as owner
        await this.spaceMemberService.addUserToSpace(
          user.id,
          createdSpace.id,
          SpaceRole.ADMIN,
          workspace.id,
          trx,
        );

        // add default group to space as writer
        await this.spaceMemberService.addGroupToSpace(
          group.id,
          createdSpace.id,
          SpaceRole.WRITER,
          workspace.id,
          trx,
        );

        // update default spaceId
        workspace.defaultSpaceId = createdSpace.id;
        await this.workspaceRepo.updateWorkspace(
          {
            defaultSpaceId: createdSpace.id,
          },
          workspace.id,
          trx,
        );

        return workspace;
      },
      trx,
    );

    return createdWorkspace;
  }

  async addUserToWorkspace(
    userId: string,
    workspaceId: string,
    assignedRole?: UserRole,
    trx?: KyselyTransaction,
  ): Promise<void> {
    return await executeTx(
      this.db,
      async (trx) => {
        const workspace = await trx
          .selectFrom('workspaces')
          .select(['id', 'defaultRole'])
          .where('workspaces.id', '=', workspaceId)
          .executeTakeFirst();

        if (!workspace) {
          throw new BadRequestException('Workspace not found');
        }

        await trx
          .updateTable('users')
          .set({
            role: assignedRole ?? workspace.defaultRole,
            workspaceId: workspace.id,
          })
          .where('id', '=', userId)
          .execute();
      },
      trx,
    );
  }

  async update(workspaceId: string, updateWorkspaceDto: UpdateWorkspaceDto) {
    if (updateWorkspaceDto.emailDomains) {
      const regex =
        /(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]/;

      const emailDomains = updateWorkspaceDto.emailDomains || [];

      updateWorkspaceDto.emailDomains = emailDomains
        .map((domain) => regex.exec(domain)?.[0])
        .filter(Boolean);
    }

    if (updateWorkspaceDto.hostname) {
      const hostname = updateWorkspaceDto.hostname;
      if (DISALLOWED_HOSTNAMES.includes(hostname)) {
        throw new BadRequestException('Hostname already exists.');
      }
      if (await this.workspaceRepo.hostnameExists(hostname)) {
        throw new BadRequestException('Hostname already exists.');
      }
    }

    await this.workspaceRepo.updateWorkspace(updateWorkspaceDto, workspaceId);

    return this.workspaceRepo.findById(workspaceId, {
      withMemberCount: true,
    });
  }

  async updateAgentSettings(
    workspaceId: string,
    agentSettingsDto: AgentSettingsDto,
  ) {
    const updated = await this.workspaceRepo.updateAgentSettings(
      workspaceId,
      agentSettingsDto,
    );
    return resolveAgentSettings(updated.settings);
  }

  async updateIntegrationSettings(
    workspaceId: string,
    integrationSettingsDto: WorkspaceIntegrationSettingsDto,
  ) {
    const updated = await this.workspaceRepo.updateIntegrationSettings(
      workspaceId,
      integrationSettingsDto,
    );
    const integrations = (updated.settings as any)?.integrations;
    return this.buildIntegrationResponse(integrations);
  }

  private buildIntegrationResponse(integrations: any) {
    const repoTokens = integrations?.repoTokens || {};
    const slack = integrations?.slack || {};
    const discord = integrations?.discord || {};
    return {
      repoTokens: {
        githubToken: Boolean(repoTokens.githubToken),
        gitlabToken: Boolean(repoTokens.gitlabToken),
        bitbucketToken: Boolean(repoTokens.bitbucketToken),
      },
      slack: {
        enabled: slack.enabled === true,
        configured: Boolean(slack.botToken && slack.signingSecret && slack.teamId),
        teamId: slack.teamId || null,
        defaultChannelId: slack.defaultChannelId || null,
        defaultUserId: slack.defaultUserId || null,
      },
      discord: {
        enabled: discord.enabled === true,
        configured: Boolean(
          discord.botToken && discord.publicKey && discord.applicationId,
        ),
        guildId: discord.guildId || null,
        defaultChannelId: discord.defaultChannelId || null,
        defaultUserId: discord.defaultUserId || null,
      },
    };
  }

  async getWorkspaceUsers(
    workspaceId: string,
    pagination: PaginationOptions,
  ): Promise<PaginationResult<User>> {
    const users = await this.userRepo.getUsersPaginated(
      workspaceId,
      pagination,
    );

    return users;
  }

  async updateWorkspaceUserRole(
    authUser: User,
    userRoleDto: UpdateWorkspaceUserRoleDto,
    workspaceId: string,
  ) {
    const user = await this.userRepo.findById(userRoleDto.userId, workspaceId);

    const newRole = userRoleDto.role.toLowerCase();

    if (!user) {
      throw new BadRequestException('Workspace member not found');
    }

    // prevent ADMIN from managing OWNER role
    if (
      (authUser.role === UserRole.ADMIN && newRole === UserRole.OWNER) ||
      (authUser.role === UserRole.ADMIN && user.role === UserRole.OWNER)
    ) {
      throw new ForbiddenException();
    }

    if (user.role === newRole) {
      return user;
    }

    const workspaceOwnerCount = await this.userRepo.roleCountByWorkspaceId(
      UserRole.OWNER,
      workspaceId,
    );

    if (user.role === UserRole.OWNER && workspaceOwnerCount === 1) {
      throw new BadRequestException(
        'There must be at least one workspace owner',
      );
    }

    await this.userRepo.updateUser(
      {
        role: newRole,
      },
      user.id,
      workspaceId,
    );
  }

  async generateHostname(
    name: string,
    trx?: KyselyTransaction,
  ): Promise<string> {
    const generateRandomSuffix = (length: number) =>
      Math.random()
        .toFixed(length)
        .substring(2, 2 + length);

    let subdomain = name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .substring(0, 20);
    // Ensure we leave room for a random suffix.
    const maxSuffixLength = 3;

    if (subdomain.length < 4) {
      subdomain = `${subdomain}-${generateRandomSuffix(maxSuffixLength)}`;
    }

    if (DISALLOWED_HOSTNAMES.includes(subdomain)) {
      subdomain = `myworkspace-${generateRandomSuffix(maxSuffixLength)}`;
    }

    let uniqueHostname = subdomain;

    while (true) {
      const exists = await this.workspaceRepo.hostnameExists(
        uniqueHostname,
        trx,
      );
      if (!exists) {
        break;
      }
      // Append a random suffix and retry.
      const randomSuffix = generateRandomSuffix(maxSuffixLength);
      uniqueHostname = `${subdomain}-${randomSuffix}`.substring(0, 25);
    }

    return uniqueHostname;
  }

  async checkHostname(hostname: string) {
    const exists = await this.workspaceRepo.hostnameExists(hostname);
    if (!exists) {
      throw new NotFoundException('Hostname not found');
    }
    return { hostname: this.domainService.getUrl(hostname) };
  }

  async deleteUser(
    authUser: User,
    userId: string,
    workspaceId: string,
  ): Promise<void> {
    const user = await this.userRepo.findById(userId, workspaceId);

    if (!user || user.deletedAt) {
      throw new BadRequestException('Workspace member not found');
    }

    const workspaceOwnerCount = await this.userRepo.roleCountByWorkspaceId(
      UserRole.OWNER,
      workspaceId,
    );

    if (user.role === UserRole.OWNER && workspaceOwnerCount === 1) {
      throw new BadRequestException(
        'There must be at least one workspace owner',
      );
    }

    if (authUser.id === userId) {
      throw new BadRequestException('You cannot delete yourself');
    }

    if (authUser.role === UserRole.ADMIN && user.role === UserRole.OWNER) {
      throw new BadRequestException('You cannot delete a user with owner role');
    }

    await executeTx(this.db, async (trx) => {
      await this.userRepo.updateUser(
        {
          name: 'Deleted user',
          email: v4() + '@deleted.raven-docs.local',
          avatarUrl: null,
          settings: null,
          deletedAt: new Date(),
        },
        userId,
        workspaceId,
        trx,
      );

      await trx.deleteFrom('groupUsers').where('userId', '=', userId).execute();
      await trx
        .deleteFrom('spaceMembers')
        .where('userId', '=', userId)
        .execute();
      await trx
        .deleteFrom('authAccounts')
        .where('userId', '=', userId)
        .execute();
    });

    try {
      await this.attachmentQueue.add(QueueJob.DELETE_USER_AVATARS, user);
    } catch (err) {
      // empty
    }
  }

  async deleteWorkspace(workspaceId: string): Promise<void> {
    const workspace = await this.workspaceRepo.findById(workspaceId);

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    // First get all spaces to delete their attachments
    const spaces = await this.db
      .selectFrom('spaces')
      .select(['id'])
      .where('workspaceId', '=', workspaceId)
      .execute();

    // Delete all workspace data in a transaction
    await executeTx(this.db, async (trx) => {
      // Delete the workspace and rely on cascade deletes configured in the database
      await trx
        .deleteFrom('workspaces')
        .where('id', '=', workspaceId)
        .execute();
    });

    // Queue tasks to clean up attachments for each space
    try {
      // For each space, queue a delete attachments task
      for (const space of spaces) {
        await this.attachmentQueue.add(
          QueueJob.DELETE_SPACE_ATTACHMENTS,
          space,
        );
      }

      // Queue task to delete user avatars
      const usersData = { workspaceId };
      await this.attachmentQueue.add(QueueJob.DELETE_USER_AVATARS, usersData);
    } catch (err) {
      this.logger.error(
        `Failed to queue attachment cleanup for workspace ${workspaceId}`,
        err,
      );
    }
  }
}
