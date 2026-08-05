import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../casl/interfaces/space-ability.type';
import { autoMocker } from '../../common/testing/auto-mock';

describe('SearchController', () => {
  let controller: SearchController;

  const mockSearchService = {
    searchPage: jest.fn(),
    searchPagesForUser: jest.fn(),
    searchSuggestions: jest.fn(),
  };

  const ability = { cannot: jest.fn() };
  const mockSpaceAbility = {
    createForUser: jest.fn(),
  };

  const user: any = { id: 'user-1', workspaceId: 'workspace-1' };
  const workspace: any = { id: 'workspace-1' };

  beforeEach(async () => {
    jest.clearAllMocks();
    ability.cannot.mockReturnValue(false);
    mockSpaceAbility.createForUser.mockResolvedValue(ability);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SearchController],
      providers: [
        { provide: SearchService, useValue: mockSearchService },
        { provide: SpaceAbilityFactory, useValue: mockSpaceAbility },
      ],
    })
      .useMocker(autoMocker)
      .compile();

    controller = module.get<SearchController>(SearchController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('pageSearch', () => {
    it('checks read permission before searching a named space', async () => {
      const dto: any = { query: 'roadmap', spaceId: 'space-1' };

      await controller.pageSearch(dto, user);

      expect(mockSpaceAbility.createForUser).toHaveBeenCalledWith(
        user,
        'space-1',
      );
      expect(ability.cannot).toHaveBeenCalledWith(
        SpaceCaslAction.Read,
        SpaceCaslSubject.Page,
      );
      expect(mockSearchService.searchPage).toHaveBeenCalledWith('roadmap', dto);
    });

    it('refuses a space the user cannot read', async () => {
      // Without this, naming a space id would let anyone search inside it —
      // the space-scoped query itself applies no permission filter.
      ability.cannot.mockReturnValue(true);

      await expect(
        controller.pageSearch({ query: 'roadmap', spaceId: 'space-1' } as any, user),
      ).rejects.toThrow(ForbiddenException);
      expect(mockSearchService.searchPage).not.toHaveBeenCalled();
    });

    it('falls back to the user-scoped search when no space is named', async () => {
      const dto: any = { query: 'roadmap' };

      await controller.pageSearch(dto, user);

      expect(mockSearchService.searchPagesForUser).toHaveBeenCalledWith(
        'roadmap',
        user.id,
        dto,
      );
      // No space named means no ability check is needed — the service
      // restricts to the user's own spaces instead.
      expect(mockSpaceAbility.createForUser).not.toHaveBeenCalled();
      expect(mockSearchService.searchPage).not.toHaveBeenCalled();
    });
  });

  describe('searchSuggestions', () => {
    it('scopes suggestions to the caller and their workspace', async () => {
      const dto: any = { query: 'ad', includeUsers: true };

      await controller.searchSuggestions(dto, user, workspace);

      expect(mockSearchService.searchSuggestions).toHaveBeenCalledWith(
        dto,
        user.id,
        workspace.id,
      );
    });
  });
});
