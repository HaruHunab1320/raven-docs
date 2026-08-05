import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { GroupService } from './group.service';
import { GroupUserService } from './group-user.service';
import { GroupRepo } from '../../../database/repos/group/group.repo';
import { DefaultGroup } from '../dto/create-group.dto';
import { autoMocker } from '../../../common/testing/auto-mock';

describe('GroupService', () => {
  let service: GroupService;

  const mockGroupRepo = {
    findById: jest.fn(),
    findByName: jest.fn(),
    insertGroup: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    getGroupsPaginated: jest.fn(),
  };
  const mockGroupUserService = {
    addUsersToGroupBatch: jest.fn(),
  };

  const workspaceId = 'workspace-1';
  const otherWorkspaceId = 'workspace-2';
  const authUser: any = { id: 'user-1', workspaceId };
  const group: any = {
    id: 'group-1',
    name: 'Researchers',
    isDefault: false,
    workspaceId,
  };
  const defaultGroup: any = { ...group, id: 'group-0', name: 'Everyone', isDefault: true };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockGroupRepo.findByName.mockResolvedValue(null);
    mockGroupRepo.insertGroup.mockResolvedValue(group);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GroupService,
        { provide: GroupRepo, useValue: mockGroupRepo },
        { provide: GroupUserService, useValue: mockGroupUserService },
      ],
    })
      .useMocker(autoMocker)
      .compile();

    service = module.get<GroupService>(GroupService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createGroup', () => {
    it('creates a non-default group owned by the workspace', async () => {
      await service.createGroup(authUser, workspaceId, {
        name: 'Researchers',
      } as any);

      expect(mockGroupRepo.insertGroup).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Researchers',
          workspaceId,
          creatorId: authUser.id,
          isDefault: false,
        }),
        undefined,
      );
    });

    it('rejects a duplicate name within the workspace', async () => {
      mockGroupRepo.findByName.mockResolvedValue(group);

      await expect(
        service.createGroup(authUser, workspaceId, {
          name: 'Researchers',
        } as any),
      ).rejects.toThrow(BadRequestException);
      expect(mockGroupRepo.insertGroup).not.toHaveBeenCalled();
    });

    it('scopes the duplicate-name check to the workspace', async () => {
      await service.createGroup(authUser, workspaceId, {
        name: 'Researchers',
      } as any);

      expect(mockGroupRepo.findByName).toHaveBeenCalledWith(
        'Researchers',
        workspaceId,
      );
    });

    it('adds the supplied members to the new group', async () => {
      await service.createGroup(authUser, workspaceId, {
        name: 'Researchers',
        userIds: ['user-2', 'user-3'],
      } as any);

      expect(mockGroupUserService.addUsersToGroupBatch).toHaveBeenCalledWith(
        ['user-2', 'user-3'],
        group.id,
        workspaceId,
      );
    });

    it('skips the member batch when no members are supplied', async () => {
      await service.createGroup(authUser, workspaceId, {
        name: 'Researchers',
        userIds: [],
      } as any);

      expect(mockGroupUserService.addUsersToGroupBatch).not.toHaveBeenCalled();
    });
  });

  describe('createDefaultGroup', () => {
    it('creates the everyone group flagged as default', async () => {
      await service.createDefaultGroup(workspaceId, authUser.id);

      expect(mockGroupRepo.insertGroup).toHaveBeenCalledWith(
        expect.objectContaining({
          name: DefaultGroup.EVERYONE,
          isDefault: true,
          workspaceId,
          creatorId: authUser.id,
        }),
        undefined,
      );
    });

    it('tolerates having no creator (workspace bootstrap)', async () => {
      await service.createDefaultGroup(workspaceId);

      expect(mockGroupRepo.insertGroup).toHaveBeenCalledWith(
        expect.objectContaining({ creatorId: null }),
        undefined,
      );
    });
  });

  describe('updateGroup', () => {
    it('refuses to modify the default group', async () => {
      // The default group is what grants baseline workspace access; letting
      // it be renamed or repurposed would quietly change who can see what.
      mockGroupRepo.findById.mockResolvedValue(defaultGroup);

      await expect(
        service.updateGroup(workspaceId, {
          groupId: defaultGroup.id,
          name: 'Renamed',
        } as any),
      ).rejects.toThrow(BadRequestException);
      expect(mockGroupRepo.update).not.toHaveBeenCalled();
    });

    it('rejects renaming onto an existing group name', async () => {
      mockGroupRepo.findById.mockResolvedValue(group);
      mockGroupRepo.findByName.mockResolvedValue({
        ...group,
        id: 'group-9',
        name: 'Taken',
      });

      await expect(
        service.updateGroup(workspaceId, {
          groupId: group.id,
          name: 'Taken',
        } as any),
      ).rejects.toThrow(BadRequestException);
      expect(mockGroupRepo.update).not.toHaveBeenCalled();
    });

    it('updates a group scoped to its workspace', async () => {
      mockGroupRepo.findById.mockResolvedValue({ ...group });

      await service.updateGroup(workspaceId, {
        groupId: group.id,
        name: 'Renamed',
        description: 'new description',
      } as any);

      expect(mockGroupRepo.update).toHaveBeenCalledWith(
        { name: 'Renamed', description: 'new description' },
        group.id,
        workspaceId,
      );
    });

    it('404s for a group in another workspace', async () => {
      mockGroupRepo.findById.mockResolvedValue(null);

      await expect(
        service.updateGroup(otherWorkspaceId, {
          groupId: group.id,
          name: 'Renamed',
        } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteGroup', () => {
    it('refuses to delete the default group', async () => {
      mockGroupRepo.findById.mockResolvedValue(defaultGroup);

      await expect(
        service.deleteGroup(defaultGroup.id, workspaceId),
      ).rejects.toThrow(BadRequestException);
      expect(mockGroupRepo.delete).not.toHaveBeenCalled();
    });

    it('deletes a normal group', async () => {
      mockGroupRepo.findById.mockResolvedValue(group);

      await service.deleteGroup(group.id, workspaceId);

      expect(mockGroupRepo.delete).toHaveBeenCalledWith(group.id, workspaceId);
    });

    it('refuses to delete a group from another workspace', async () => {
      mockGroupRepo.findById.mockResolvedValue(null);

      await expect(
        service.deleteGroup(group.id, otherWorkspaceId),
      ).rejects.toThrow(NotFoundException);
      expect(mockGroupRepo.delete).not.toHaveBeenCalled();
    });
  });

  describe('findAndValidateGroup', () => {
    it('returns a group in the workspace', async () => {
      mockGroupRepo.findById.mockResolvedValue(group);

      await expect(
        service.findAndValidateGroup(group.id, workspaceId),
      ).resolves.toBe(group);
    });

    it('404s rather than revealing a group from another workspace', async () => {
      mockGroupRepo.findById.mockResolvedValue(null);

      await expect(
        service.findAndValidateGroup(group.id, otherWorkspaceId),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
