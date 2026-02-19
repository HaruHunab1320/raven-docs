import { Test, TestingModule } from '@nestjs/testing';
import { RelationshipHandler } from './relationship.handler';
import { PageRepo } from '../../../database/repos/page/page.repo';
import SpaceAbilityFactory from '../../../core/casl/abilities/space-ability.factory';
import { ResearchGraphService } from '../../../core/research-graph/research-graph.service';

describe('RelationshipHandler', () => {
  let handler: RelationshipHandler;

  const mockPageRepo = {
    findById: jest.fn(),
  };

  const mockSpaceAbility = {
    createForUser: jest.fn().mockResolvedValue({
      can: jest.fn().mockReturnValue(true),
      cannot: jest.fn().mockReturnValue(false),
    }),
  };

  const mockResearchGraph = {
    createRelationship: jest.fn(),
    removeRelationship: jest.fn(),
    getRelationships: jest.fn(),
  };

  const userId = 'user-123';

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RelationshipHandler,
        { provide: PageRepo, useValue: mockPageRepo },
        { provide: SpaceAbilityFactory, useValue: mockSpaceAbility },
        { provide: ResearchGraphService, useValue: mockResearchGraph },
      ],
    }).compile();

    handler = module.get<RelationshipHandler>(RelationshipHandler);
  });

  describe('create', () => {
    it('should create a relationship between two pages', async () => {
      mockPageRepo.findById
        .mockResolvedValueOnce({ id: 'page-1', spaceId: 'space-1' })
        .mockResolvedValueOnce({ id: 'page-2', spaceId: 'space-1' });

      const result = await handler.create(
        {
          fromPageId: 'page-1',
          toPageId: 'page-2',
          type: 'VALIDATES',
        },
        userId,
      );

      expect(result).toEqual({
        success: true,
        from: 'page-1',
        to: 'page-2',
        type: 'VALIDATES',
      });
      expect(mockResearchGraph.createRelationship).toHaveBeenCalledWith(
        expect.objectContaining({
          fromPageId: 'page-1',
          toPageId: 'page-2',
          type: 'VALIDATES',
          createdBy: userId,
        }),
      );
    });

    it('should normalize edge type to uppercase', async () => {
      mockPageRepo.findById
        .mockResolvedValueOnce({ id: 'page-1', spaceId: 'space-1' })
        .mockResolvedValueOnce({ id: 'page-2', spaceId: 'space-1' });

      const result = await handler.create(
        {
          fromPageId: 'page-1',
          toPageId: 'page-2',
          type: 'validates',
        },
        userId,
      );

      expect(result.type).toBe('VALIDATES');
    });

    it('should pass metadata to graph service', async () => {
      mockPageRepo.findById
        .mockResolvedValueOnce({ id: 'page-1', spaceId: 'space-1' })
        .mockResolvedValueOnce({ id: 'page-2', spaceId: 'space-1' });

      await handler.create(
        {
          fromPageId: 'page-1',
          toPageId: 'page-2',
          type: 'CONTRADICTS',
          metadata: { subtype: 'direct_theorem' },
        },
        userId,
      );

      expect(mockResearchGraph.createRelationship).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: { subtype: 'direct_theorem' },
        }),
      );
    });

    it('should throw when fromPageId is missing', async () => {
      await expect(
        handler.create({ toPageId: 'page-2', type: 'VALIDATES' }, userId),
      ).rejects.toMatchObject({ code: expect.any(Number) });
    });

    it('should throw when toPageId is missing', async () => {
      await expect(
        handler.create({ fromPageId: 'page-1', type: 'VALIDATES' }, userId),
      ).rejects.toMatchObject({ code: expect.any(Number) });
    });

    it('should throw when type is missing', async () => {
      await expect(
        handler.create(
          { fromPageId: 'page-1', toPageId: 'page-2' },
          userId,
        ),
      ).rejects.toMatchObject({ code: expect.any(Number) });
    });

    it('should throw for invalid edge type', async () => {
      await expect(
        handler.create(
          {
            fromPageId: 'page-1',
            toPageId: 'page-2',
            type: 'INVALID_TYPE',
          },
          userId,
        ),
      ).rejects.toMatchObject({ code: expect.any(Number) });
    });

    it('should throw when from page not found', async () => {
      mockPageRepo.findById.mockResolvedValueOnce(null);

      await expect(
        handler.create(
          {
            fromPageId: 'nonexistent',
            toPageId: 'page-2',
            type: 'VALIDATES',
          },
          userId,
        ),
      ).rejects.toMatchObject({ code: expect.any(Number) });
    });

    it('should throw when to page not found', async () => {
      mockPageRepo.findById
        .mockResolvedValueOnce({ id: 'page-1', spaceId: 'space-1' })
        .mockResolvedValueOnce(null);

      await expect(
        handler.create(
          {
            fromPageId: 'page-1',
            toPageId: 'nonexistent',
            type: 'VALIDATES',
          },
          userId,
        ),
      ).rejects.toMatchObject({ code: expect.any(Number) });
    });

    it('should accept new edge types (REPRODUCES, FAILS_TO_REPRODUCE, USES_ASSUMPTION)', async () => {
      for (const type of ['REPRODUCES', 'FAILS_TO_REPRODUCE', 'USES_ASSUMPTION']) {
        jest.clearAllMocks();
        mockPageRepo.findById
          .mockResolvedValueOnce({ id: 'page-1', spaceId: 'space-1' })
          .mockResolvedValueOnce({ id: 'page-2', spaceId: 'space-1' });

        const result = await handler.create(
          { fromPageId: 'page-1', toPageId: 'page-2', type },
          userId,
        );

        expect(result.type).toBe(type);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('remove', () => {
    it('should remove a relationship', async () => {
      mockPageRepo.findById.mockResolvedValue({
        id: 'page-1',
        spaceId: 'space-1',
      });

      const result = await handler.remove(
        {
          fromPageId: 'page-1',
          toPageId: 'page-2',
          type: 'VALIDATES',
        },
        userId,
      );

      expect(result).toEqual({
        success: true,
        removed: {
          from: 'page-1',
          to: 'page-2',
          type: 'VALIDATES',
        },
      });
      expect(mockResearchGraph.removeRelationship).toHaveBeenCalledWith(
        'page-1',
        'page-2',
        'VALIDATES',
      );
    });

    it('should throw when fromPageId is missing', async () => {
      await expect(
        handler.remove({ toPageId: 'page-2', type: 'VALIDATES' }, userId),
      ).rejects.toMatchObject({ code: expect.any(Number) });
    });

    it('should throw when toPageId is missing', async () => {
      await expect(
        handler.remove({ fromPageId: 'page-1', type: 'VALIDATES' }, userId),
      ).rejects.toMatchObject({ code: expect.any(Number) });
    });

    it('should throw when type is missing', async () => {
      await expect(
        handler.remove(
          { fromPageId: 'page-1', toPageId: 'page-2' },
          userId,
        ),
      ).rejects.toMatchObject({ code: expect.any(Number) });
    });

    it('should throw for invalid edge type', async () => {
      await expect(
        handler.remove(
          { fromPageId: 'page-1', toPageId: 'page-2', type: 'NOT_A_TYPE' },
          userId,
        ),
      ).rejects.toMatchObject({ code: expect.any(Number) });
    });

    it('should throw when from page not found', async () => {
      mockPageRepo.findById.mockResolvedValue(null);

      await expect(
        handler.remove(
          { fromPageId: 'nonexistent', toPageId: 'page-2', type: 'VALIDATES' },
          userId,
        ),
      ).rejects.toMatchObject({ code: expect.any(Number) });
    });
  });

  describe('list', () => {
    it('should list relationships for a page', async () => {
      mockPageRepo.findById.mockResolvedValue({
        id: 'page-1',
        spaceId: 'space-1',
      });

      mockResearchGraph.getRelationships.mockResolvedValue([
        {
          from: 'page-1',
          to: 'page-2',
          type: 'VALIDATES',
          createdAt: '2026-01-01',
          createdBy: userId,
          metadata: null,
        },
        {
          from: 'page-3',
          to: 'page-1',
          type: 'CONTRADICTS',
          createdAt: '2026-01-02',
          createdBy: userId,
          metadata: null,
        },
      ]);

      const result = await handler.list({ pageId: 'page-1' }, userId);

      expect(result.edges).toHaveLength(2);
      expect(result.edges[0].type).toBe('VALIDATES');
      expect(result.edges[1].type).toBe('CONTRADICTS');
    });

    it('should pass direction and types to graph service', async () => {
      mockPageRepo.findById.mockResolvedValue({
        id: 'page-1',
        spaceId: 'space-1',
      });

      mockResearchGraph.getRelationships.mockResolvedValue([]);

      await handler.list(
        {
          pageId: 'page-1',
          direction: 'outgoing',
          types: ['VALIDATES', 'CONTRADICTS'],
        },
        userId,
      );

      expect(mockResearchGraph.getRelationships).toHaveBeenCalledWith(
        'page-1',
        { direction: 'outgoing', types: ['VALIDATES', 'CONTRADICTS'] },
      );
    });

    it('should throw when pageId is missing', async () => {
      await expect(handler.list({}, userId)).rejects.toMatchObject({
        code: expect.any(Number),
      });
    });

    it('should throw when page not found', async () => {
      mockPageRepo.findById.mockResolvedValue(null);

      await expect(
        handler.list({ pageId: 'nonexistent' }, userId),
      ).rejects.toMatchObject({ code: expect.any(Number) });
    });
  });
});
