import { Test, TestingModule } from '@nestjs/testing';

// Mock modules with deep transitive dependencies before importing handler
jest.mock('../../../core/page/services/page.service', () => ({
  PageService: jest.fn(),
}));
jest.mock('../../../core/space/services/space.service', () => ({
  SpaceService: jest.fn(),
}));
jest.mock('../services/mcp-event.service', () => ({
  MCPEventService: jest.fn(),
  MCPResourceType: { PAGE: 'page' },
}));

import { HypothesisHandler } from './hypothesis.handler';
import { PageService } from '../../../core/page/services/page.service';
import { PageRepo } from '../../../database/repos/page/page.repo';
import SpaceAbilityFactory from '../../../core/casl/abilities/space-ability.factory';
import { MCPEventService } from '../services/mcp-event.service';
import { SpaceService } from '../../../core/space/services/space.service';
import { ResearchGraphService } from '../../../core/research-graph/research-graph.service';

describe('HypothesisHandler', () => {
  let handler: HypothesisHandler;

  const mockPageService = {
    create: jest.fn(),
  };

  const mockPageRepo = {
    findById: jest.fn(),
    updatePage: jest.fn(),
  };

  const mockSpaceAbility = {
    createForUser: jest.fn().mockResolvedValue({
      can: jest.fn().mockReturnValue(true),
      cannot: jest.fn().mockReturnValue(false),
    }),
  };

  const mockMcpEventService = {
    createCreatedEvent: jest.fn(),
    createUpdatedEvent: jest.fn(),
  };

  const mockSpaceService = {
    getSpaceInfo: jest.fn(),
  };

  const mockResearchGraph = {
    syncPageNode: jest.fn(),
    getEvidenceChain: jest.fn(),
  };

  const userId = 'user-123';

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HypothesisHandler,
        { provide: PageService, useValue: mockPageService },
        { provide: PageRepo, useValue: mockPageRepo },
        { provide: SpaceAbilityFactory, useValue: mockSpaceAbility },
        { provide: MCPEventService, useValue: mockMcpEventService },
        { provide: SpaceService, useValue: mockSpaceService },
        { provide: ResearchGraphService, useValue: mockResearchGraph },
      ],
    }).compile();

    handler = module.get<HypothesisHandler>(HypothesisHandler);
  });

  describe('create', () => {
    it('should create a hypothesis page with metadata', async () => {
      mockSpaceService.getSpaceInfo.mockResolvedValue({
        id: 'space-1',
        workspaceId: 'workspace-1',
      });

      mockPageService.create.mockResolvedValue({
        id: 'page-1',
        title: 'My Hypothesis',
        spaceId: 'space-1',
      });

      const result = await handler.create(
        {
          title: 'My Hypothesis',
          spaceId: 'space-1',
          workspaceId: 'workspace-1',
          formalStatement: 'If X then Y',
          predictions: ['Y increases'],
          domainTags: ['ml', 'vision'],
          priority: 'high',
        },
        userId,
      );

      expect(result).toMatchObject({
        id: 'page-1',
        title: 'My Hypothesis',
        pageType: 'hypothesis',
      });
      expect(result.metadata).toMatchObject({
        status: 'proposed',
        formalStatement: 'If X then Y',
        predictions: ['Y increases'],
        domainTags: ['ml', 'vision'],
        priority: 'high',
        registeredBy: userId,
      });
      expect(mockResearchGraph.syncPageNode).toHaveBeenCalled();
    });

    it('should throw when title is missing', async () => {
      await expect(
        handler.create(
          { spaceId: 'space-1', workspaceId: 'w-1', formalStatement: 'X' },
          userId,
        ),
      ).rejects.toMatchObject({ code: expect.any(Number) });
    });

    it('should throw when formalStatement is missing', async () => {
      await expect(
        handler.create(
          { title: 'Test', spaceId: 'space-1', workspaceId: 'w-1' },
          userId,
        ),
      ).rejects.toMatchObject({ code: expect.any(Number) });
    });

    it('should throw when spaceId is missing', async () => {
      await expect(
        handler.create(
          { title: 'Test', workspaceId: 'w-1', formalStatement: 'X' },
          userId,
        ),
      ).rejects.toMatchObject({ code: expect.any(Number) });
    });

    it('should throw when workspaceId is missing', async () => {
      await expect(
        handler.create(
          { title: 'Test', spaceId: 's-1', formalStatement: 'X' },
          userId,
        ),
      ).rejects.toMatchObject({ code: expect.any(Number) });
    });

    it('should default status to proposed', async () => {
      mockSpaceService.getSpaceInfo.mockResolvedValue({
        id: 'space-1',
        workspaceId: 'workspace-1',
      });
      mockPageService.create.mockResolvedValue({
        id: 'page-1',
        title: 'H',
        spaceId: 'space-1',
      });

      const result = await handler.create(
        {
          title: 'H',
          spaceId: 'space-1',
          workspaceId: 'workspace-1',
          formalStatement: 'X',
        },
        userId,
      );

      expect(result.metadata.status).toBe('proposed');
    });
  });

  describe('update', () => {
    it('should update hypothesis metadata', async () => {
      mockPageRepo.findById.mockResolvedValue({
        id: 'page-1',
        title: 'Old Title',
        pageType: 'hypothesis',
        spaceId: 'space-1',
        workspaceId: 'workspace-1',
        metadata: { status: 'proposed', formalStatement: 'X', domainTags: [] },
        createdAt: new Date(),
      });
      mockPageRepo.updatePage.mockResolvedValue({});

      const result = await handler.update(
        {
          pageId: 'page-1',
          status: 'testing',
          predictions: ['Y increases'],
        },
        userId,
      );

      expect(result.metadata.status).toBe('testing');
      expect(result.metadata.predictions).toEqual(['Y increases']);
      expect(mockPageRepo.updatePage).toHaveBeenCalled();
    });

    it('should throw when pageId is missing', async () => {
      await expect(handler.update({}, userId)).rejects.toMatchObject({
        code: expect.any(Number),
      });
    });

    it('should throw for non-hypothesis page', async () => {
      mockPageRepo.findById.mockResolvedValue({
        id: 'page-1',
        pageType: 'experiment',
        spaceId: 'space-1',
      });

      await expect(
        handler.update({ pageId: 'page-1' }, userId),
      ).rejects.toMatchObject({ code: expect.any(Number) });
    });

    it('should reject invalid status', async () => {
      mockPageRepo.findById.mockResolvedValue({
        id: 'page-1',
        pageType: 'hypothesis',
        spaceId: 'space-1',
        metadata: {},
      });

      await expect(
        handler.update({ pageId: 'page-1', status: 'invalid_status' }, userId),
      ).rejects.toMatchObject({ code: expect.any(Number) });
    });
  });

  describe('get', () => {
    it('should return hypothesis with evidence chain', async () => {
      mockPageRepo.findById.mockResolvedValue({
        id: 'page-1',
        title: 'My Hypothesis',
        pageType: 'hypothesis',
        spaceId: 'space-1',
        workspaceId: 'workspace-1',
        metadata: { status: 'testing', formalStatement: 'X' },
        content: {},
      });

      mockResearchGraph.getEvidenceChain.mockResolvedValue({
        supporting: [{ from: 'exp-1', to: 'page-1', type: 'VALIDATES' }],
        contradicting: [],
        testing: [{ from: 'exp-2', to: 'page-1', type: 'TESTS_HYPOTHESIS' }],
        reproductions: [],
        failedReproductions: [],
      });

      const result = await handler.get({ pageId: 'page-1' }, userId);

      expect(result.id).toBe('page-1');
      expect(result.evidenceChain.supporting).toHaveLength(1);
      expect(result.evidenceChain.testing).toHaveLength(1);
    });

    it('should throw when pageId is missing', async () => {
      await expect(handler.get({}, userId)).rejects.toMatchObject({
        code: expect.any(Number),
      });
    });

    it('should throw when page not found', async () => {
      mockPageRepo.findById.mockResolvedValue(null);

      await expect(
        handler.get({ pageId: 'nonexistent' }, userId),
      ).rejects.toMatchObject({ code: expect.any(Number) });
    });
  });
});
