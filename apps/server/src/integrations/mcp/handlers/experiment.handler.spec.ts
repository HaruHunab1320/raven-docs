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

import { ExperimentHandler } from './experiment.handler';
import { PageService } from '../../../core/page/services/page.service';
import { PageRepo } from '../../../database/repos/page/page.repo';
import SpaceAbilityFactory from '../../../core/casl/abilities/space-ability.factory';
import { MCPEventService } from '../services/mcp-event.service';
import { SpaceService } from '../../../core/space/services/space.service';
import { ResearchGraphService } from '../../../core/research-graph/research-graph.service';

describe('ExperimentHandler', () => {
  let handler: ExperimentHandler;

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
    createRelationship: jest.fn(),
  };

  const userId = 'user-123';

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExperimentHandler,
        { provide: PageService, useValue: mockPageService },
        { provide: PageRepo, useValue: mockPageRepo },
        { provide: SpaceAbilityFactory, useValue: mockSpaceAbility },
        { provide: MCPEventService, useValue: mockMcpEventService },
        { provide: SpaceService, useValue: mockSpaceService },
        { provide: ResearchGraphService, useValue: mockResearchGraph },
      ],
    }).compile();

    handler = module.get<ExperimentHandler>(ExperimentHandler);
  });

  describe('register', () => {
    it('should register an experiment page with metadata', async () => {
      mockSpaceService.getSpaceInfo.mockResolvedValue({
        id: 'space-1',
        workspaceId: 'workspace-1',
      });

      mockPageService.create.mockResolvedValue({
        id: 'page-1',
        title: 'My Experiment',
        spaceId: 'space-1',
      });

      const result = await handler.register(
        {
          title: 'My Experiment',
          spaceId: 'space-1',
          workspaceId: 'workspace-1',
          method: 'gradient descent',
          metrics: { accuracy: 0.95 },
          codeRef: 'https://github.com/repo/commit/abc',
        },
        userId,
      );

      expect(result).toMatchObject({
        id: 'page-1',
        title: 'My Experiment',
        pageType: 'experiment',
      });
      expect(result.metadata).toMatchObject({
        status: 'planned',
        method: 'gradient descent',
        metrics: { accuracy: 0.95 },
        codeRef: 'https://github.com/repo/commit/abc',
        hypothesisId: null,
        results: {},
        passedPredictions: null,
      });
      expect(mockResearchGraph.syncPageNode).toHaveBeenCalled();
    });

    it('should auto-create TESTS_HYPOTHESIS edge when hypothesisId is provided', async () => {
      mockSpaceService.getSpaceInfo.mockResolvedValue({
        id: 'space-1',
        workspaceId: 'workspace-1',
      });

      mockPageRepo.findById.mockResolvedValue({
        id: 'hyp-1',
        pageType: 'hypothesis',
      });

      mockPageService.create.mockResolvedValue({
        id: 'exp-1',
        title: 'Linked Experiment',
        spaceId: 'space-1',
      });

      await handler.register(
        {
          title: 'Linked Experiment',
          spaceId: 'space-1',
          workspaceId: 'workspace-1',
          hypothesisId: 'hyp-1',
        },
        userId,
      );

      expect(mockResearchGraph.createRelationship).toHaveBeenCalledWith(
        expect.objectContaining({
          fromPageId: 'exp-1',
          toPageId: 'hyp-1',
          type: 'TESTS_HYPOTHESIS',
          createdBy: userId,
        }),
      );
    });

    it('should throw when hypothesisId references non-hypothesis page', async () => {
      mockSpaceService.getSpaceInfo.mockResolvedValue({
        id: 'space-1',
        workspaceId: 'workspace-1',
      });

      mockPageRepo.findById.mockResolvedValue({
        id: 'page-1',
        pageType: 'paper',
      });

      await expect(
        handler.register(
          {
            title: 'Test',
            spaceId: 'space-1',
            workspaceId: 'workspace-1',
            hypothesisId: 'page-1',
          },
          userId,
        ),
      ).rejects.toMatchObject({ code: expect.any(Number) });
    });

    it('should throw when title is missing', async () => {
      await expect(
        handler.register(
          { spaceId: 'space-1', workspaceId: 'w-1' },
          userId,
        ),
      ).rejects.toMatchObject({ code: expect.any(Number) });
    });

    it('should throw when spaceId is missing', async () => {
      await expect(
        handler.register(
          { title: 'Test', workspaceId: 'w-1' },
          userId,
        ),
      ).rejects.toMatchObject({ code: expect.any(Number) });
    });

    it('should throw when workspaceId is missing', async () => {
      await expect(
        handler.register(
          { title: 'Test', spaceId: 's-1' },
          userId,
        ),
      ).rejects.toMatchObject({ code: expect.any(Number) });
    });

    it('should default status to planned', async () => {
      mockSpaceService.getSpaceInfo.mockResolvedValue({
        id: 'space-1',
        workspaceId: 'workspace-1',
      });
      mockPageService.create.mockResolvedValue({
        id: 'page-1',
        title: 'E',
        spaceId: 'space-1',
      });

      const result = await handler.register(
        {
          title: 'E',
          spaceId: 'space-1',
          workspaceId: 'workspace-1',
        },
        userId,
      );

      expect(result.metadata.status).toBe('planned');
    });
  });

  describe('complete', () => {
    it('should complete a passing experiment and create VALIDATES edge', async () => {
      mockPageRepo.findById.mockResolvedValue({
        id: 'exp-1',
        title: 'My Experiment',
        pageType: 'experiment',
        spaceId: 'space-1',
        workspaceId: 'workspace-1',
        metadata: { status: 'running', hypothesisId: 'hyp-1', results: {} },
      });
      mockPageRepo.updatePage.mockResolvedValue({});

      const result = await handler.complete(
        {
          pageId: 'exp-1',
          results: { accuracy: 0.97 },
          passed: true,
        },
        userId,
      );

      expect(result.metadata.status).toBe('completed');
      expect(result.metadata.results).toEqual({ accuracy: 0.97 });
      expect(result.metadata.passedPredictions).toBe(true);
      expect(result.evidenceType).toBe('VALIDATES');
      expect(mockResearchGraph.createRelationship).toHaveBeenCalledWith(
        expect.objectContaining({
          fromPageId: 'exp-1',
          toPageId: 'hyp-1',
          type: 'VALIDATES',
        }),
      );
    });

    it('should complete a failing experiment and create CONTRADICTS edge', async () => {
      mockPageRepo.findById.mockResolvedValue({
        id: 'exp-1',
        title: 'Failed Experiment',
        pageType: 'experiment',
        spaceId: 'space-1',
        workspaceId: 'workspace-1',
        metadata: { status: 'running', hypothesisId: 'hyp-1', results: {} },
      });
      mockPageRepo.updatePage.mockResolvedValue({});

      const result = await handler.complete(
        {
          pageId: 'exp-1',
          results: { accuracy: 0.3 },
          passed: false,
        },
        userId,
      );

      expect(result.metadata.status).toBe('failed');
      expect(result.evidenceType).toBe('CONTRADICTS');
      expect(mockResearchGraph.createRelationship).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'CONTRADICTS',
        }),
      );
    });

    it('should complete without evidence edge when no hypothesis linked', async () => {
      mockPageRepo.findById.mockResolvedValue({
        id: 'exp-1',
        title: 'Standalone Experiment',
        pageType: 'experiment',
        spaceId: 'space-1',
        workspaceId: 'workspace-1',
        metadata: { status: 'running', hypothesisId: null, results: {} },
      });
      mockPageRepo.updatePage.mockResolvedValue({});

      const result = await handler.complete(
        {
          pageId: 'exp-1',
          results: { metric: 42 },
          passed: true,
        },
        userId,
      );

      expect(result.evidenceType).toBe('VALIDATES');
      expect(result.hypothesisId).toBeNull();
      expect(mockResearchGraph.createRelationship).not.toHaveBeenCalled();
    });

    it('should throw when pageId is missing', async () => {
      await expect(
        handler.complete({ results: {} }, userId),
      ).rejects.toMatchObject({ code: expect.any(Number) });
    });

    it('should throw when results is missing', async () => {
      await expect(
        handler.complete({ pageId: 'exp-1' }, userId),
      ).rejects.toMatchObject({ code: expect.any(Number) });
    });

    it('should throw for non-experiment page', async () => {
      mockPageRepo.findById.mockResolvedValue({
        id: 'page-1',
        pageType: 'hypothesis',
        spaceId: 'space-1',
      });

      await expect(
        handler.complete(
          { pageId: 'page-1', results: { x: 1 } },
          userId,
        ),
      ).rejects.toMatchObject({ code: expect.any(Number) });
    });

    it('should include unexpected observations and suggested follow-ups', async () => {
      mockPageRepo.findById.mockResolvedValue({
        id: 'exp-1',
        title: 'Experiment',
        pageType: 'experiment',
        spaceId: 'space-1',
        workspaceId: 'workspace-1',
        metadata: { status: 'running', hypothesisId: null },
      });
      mockPageRepo.updatePage.mockResolvedValue({});

      const result = await handler.complete(
        {
          pageId: 'exp-1',
          results: { accuracy: 0.8 },
          unexpectedObservations: ['Latency spike at step 500'],
          suggestedFollowUps: ['Run with larger batch size'],
        },
        userId,
      );

      expect(result.metadata.unexpectedObservations).toEqual([
        'Latency spike at step 500',
      ]);
      expect(result.metadata.suggestedFollowUps).toEqual([
        'Run with larger batch size',
      ]);
    });
  });

  describe('update', () => {
    it('should update experiment status and metadata fields', async () => {
      mockPageRepo.findById.mockResolvedValue({
        id: 'exp-1',
        title: 'Old Title',
        pageType: 'experiment',
        spaceId: 'space-1',
        workspaceId: 'workspace-1',
        metadata: { status: 'planned', method: null, metrics: {} },
      });
      mockPageRepo.updatePage.mockResolvedValue({});

      const result = await handler.update(
        {
          pageId: 'exp-1',
          status: 'running',
          method: 'SGD',
          metrics: { loss: 0.1 },
          title: 'New Title',
        },
        userId,
      );

      expect(result.metadata.status).toBe('running');
      expect(result.metadata.method).toBe('SGD');
      expect(result.metadata.metrics).toEqual({ loss: 0.1 });
      expect(result.title).toBe('New Title');
      expect(mockPageRepo.updatePage).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'New Title',
          metadata: expect.objectContaining({ status: 'running' }),
        }),
        'exp-1',
      );
    });

    it('should throw when pageId is missing', async () => {
      await expect(handler.update({}, userId)).rejects.toMatchObject({
        code: expect.any(Number),
      });
    });

    it('should throw for non-experiment page', async () => {
      mockPageRepo.findById.mockResolvedValue({
        id: 'page-1',
        pageType: 'hypothesis',
        spaceId: 'space-1',
      });

      await expect(
        handler.update({ pageId: 'page-1' }, userId),
      ).rejects.toMatchObject({ code: expect.any(Number) });
    });

    it('should reject invalid status', async () => {
      mockPageRepo.findById.mockResolvedValue({
        id: 'exp-1',
        pageType: 'experiment',
        spaceId: 'space-1',
        metadata: {},
      });

      await expect(
        handler.update({ pageId: 'exp-1', status: 'bogus' }, userId),
      ).rejects.toMatchObject({ code: expect.any(Number) });
    });

    it('should update codeRef', async () => {
      mockPageRepo.findById.mockResolvedValue({
        id: 'exp-1',
        title: 'Exp',
        pageType: 'experiment',
        spaceId: 'space-1',
        workspaceId: 'workspace-1',
        metadata: { status: 'planned', codeRef: null },
      });
      mockPageRepo.updatePage.mockResolvedValue({});

      const result = await handler.update(
        {
          pageId: 'exp-1',
          codeRef: 'https://github.com/repo/commit/def',
        },
        userId,
      );

      expect(result.metadata.codeRef).toBe(
        'https://github.com/repo/commit/def',
      );
    });
  });
});
