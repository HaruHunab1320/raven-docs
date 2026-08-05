import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { SpaceController } from './space.controller';
import { SpaceService } from './services/space.service';
import { SpaceMemberService } from './services/space-member.service';
import { SpaceMemberRepo } from '@raven-docs/db/repos/space/space-member.repo';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import WorkspaceAbilityFactory from '../casl/abilities/workspace-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../casl/interfaces/space-ability.type';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../casl/interfaces/workspace-ability.type';
import { autoMocker } from '../../common/testing/auto-mock';

describe('SpaceController', () => {
  let controller: SpaceController;

  const mockSpaceService = {
    getSpaceInfo: jest.fn(),
    createSpace: jest.fn(),
    deleteSpace: jest.fn(),
    getWorkspaceSpaces: jest.fn(),
  };
  const mockSpaceMemberService = {};
  const mockSpaceMemberRepo = { getUserSpaceRoles: jest.fn() };

  const spaceAbility = { cannot: jest.fn(), rules: [{ action: 'read' }] };
  const workspaceAbility = { cannot: jest.fn() };
  const mockSpaceAbilityFactory = { createForUser: jest.fn() };
  const mockWorkspaceAbilityFactory = { createForUser: jest.fn() };

  const user: any = { id: 'user-1' };
  const workspace: any = { id: 'workspace-1' };
  const space: any = { id: 'space-1', name: 'Research' };

  beforeEach(async () => {
    jest.clearAllMocks();
    spaceAbility.cannot.mockReturnValue(false);
    workspaceAbility.cannot.mockReturnValue(false);
    mockSpaceAbilityFactory.createForUser.mockResolvedValue(spaceAbility);
    mockWorkspaceAbilityFactory.createForUser.mockReturnValue(workspaceAbility);
    mockSpaceService.getSpaceInfo.mockResolvedValue(space);
    mockSpaceMemberRepo.getUserSpaceRoles.mockResolvedValue(['reader']);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SpaceController],
      providers: [
        { provide: SpaceService, useValue: mockSpaceService },
        { provide: SpaceMemberService, useValue: mockSpaceMemberService },
        { provide: SpaceMemberRepo, useValue: mockSpaceMemberRepo },
        { provide: SpaceAbilityFactory, useValue: mockSpaceAbilityFactory },
        {
          provide: WorkspaceAbilityFactory,
          useValue: mockWorkspaceAbilityFactory,
        },
      ],
    })
      .useMocker(autoMocker)
      .compile();

    controller = module.get<SpaceController>(SpaceController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getSpaceInfo', () => {
    it('returns the space with the caller’s membership and permissions', async () => {
      const result = await controller.getSpaceInfo(
        { spaceId: space.id } as any,
        user,
        workspace,
      );

      expect(mockSpaceService.getSpaceInfo).toHaveBeenCalledWith(
        space.id,
        workspace.id,
      );
      expect(result).toMatchObject({
        id: space.id,
        membership: { userId: user.id, permissions: spaceAbility.rules },
      });
    });

    it('refuses a caller who cannot read the space', async () => {
      spaceAbility.cannot.mockReturnValue(true);

      await expect(
        controller.getSpaceInfo({ spaceId: space.id } as any, user, workspace),
      ).rejects.toThrow(ForbiddenException);
      expect(spaceAbility.cannot).toHaveBeenCalledWith(
        SpaceCaslAction.Read,
        SpaceCaslSubject.Settings,
      );
    });
  });

  describe('createSpace', () => {
    it('requires workspace-level permission to manage spaces', async () => {
      workspaceAbility.cannot.mockReturnValue(true);

      expect(() =>
        controller.createSpace({ name: 'New' } as any, user, workspace),
      ).toThrow(ForbiddenException);
      expect(workspaceAbility.cannot).toHaveBeenCalledWith(
        WorkspaceCaslAction.Manage,
        WorkspaceCaslSubject.Space,
      );
      expect(mockSpaceService.createSpace).not.toHaveBeenCalled();
    });

    it('creates the space in the caller’s workspace', async () => {
      const dto: any = { name: 'New', slug: 'new' };

      controller.createSpace(dto, user, workspace);

      expect(mockSpaceService.createSpace).toHaveBeenCalledWith(
        user,
        workspace.id,
        dto,
      );
    });
  });

  describe('deleteSpace', () => {
    it('requires manage-settings permission on the space', async () => {
      spaceAbility.cannot.mockReturnValue(true);

      await expect(
        controller.deleteSpace({ spaceId: space.id } as any, user, workspace),
      ).rejects.toThrow(ForbiddenException);
      expect(spaceAbility.cannot).toHaveBeenCalledWith(
        SpaceCaslAction.Manage,
        SpaceCaslSubject.Settings,
      );
      expect(mockSpaceService.deleteSpace).not.toHaveBeenCalled();
    });

    it('deletes within the caller’s workspace', async () => {
      await controller.deleteSpace(
        { spaceId: space.id } as any,
        user,
        workspace,
      );

      expect(mockSpaceService.deleteSpace).toHaveBeenCalledWith(
        space.id,
        workspace.id,
      );
    });
  });

  describe('validateIds', () => {
    it('requires either a userId or a groupId', () => {
      expect(() => controller.validateIds({} as any)).toThrow(
        BadRequestException,
      );
    });

    it('rejects supplying both', () => {
      // Ambiguous intent — silently picking one could grant or revoke access
      // for the wrong subject.
      expect(() =>
        controller.validateIds({ userId: 'u', groupId: 'g' } as any),
      ).toThrow(BadRequestException);
    });

    it('accepts exactly one', () => {
      expect(() => controller.validateIds({ userId: 'u' } as any)).not.toThrow();
      expect(() =>
        controller.validateIds({ groupId: 'g' } as any),
      ).not.toThrow();
    });
  });
});
