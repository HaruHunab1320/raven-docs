import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { SpaceService } from './space.service';
import { SpaceMemberService } from './space-member.service';
import { SpaceRepo } from '../../../database/repos/space/space.repo';
import { SpaceRole } from '../../../common/helpers/types/permission';
import { QueueName, QueueJob } from '../../../integrations/queue/constants';
import { autoMocker } from '../../../common/testing/auto-mock';

// Run the callback directly instead of opening a real transaction.
jest.mock('@raven-docs/db/utils', () => ({
  ...jest.requireActual('@raven-docs/db/utils'),
  executeTx: jest.fn(async (_db: any, cb: any) => cb({} as any)),
}));

describe('SpaceService', () => {
  let service: SpaceService;

  const mockSpaceRepo = {
    slugExists: jest.fn(),
    insertSpace: jest.fn(),
    findById: jest.fn(),
    updateSpace: jest.fn(),
    deleteSpace: jest.fn(),
    getSpacesInWorkspace: jest.fn(),
  };
  const mockSpaceMemberService = {
    addUserToSpace: jest.fn(),
  };
  const mockAttachmentQueue = {
    add: jest.fn(),
  };

  const workspaceId = 'workspace-1';
  const otherWorkspaceId = 'workspace-2';
  const authUser: any = { id: 'user-1', workspaceId };
  const space: any = { id: 'space-1', name: 'Research', workspaceId };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockSpaceRepo.slugExists.mockResolvedValue(false);
    mockSpaceRepo.insertSpace.mockResolvedValue(space);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SpaceService,
        { provide: SpaceRepo, useValue: mockSpaceRepo },
        { provide: SpaceMemberService, useValue: mockSpaceMemberService },
        {
          provide: getQueueToken(QueueName.ATTACHMENT_QUEUE),
          useValue: mockAttachmentQueue,
        },
      ],
    })
      .useMocker(autoMocker)
      .compile();

    service = module.get<SpaceService>(SpaceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createSpace', () => {
    it('makes the creator a space admin', async () => {
      // Without this the creator would be locked out of the space they just
      // made, and nobody would be able to grant access to it.
      const result = await service.createSpace(authUser, workspaceId, {
        name: 'Research',
        slug: 'research',
      } as any);

      expect(mockSpaceMemberService.addUserToSpace).toHaveBeenCalledWith(
        authUser.id,
        space.id,
        SpaceRole.ADMIN,
        workspaceId,
        expect.anything(),
      );
      expect(result).toMatchObject({ id: 'space-1', memberCount: 1 });
    });

    it('creates the space in the caller-supplied workspace', async () => {
      await service.createSpace(authUser, workspaceId, {
        name: 'Research',
        slug: 'research',
      } as any);

      expect(mockSpaceRepo.insertSpace).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId,
          creatorId: authUser.id,
          slug: 'research',
        }),
        expect.anything(),
      );
    });
  });

  describe('create', () => {
    it('rejects a slug already taken in the same workspace', async () => {
      mockSpaceRepo.slugExists.mockResolvedValue(true);

      await expect(
        service.create(authUser.id, workspaceId, {
          name: 'Research',
          slug: 'research',
        } as any),
      ).rejects.toThrow(BadRequestException);
      expect(mockSpaceRepo.insertSpace).not.toHaveBeenCalled();
    });

    it('checks slug uniqueness per workspace, not globally', async () => {
      // Two workspaces are allowed the same slug — the check must be scoped.
      await service.create(authUser.id, workspaceId, {
        name: 'Research',
        slug: 'research',
      } as any);

      expect(mockSpaceRepo.slugExists).toHaveBeenCalledWith(
        'research',
        workspaceId,
        undefined,
      );
    });

    it('defaults name and description when omitted', async () => {
      await service.create(authUser.id, workspaceId, {
        slug: 'research',
      } as any);

      expect(mockSpaceRepo.insertSpace).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'untitled space', description: '' }),
        undefined,
      );
    });
  });

  describe('getSpaceInfo', () => {
    it('returns the space when it belongs to the workspace', async () => {
      mockSpaceRepo.findById.mockResolvedValue(space);

      await expect(service.getSpaceInfo('space-1', workspaceId)).resolves.toBe(
        space,
      );
      expect(mockSpaceRepo.findById).toHaveBeenCalledWith(
        'space-1',
        workspaceId,
        { includeMemberCount: true },
      );
    });

    it('hides a space belonging to another workspace behind a 404', async () => {
      // The repo scopes by workspace, so a cross-workspace id comes back
      // empty and must surface as not-found rather than leaking existence.
      mockSpaceRepo.findById.mockResolvedValue(null);

      await expect(
        service.getSpaceInfo('space-1', otherWorkspaceId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteSpace', () => {
    it('deletes the space and queues its attachments for cleanup', async () => {
      mockSpaceRepo.findById.mockResolvedValue(space);

      await service.deleteSpace('space-1', workspaceId);

      expect(mockSpaceRepo.deleteSpace).toHaveBeenCalledWith(
        'space-1',
        workspaceId,
      );
      expect(mockAttachmentQueue.add).toHaveBeenCalledWith(
        QueueJob.DELETE_SPACE_ATTACHMENTS,
        space,
      );
    });

    it('refuses to delete a space from another workspace', async () => {
      mockSpaceRepo.findById.mockResolvedValue(null);

      await expect(
        service.deleteSpace('space-1', otherWorkspaceId),
      ).rejects.toThrow(NotFoundException);
      expect(mockSpaceRepo.deleteSpace).not.toHaveBeenCalled();
      expect(mockAttachmentQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('getWorkspaceSpaces', () => {
    it('maps repo pagination into page metadata', async () => {
      mockSpaceRepo.getSpacesInWorkspace.mockResolvedValue({
        data: [space],
        pagination: { limit: 10, page: 2, totalPages: 3 },
      });

      const result = await service.getWorkspaceSpaces(workspaceId, {
        page: 2,
        limit: 10,
      } as any);

      expect(result.items).toEqual([space]);
      expect(result.meta).toEqual({
        limit: 10,
        page: 2,
        hasNextPage: true,
        hasPrevPage: true,
      });
    });

    it('reports no next page on the last page', async () => {
      mockSpaceRepo.getSpacesInWorkspace.mockResolvedValue({
        data: [],
        pagination: { limit: 10, page: 3, totalPages: 3 },
      });

      const result = await service.getWorkspaceSpaces(workspaceId, {
        page: 3,
        limit: 10,
      } as any);

      expect(result.meta.hasNextPage).toBe(false);
      expect(result.meta.hasPrevPage).toBe(true);
    });

    it('reports no previous page on the first page', async () => {
      mockSpaceRepo.getSpacesInWorkspace.mockResolvedValue({
        data: [space],
        pagination: { limit: 10, page: 1, totalPages: 3 },
      });

      const result = await service.getWorkspaceSpaces(workspaceId, {
        page: 1,
        limit: 10,
      } as any);

      expect(result.meta.hasPrevPage).toBe(false);
      expect(result.meta.hasNextPage).toBe(true);
    });
  });
});
