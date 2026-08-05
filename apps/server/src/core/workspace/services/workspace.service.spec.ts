import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { WorkspaceService } from './workspace.service';
import { WorkspaceRepo } from '../../../database/repos/workspace/workspace.repo';
import { UserRepo } from '../../../database/repos/user/user.repo';
import { UserRole } from '../../../common/helpers/types/permission';
import { QueueName, QueueJob } from '../../../integrations/queue/constants';
import { autoMocker } from '../../../common/testing/auto-mock';

// Run transaction callbacks inline against a stub trx that records deletes.
const trxDeletes: string[] = [];
jest.mock('@raven-docs/db/utils', () => ({
  ...jest.requireActual('@raven-docs/db/utils'),
  executeTx: jest.fn(async (_db: any, cb: any) => {
    const trx: any = {
      deleteFrom: (table: string) => {
        trxDeletes.push(table);
        return trx;
      },
      where: () => trx,
      execute: async () => undefined,
    };
    return cb(trx);
  }),
}));

describe('WorkspaceService', () => {
  let service: WorkspaceService;

  const mockWorkspaceRepo = {
    findById: jest.fn(),
    updateWorkspace: jest.fn(),
  };
  const mockUserRepo = {
    findById: jest.fn(),
    updateUser: jest.fn(),
    roleCountByWorkspaceId: jest.fn(),
  };
  const mockAttachmentQueue = { add: jest.fn() };

  const workspaceId = 'workspace-1';
  const owner: any = { id: 'user-owner', role: UserRole.OWNER, workspaceId };
  const admin: any = { id: 'user-admin', role: UserRole.ADMIN, workspaceId };
  const member: any = {
    id: 'user-member',
    role: UserRole.MEMBER,
    workspaceId,
    deletedAt: null,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    trxDeletes.length = 0;
    mockUserRepo.roleCountByWorkspaceId.mockResolvedValue(2);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkspaceService,
        { provide: WorkspaceRepo, useValue: mockWorkspaceRepo },
        { provide: UserRepo, useValue: mockUserRepo },
        {
          provide: getQueueToken(QueueName.ATTACHMENT_QUEUE),
          useValue: mockAttachmentQueue,
        },
      ],
    })
      .useMocker(autoMocker)
      .compile();

    service = module.get<WorkspaceService>(WorkspaceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('updateWorkspaceUserRole', () => {
    it('lets an owner promote a member', async () => {
      mockUserRepo.findById.mockResolvedValue({ ...member });

      await service.updateWorkspaceUserRole(
        owner,
        { userId: member.id, role: UserRole.ADMIN } as any,
        workspaceId,
      );

      expect(mockUserRepo.updateUser).toHaveBeenCalledWith(
        { role: UserRole.ADMIN },
        member.id,
        workspaceId,
      );
    });

    it('stops an admin from promoting anyone to owner', async () => {
      // Otherwise an admin could escalate themselves or an ally to the one
      // role that can remove them.
      mockUserRepo.findById.mockResolvedValue({ ...member });

      await expect(
        service.updateWorkspaceUserRole(
          admin,
          { userId: member.id, role: UserRole.OWNER } as any,
          workspaceId,
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(mockUserRepo.updateUser).not.toHaveBeenCalled();
    });

    it('stops an admin from demoting an owner', async () => {
      mockUserRepo.findById.mockResolvedValue({ ...member, role: UserRole.OWNER });

      await expect(
        service.updateWorkspaceUserRole(
          admin,
          { userId: 'user-owner-2', role: UserRole.MEMBER } as any,
          workspaceId,
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(mockUserRepo.updateUser).not.toHaveBeenCalled();
    });

    it('refuses to demote the last remaining owner', async () => {
      // Losing the final owner would leave the workspace unadministrable.
      mockUserRepo.findById.mockResolvedValue({ ...member, role: UserRole.OWNER });
      mockUserRepo.roleCountByWorkspaceId.mockResolvedValue(1);

      await expect(
        service.updateWorkspaceUserRole(
          owner,
          { userId: 'user-owner-2', role: UserRole.MEMBER } as any,
          workspaceId,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(mockUserRepo.updateUser).not.toHaveBeenCalled();
    });

    it('allows demoting an owner while another remains', async () => {
      mockUserRepo.findById.mockResolvedValue({ ...member, role: UserRole.OWNER });
      mockUserRepo.roleCountByWorkspaceId.mockResolvedValue(2);

      await service.updateWorkspaceUserRole(
        owner,
        { userId: 'user-owner-2', role: UserRole.MEMBER } as any,
        workspaceId,
      );

      expect(mockUserRepo.updateUser).toHaveBeenCalled();
    });

    it('normalises the incoming role to lower case', async () => {
      mockUserRepo.findById.mockResolvedValue({ ...member });

      await service.updateWorkspaceUserRole(
        owner,
        { userId: member.id, role: 'ADMIN' } as any,
        workspaceId,
      );

      expect(mockUserRepo.updateUser).toHaveBeenCalledWith(
        { role: UserRole.ADMIN },
        member.id,
        workspaceId,
      );
    });

    it('is a no-op when the role is unchanged', async () => {
      mockUserRepo.findById.mockResolvedValue({ ...member });

      await service.updateWorkspaceUserRole(
        owner,
        { userId: member.id, role: UserRole.MEMBER } as any,
        workspaceId,
      );

      expect(mockUserRepo.updateUser).not.toHaveBeenCalled();
    });

    it('rejects a user who is not in this workspace', async () => {
      mockUserRepo.findById.mockResolvedValue(null);

      await expect(
        service.updateWorkspaceUserRole(
          owner,
          { userId: 'outsider', role: UserRole.ADMIN } as any,
          workspaceId,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('deleteUser', () => {
    it('scrubs identifying fields and revokes every membership', async () => {
      mockUserRepo.findById.mockResolvedValue({ ...member });

      await service.deleteUser(owner, member.id, workspaceId);

      const [patch] = mockUserRepo.updateUser.mock.calls[0];
      expect(patch.name).toBe('Deleted user');
      expect(patch.avatarUrl).toBeNull();
      expect(patch.settings).toBeNull();
      expect(patch.deletedAt).toBeInstanceOf(Date);
      // Email is replaced with a unique tombstone so the address can be
      // reused and no longer identifies the person.
      expect(patch.email).toMatch(/@deleted\.raven-docs\.local$/);
      expect(patch.email).not.toBe(member.email);
      // Group and space membership must go, or a deleted user keeps access.
      expect(trxDeletes).toEqual(
        expect.arrayContaining(['groupUsers', 'spaceMembers']),
      );
    });

    it('refuses to delete yourself', async () => {
      mockUserRepo.findById.mockResolvedValue({ ...owner, deletedAt: null });

      await expect(
        service.deleteUser(owner, owner.id, workspaceId),
      ).rejects.toThrow(BadRequestException);
      expect(mockUserRepo.updateUser).not.toHaveBeenCalled();
    });

    it('stops an admin from deleting an owner', async () => {
      mockUserRepo.findById.mockResolvedValue({
        ...member,
        role: UserRole.OWNER,
      });

      await expect(
        service.deleteUser(admin, 'user-owner-2', workspaceId),
      ).rejects.toThrow(BadRequestException);
      expect(mockUserRepo.updateUser).not.toHaveBeenCalled();
    });

    it('refuses to delete the last remaining owner', async () => {
      mockUserRepo.findById.mockResolvedValue({
        ...member,
        role: UserRole.OWNER,
      });
      mockUserRepo.roleCountByWorkspaceId.mockResolvedValue(1);

      await expect(
        service.deleteUser(owner, 'user-owner-2', workspaceId),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an already-deleted user', async () => {
      mockUserRepo.findById.mockResolvedValue({
        ...member,
        deletedAt: new Date(),
      });

      await expect(
        service.deleteUser(owner, member.id, workspaceId),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a user from another workspace', async () => {
      mockUserRepo.findById.mockResolvedValue(null);

      await expect(
        service.deleteUser(owner, 'outsider', workspaceId),
      ).rejects.toThrow(BadRequestException);
    });

    it('queues avatar cleanup but does not fail the delete if queueing does', async () => {
      mockUserRepo.findById.mockResolvedValue({ ...member });
      mockAttachmentQueue.add.mockRejectedValue(new Error('queue down'));

      await expect(
        service.deleteUser(owner, member.id, workspaceId),
      ).resolves.toBeUndefined();
      expect(mockAttachmentQueue.add).toHaveBeenCalledWith(
        QueueJob.DELETE_USER_AVATARS,
        expect.objectContaining({ id: member.id }),
      );
    });
  });
});
