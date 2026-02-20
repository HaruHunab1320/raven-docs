// Mock deep transitive imports to avoid module resolution issues in Jest
jest.mock('../../../common/helpers/prosemirror/html/index', () => ({}));
jest.mock('../../../collaboration/collaboration.util', () => ({}));
jest.mock('../services/mcp-event.service', () => ({
  MCPEventService: jest.fn().mockImplementation(() => ({
    createCreatedEvent: jest.fn(),
    createUpdatedEvent: jest.fn(),
    createDeletedEvent: jest.fn(),
  })),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { PageHandler } from './page.handler';
import { PageService } from '../../../core/page/services/page.service';
import { PageRepo } from '../../../database/repos/page/page.repo';
import SpaceAbilityFactory from '../../../core/casl/abilities/space-ability.factory';
import { PageHistoryService } from '../../../core/page/services/page-history.service';
import { MCPEventService } from '../services/mcp-event.service';
import { SpaceService } from '../../../core/space/services/space.service';
import { MCPErrorCode } from '../utils/error.utils';

const userId = 'user-123';
const spaceId = 'space-123';
const pageId = 'page-123';

const mockPage = {
  id: pageId,
  title: 'Test Page',
  content: '{}',
  spaceId,
  workspaceId: 'ws-123',
  parentPageId: null,
  agentAccessible: true,
};

const allowAbility = { cannot: jest.fn(() => false) };
const denyAbility = { cannot: jest.fn(() => true) };

const mockPageRepo = {
  findById: jest.fn(),
  updatePage: jest.fn(),
  deletePage: jest.fn(),
  findFirstWorkspaceBySpaceId: jest.fn(),
};

const mockPageService = {
  getRecentSpacePages: jest.fn(),
  getRecentPages: jest.fn(),
  getPageBreadCrumbs: jest.fn(),
  getSidebarPages: jest.fn(),
  create: jest.fn(),
  movePageToSpace: jest.fn(),
};

const mockSpaceAbility = {
  createForUser: jest.fn(() => allowAbility) as jest.Mock,
};

const mockPageHistoryService = {
  findById: jest.fn(),
  findHistoryByPageId: jest.fn(),
};

const mockMcpEventService = {
  createCreatedEvent: jest.fn(),
  createUpdatedEvent: jest.fn(),
  createDeletedEvent: jest.fn(),
};

const mockSpaceService = {
  getSpaceInfo: jest.fn(),
};

describe('PageHandler', () => {
  let handler: PageHandler;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PageHandler,
        { provide: PageRepo, useValue: mockPageRepo },
        { provide: PageService, useValue: mockPageService },
        { provide: SpaceAbilityFactory, useValue: mockSpaceAbility },
        { provide: PageHistoryService, useValue: mockPageHistoryService },
        { provide: MCPEventService, useValue: mockMcpEventService },
        { provide: SpaceService, useValue: mockSpaceService },
      ],
    }).compile();

    handler = module.get<PageHandler>(PageHandler);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(handler).toBeDefined();
  });

  // ── getPage ─────────────────────────────────────────────────────────────

  describe('getPage', () => {
    it('should return a page by id', async () => {
      mockPageRepo.findById.mockResolvedValue(mockPage);

      const result = await handler.getPage({ pageId }, userId);

      expect(result).toEqual(mockPage);
      expect(mockPageRepo.findById).toHaveBeenCalledWith(pageId, {
        includeContent: true,
        includeSpace: true,
        includeCreator: true,
        includeLastUpdatedBy: true,
      });
    });

    it('should throw when pageId is missing', async () => {
      await expect(handler.getPage({}, userId)).rejects.toMatchObject({
        code: MCPErrorCode.INVALID_PARAMS,
      });
    });

    it('should throw when page is not found', async () => {
      mockPageRepo.findById.mockResolvedValue(null);

      await expect(handler.getPage({ pageId }, userId)).rejects.toMatchObject({
        code: MCPErrorCode.RESOURCE_NOT_FOUND,
      });
    });

    it('should throw when page is not agent accessible', async () => {
      mockPageRepo.findById.mockResolvedValue({
        ...mockPage,
        agentAccessible: false,
      });

      await expect(handler.getPage({ pageId }, userId)).rejects.toMatchObject({
        code: MCPErrorCode.PERMISSION_DENIED,
      });
    });

    it('should throw when user lacks read permission', async () => {
      mockPageRepo.findById.mockResolvedValue(mockPage);
      mockSpaceAbility.createForUser.mockResolvedValue(denyAbility);

      await expect(handler.getPage({ pageId }, userId)).rejects.toMatchObject({
        code: MCPErrorCode.PERMISSION_DENIED,
      });

      mockSpaceAbility.createForUser.mockResolvedValue(allowAbility);
    });
  });

  // ── listPages ───────────────────────────────────────────────────────────

  describe('listPages', () => {
    it('should list pages in a space', async () => {
      const pagesResult = {
        items: [mockPage],
        meta: { hasNextPage: false, hasPrevPage: false },
      };
      mockPageService.getRecentSpacePages.mockResolvedValue(pagesResult);

      const result = await handler.listPages({ spaceId }, userId);

      expect(result.pages).toEqual([mockPage]);
      expect(result.pagination).toBeDefined();
    });

    it('should throw when spaceId is missing', async () => {
      await expect(handler.listPages({}, userId)).rejects.toMatchObject({
        code: MCPErrorCode.INVALID_PARAMS,
      });
    });

    it('should throw when user lacks permission', async () => {
      mockSpaceAbility.createForUser.mockResolvedValue(denyAbility);

      await expect(
        handler.listPages({ spaceId }, userId),
      ).rejects.toMatchObject({
        code: MCPErrorCode.PERMISSION_DENIED,
      });

      mockSpaceAbility.createForUser.mockResolvedValue(allowAbility);
    });
  });

  // ── createPage ──────────────────────────────────────────────────────────

  describe('createPage', () => {
    it('should create a page', async () => {
      mockSpaceService.getSpaceInfo.mockResolvedValue({
        id: spaceId,
        workspaceId: 'ws-123',
      });
      mockPageService.create.mockResolvedValue(mockPage);

      const result = await handler.createPage(
        { title: 'New Page', spaceId },
        userId,
      );

      expect(result).toEqual(mockPage);
      expect(mockMcpEventService.createCreatedEvent).toHaveBeenCalled();
    });

    it('should throw when title is missing', async () => {
      await expect(
        handler.createPage({ spaceId }, userId),
      ).rejects.toMatchObject({
        code: MCPErrorCode.INVALID_PARAMS,
      });
    });

    it('should throw when spaceId is missing', async () => {
      await expect(
        handler.createPage({ title: 'Page' }, userId),
      ).rejects.toMatchObject({
        code: MCPErrorCode.INVALID_PARAMS,
      });
    });
  });

  // ── updatePage ──────────────────────────────────────────────────────────

  describe('updatePage', () => {
    it('should update a page', async () => {
      const updatedPage = { ...mockPage, title: 'Updated' };
      mockPageRepo.findById
        .mockResolvedValueOnce(mockPage)
        .mockResolvedValueOnce(updatedPage);
      mockPageRepo.updatePage.mockResolvedValue(undefined);

      const result = await handler.updatePage(
        { pageId, title: 'Updated' },
        userId,
      );

      expect(result).toEqual(updatedPage);
      expect(mockPageRepo.updatePage).toHaveBeenCalledWith(
        { title: 'Updated' },
        pageId,
      );
      expect(mockMcpEventService.createUpdatedEvent).toHaveBeenCalled();
    });

    it('should throw when pageId is missing', async () => {
      await expect(
        handler.updatePage({ title: 'x' }, userId),
      ).rejects.toMatchObject({
        code: MCPErrorCode.INVALID_PARAMS,
      });
    });

    it('should throw when page not found', async () => {
      mockPageRepo.findById.mockResolvedValue(null);

      await expect(
        handler.updatePage({ pageId, title: 'x' }, userId),
      ).rejects.toMatchObject({
        code: MCPErrorCode.RESOURCE_NOT_FOUND,
      });
    });

    it('should throw when page is not agent accessible', async () => {
      mockPageRepo.findById.mockResolvedValue({
        ...mockPage,
        agentAccessible: false,
      });

      await expect(
        handler.updatePage({ pageId, title: 'x' }, userId),
      ).rejects.toMatchObject({
        code: MCPErrorCode.PERMISSION_DENIED,
      });
    });
  });

  // ── deletePage ──────────────────────────────────────────────────────────

  describe('deletePage', () => {
    it('should delete a page', async () => {
      mockPageRepo.findById.mockResolvedValue(mockPage);
      mockPageRepo.deletePage.mockResolvedValue(undefined);

      const result = await handler.deletePage({ pageId }, userId);

      expect(result).toEqual({
        success: true,
        message: 'Page deleted successfully',
      });
      expect(mockPageRepo.deletePage).toHaveBeenCalledWith(pageId);
      expect(mockMcpEventService.createDeletedEvent).toHaveBeenCalled();
    });

    it('should throw when pageId is missing', async () => {
      await expect(handler.deletePage({}, userId)).rejects.toMatchObject({
        code: MCPErrorCode.INVALID_PARAMS,
      });
    });

    it('should throw when page not found', async () => {
      mockPageRepo.findById.mockResolvedValue(null);

      await expect(
        handler.deletePage({ pageId }, userId),
      ).rejects.toMatchObject({
        code: MCPErrorCode.RESOURCE_NOT_FOUND,
      });
    });
  });

  // ── searchPages ─────────────────────────────────────────────────────────

  describe('searchPages', () => {
    it('should search pages in a space', async () => {
      const pagesResult = {
        items: [mockPage],
        meta: { hasNextPage: false, hasPrevPage: false },
      };
      mockPageService.getRecentSpacePages.mockResolvedValue(pagesResult);

      const result = await handler.searchPages(
        { query: 'test', spaceId },
        userId,
      );

      expect(result.pages).toEqual([mockPage]);
    });

    it('should search across all spaces when no spaceId', async () => {
      const pagesResult = {
        items: [],
        meta: { hasNextPage: false, hasPrevPage: false },
      };
      mockPageService.getRecentPages.mockResolvedValue(pagesResult);

      const result = await handler.searchPages({ query: 'test' }, userId);

      expect(result.pages).toEqual([]);
      expect(mockPageService.getRecentPages).toHaveBeenCalled();
    });

    it('should throw when query is missing', async () => {
      await expect(handler.searchPages({}, userId)).rejects.toMatchObject({
        code: MCPErrorCode.INVALID_PARAMS,
      });
    });
  });

  // ── movePage ────────────────────────────────────────────────────────────

  describe('movePage', () => {
    it('should throw when pageId is missing', async () => {
      await expect(
        handler.movePage({ targetSpaceId: 's2' }, userId),
      ).rejects.toMatchObject({
        code: MCPErrorCode.INVALID_PARAMS,
      });
    });

    it('should throw when targetSpaceId is missing', async () => {
      await expect(
        handler.movePage({ pageId }, userId),
      ).rejects.toMatchObject({
        code: MCPErrorCode.INVALID_PARAMS,
      });
    });

    it('should throw when page not found', async () => {
      mockPageRepo.findById.mockResolvedValue(null);

      await expect(
        handler.movePage({ pageId, targetSpaceId: 's2' }, userId),
      ).rejects.toMatchObject({
        code: MCPErrorCode.RESOURCE_NOT_FOUND,
      });
    });
  });

  // ── getPageHistory ──────────────────────────────────────────────────────

  describe('getPageHistory', () => {
    const validPageId = '550e8400-e29b-41d4-a716-446655440001';

    it('should return page history', async () => {
      mockPageRepo.findById.mockResolvedValue({ ...mockPage, id: validPageId });
      mockPageHistoryService.findHistoryByPageId.mockResolvedValue({
        items: [{ id: 'h1' }],
        meta: { hasNextPage: false, hasPrevPage: false },
      });

      const result = await handler.getPageHistory({ pageId: validPageId }, userId);

      expect(result.history).toEqual([{ id: 'h1' }]);
      expect(result.pagination).toBeDefined();
    });

    it('should throw when pageId is missing', async () => {
      await expect(handler.getPageHistory({}, userId)).rejects.toMatchObject({
        code: MCPErrorCode.INVALID_PARAMS,
      });
    });

    it('should throw with invalid pageId format', async () => {
      await expect(
        handler.getPageHistory({ pageId: 'not-a-uuid' }, userId),
      ).rejects.toMatchObject({
        code: MCPErrorCode.INVALID_PARAMS,
      });
    });
  });

  // ── restorePageVersion ──────────────────────────────────────────────────

  describe('restorePageVersion', () => {
    const historyId = '550e8400-e29b-41d4-a716-446655440000';

    it('should throw when historyId is missing', async () => {
      await expect(
        handler.restorePageVersion({}, userId),
      ).rejects.toMatchObject({
        code: MCPErrorCode.INVALID_PARAMS,
      });
    });

    it('should throw with invalid historyId format', async () => {
      await expect(
        handler.restorePageVersion({ historyId: 'bad' }, userId),
      ).rejects.toMatchObject({
        code: MCPErrorCode.INVALID_PARAMS,
      });
    });

    it('should throw when history version not found', async () => {
      mockPageHistoryService.findById.mockResolvedValue(null);

      await expect(
        handler.restorePageVersion({ historyId }, userId),
      ).rejects.toMatchObject({
        code: MCPErrorCode.RESOURCE_NOT_FOUND,
      });
    });

    it('should throw when page is not agent accessible', async () => {
      mockPageHistoryService.findById.mockResolvedValue({
        id: historyId,
        pageId,
        content: '{}',
        title: 'Old Title',
        icon: null,
        spaceId,
      });
      mockPageRepo.findById.mockResolvedValue({
        ...mockPage,
        agentAccessible: false,
      });

      await expect(
        handler.restorePageVersion({ historyId }, userId),
      ).rejects.toMatchObject({
        code: MCPErrorCode.PERMISSION_DENIED,
      });
    });
  });
});
