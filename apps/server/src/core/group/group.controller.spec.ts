import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { GroupController } from './group.controller';
import { GroupService } from './services/group.service';
import { GroupUserService } from './services/group-user.service';
import WorkspaceAbilityFactory from '../casl/abilities/workspace-ability.factory';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../casl/interfaces/workspace-ability.type';
import { autoMocker } from '../../common/testing/auto-mock';

describe('GroupController', () => {
  let controller: GroupController;

  const mockGroupService = {
    getWorkspaceGroups: jest.fn(),
    getGroupInfo: jest.fn(),
    createGroup: jest.fn(),
    updateGroup: jest.fn(),
    deleteGroup: jest.fn(),
  };
  const mockGroupUserService = {
    getGroupUsers: jest.fn(),
    addUserToGroup: jest.fn(),
    removeUserFromGroup: jest.fn(),
  };

  const ability = { cannot: jest.fn() };
  const mockWorkspaceAbility = { createForUser: jest.fn() };

  const user: any = { id: 'user-1' };
  const workspace: any = { id: 'workspace-1' };

  beforeEach(async () => {
    jest.clearAllMocks();
    ability.cannot.mockReturnValue(false);
    mockWorkspaceAbility.createForUser.mockReturnValue(ability);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GroupController],
      providers: [
        { provide: GroupService, useValue: mockGroupService },
        { provide: GroupUserService, useValue: mockGroupUserService },
        { provide: WorkspaceAbilityFactory, useValue: mockWorkspaceAbility },
      ],
    })
      .useMocker(autoMocker)
      .compile();

    controller = module.get<GroupController>(GroupController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getWorkspaceGroups', () => {
    it('requires read permission on groups', async () => {
      ability.cannot.mockReturnValue(true);

      expect(() =>
        controller.getWorkspaceGroups({} as any, user, workspace),
      ).toThrow(ForbiddenException);
      expect(ability.cannot).toHaveBeenCalledWith(
        WorkspaceCaslAction.Read,
        WorkspaceCaslSubject.Group,
      );
      expect(mockGroupService.getWorkspaceGroups).not.toHaveBeenCalled();
    });

    it('lists groups scoped to the caller’s workspace', () => {
      const pagination: any = { page: 1, limit: 20 };

      controller.getWorkspaceGroups(pagination, user, workspace);

      expect(mockGroupService.getWorkspaceGroups).toHaveBeenCalledWith(
        workspace.id,
        pagination,
      );
    });
  });

  describe('createGroup', () => {
    it('requires manage permission on groups', () => {
      // Group membership drives space access, so creating one is a
      // permissions operation, not just a bit of bookkeeping.
      ability.cannot.mockReturnValue(true);

      expect(() =>
        controller.createGroup({ name: 'Team' } as any, user, workspace),
      ).toThrow(ForbiddenException);
      expect(ability.cannot).toHaveBeenCalledWith(
        WorkspaceCaslAction.Manage,
        WorkspaceCaslSubject.Group,
      );
      expect(mockGroupService.createGroup).not.toHaveBeenCalled();
    });

    it('creates the group in the caller’s workspace', () => {
      const dto: any = { name: 'Team' };

      controller.createGroup(dto, user, workspace);

      expect(mockGroupService.createGroup).toHaveBeenCalledWith(
        user,
        workspace.id,
        dto,
      );
    });
  });

  describe('updateGroup', () => {
    it('requires manage permission on groups', () => {
      ability.cannot.mockReturnValue(true);

      expect(() =>
        controller.updateGroup({ groupId: 'group-1' } as any, user, workspace),
      ).toThrow(ForbiddenException);
      expect(mockGroupService.updateGroup).not.toHaveBeenCalled();
    });

    it('updates within the caller’s workspace', () => {
      const dto: any = { groupId: 'group-1', name: 'Renamed' };

      controller.updateGroup(dto, user, workspace);

      expect(mockGroupService.updateGroup).toHaveBeenCalledWith(
        workspace.id,
        dto,
      );
    });
  });

  describe('deleteGroup', () => {
    it('requires manage permission on groups', () => {
      ability.cannot.mockReturnValue(true);

      expect(() =>
        controller.deleteGroup({ groupId: 'group-1' } as any, user, workspace),
      ).toThrow(ForbiddenException);
      expect(mockGroupService.deleteGroup).not.toHaveBeenCalled();
    });

    it('deletes within the caller’s workspace', () => {
      controller.deleteGroup({ groupId: 'group-1' } as any, user, workspace);

      expect(mockGroupService.deleteGroup).toHaveBeenCalledWith(
        'group-1',
        workspace.id,
      );
    });
  });
});
