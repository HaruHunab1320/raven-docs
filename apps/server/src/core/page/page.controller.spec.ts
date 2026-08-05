import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PageController } from './page.controller';
import { PageService } from './services/page.service';
import { PageRepo } from '../../database/repos/page/page.repo';
import { PageHistoryService } from './services/page-history.service';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../casl/interfaces/space-ability.type';
import { autoMocker } from '../../common/testing/auto-mock';

describe('PageController', () => {
  let controller: PageController;

  const mockPageService = {
    create: jest.fn(),
    update: jest.fn(),
    softDeleteTree: jest.fn(),
  };
  const mockPageRepo = { findById: jest.fn() };
  const mockPageHistoryService = {};

  const ability = { cannot: jest.fn() };
  const mockSpaceAbility = { createForUser: jest.fn() };

  const user: any = { id: 'user-1' };
  const workspace: any = { id: 'workspace-1' };
  const page: any = { id: 'page-1', spaceId: 'space-1', title: 'Roadmap' };

  beforeEach(async () => {
    jest.clearAllMocks();
    ability.cannot.mockReturnValue(false);
    mockSpaceAbility.createForUser.mockResolvedValue(ability);
    mockPageRepo.findById.mockResolvedValue(page);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PageController],
      providers: [
        { provide: PageService, useValue: mockPageService },
        { provide: PageRepo, useValue: mockPageRepo },
        { provide: PageHistoryService, useValue: mockPageHistoryService },
        { provide: SpaceAbilityFactory, useValue: mockSpaceAbility },
      ],
    })
      .useMocker(autoMocker)
      .compile();

    controller = module.get<PageController>(PageController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getPage', () => {
    it('derives the permission check from the page’s own space', async () => {
      // The caller supplies only a page id, so the space to authorise
      // against has to come from the page itself — never from the request.
      await controller.getPage({ pageId: page.id } as any, user);

      expect(mockSpaceAbility.createForUser).toHaveBeenCalledWith(
        user,
        page.spaceId,
      );
      expect(ability.cannot).toHaveBeenCalledWith(
        SpaceCaslAction.Read,
        SpaceCaslSubject.Page,
      );
    });

    it('refuses a caller who cannot read pages in that space', async () => {
      ability.cannot.mockReturnValue(true);

      await expect(
        controller.getPage({ pageId: page.id } as any, user),
      ).rejects.toThrow(ForbiddenException);
    });

    it('404s for a missing page', async () => {
      mockPageRepo.findById.mockResolvedValue(null);

      await expect(
        controller.getPage({ pageId: 'nope' } as any, user),
      ).rejects.toThrow(NotFoundException);
      // No page means no space, so permission is never evaluated.
      expect(mockSpaceAbility.createForUser).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('requires create permission in the target space', async () => {
      ability.cannot.mockReturnValue(true);

      await expect(
        controller.create({ spaceId: 'space-1' } as any, user, workspace),
      ).rejects.toThrow(ForbiddenException);
      expect(ability.cannot).toHaveBeenCalledWith(
        SpaceCaslAction.Create,
        SpaceCaslSubject.Page,
      );
      expect(mockPageService.create).not.toHaveBeenCalled();
    });

    it('creates the page for the caller in their workspace', async () => {
      const dto: any = { spaceId: 'space-1', title: 'New' };

      await controller.create(dto, user, workspace);

      expect(mockPageService.create).toHaveBeenCalledWith(
        user.id,
        workspace.id,
        dto,
      );
    });
  });

  describe('update', () => {
    it('requires edit permission, not merely read', async () => {
      ability.cannot.mockReturnValue(true);

      await expect(
        controller.update({ pageId: page.id } as any, user),
      ).rejects.toThrow(ForbiddenException);
      expect(ability.cannot).toHaveBeenCalledWith(
        SpaceCaslAction.Edit,
        SpaceCaslSubject.Page,
      );
      expect(mockPageService.update).not.toHaveBeenCalled();
    });

    it('passes the loaded page through to the service', async () => {
      const dto: any = { pageId: page.id, title: 'Renamed' };

      await controller.update(dto, user);

      expect(mockPageService.update).toHaveBeenCalledWith(page, dto, user.id);
    });

    it('404s for a missing page', async () => {
      mockPageRepo.findById.mockResolvedValue(null);

      await expect(
        controller.update({ pageId: 'nope' } as any, user),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('requires manage permission in the page’s space', async () => {
      ability.cannot.mockReturnValue(true);

      await expect(
        controller.delete({ pageId: page.id } as any, user),
      ).rejects.toThrow(ForbiddenException);
      expect(ability.cannot).toHaveBeenCalledWith(
        SpaceCaslAction.Manage,
        SpaceCaslSubject.Page,
      );
      expect(mockPageService.softDeleteTree).not.toHaveBeenCalled();
    });

    it('soft-deletes the whole subtree, attributing it to the caller', async () => {
      await controller.delete({ pageId: page.id } as any, user);

      expect(mockPageService.softDeleteTree).toHaveBeenCalledWith(
        page.id,
        user.id,
      );
    });

    it('404s for a missing page', async () => {
      mockPageRepo.findById.mockResolvedValue(null);

      await expect(
        controller.delete({ pageId: 'nope' } as any, user),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
