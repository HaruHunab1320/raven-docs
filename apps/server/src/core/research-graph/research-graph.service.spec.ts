import { Test, TestingModule } from '@nestjs/testing';
import { ResearchGraphService, RESEARCH_EDGE_TYPES } from './research-graph.service';
import { MemgraphService } from '../../integrations/memgraph/memgraph.service';

describe('ResearchGraphService', () => {
  let service: ResearchGraphService;

  const mockSession = {
    run: jest.fn(),
    close: jest.fn(),
  };

  const mockMemgraph = {
    getSession: jest.fn().mockReturnValue(mockSession),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockMemgraph.getSession.mockReturnValue(mockSession);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResearchGraphService,
        { provide: MemgraphService, useValue: mockMemgraph },
      ],
    }).compile();

    service = module.get<ResearchGraphService>(ResearchGraphService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('RESEARCH_EDGE_TYPES', () => {
    it('should include all expected edge types', () => {
      expect(RESEARCH_EDGE_TYPES).toContain('VALIDATES');
      expect(RESEARCH_EDGE_TYPES).toContain('CONTRADICTS');
      expect(RESEARCH_EDGE_TYPES).toContain('EXTENDS');
      expect(RESEARCH_EDGE_TYPES).toContain('TESTS_HYPOTHESIS');
      expect(RESEARCH_EDGE_TYPES).toContain('REPRODUCES');
      expect(RESEARCH_EDGE_TYPES).toContain('FAILS_TO_REPRODUCE');
      expect(RESEARCH_EDGE_TYPES).toContain('USES_ASSUMPTION');
      expect(RESEARCH_EDGE_TYPES).toContain('CITES');
      expect(RESEARCH_EDGE_TYPES).toContain('FORMALIZES');
      expect(RESEARCH_EDGE_TYPES).toContain('SPAWNED_FROM');
      expect(RESEARCH_EDGE_TYPES).toContain('SUPERSEDES');
      expect(RESEARCH_EDGE_TYPES).toContain('REPLICATES');
      expect(RESEARCH_EDGE_TYPES).toContain('INSPIRED_BY');
      expect(RESEARCH_EDGE_TYPES).toContain('USES_DATA_FROM');
    });
  });

  describe('syncPageNode', () => {
    it('should merge a page node in the graph', async () => {
      mockSession.run.mockResolvedValue({});

      await service.syncPageNode({
        id: 'page-1',
        workspaceId: 'ws-1',
        spaceId: 'space-1',
        pageType: 'hypothesis',
        title: 'Test Hypothesis',
        domainTags: ['ml', 'vision'],
        createdAt: '2026-01-01T00:00:00Z',
      });

      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('MERGE (p:PageNode {id: $id})'),
        expect.objectContaining({
          id: 'page-1',
          workspaceId: 'ws-1',
          pageType: 'hypothesis',
          title: 'Test Hypothesis',
          domainTags: ['ml', 'vision'],
        }),
      );
      expect(mockSession.close).toHaveBeenCalled();
    });

    it('should not throw on graph error', async () => {
      mockSession.run.mockRejectedValue(new Error('Connection failed'));

      await expect(
        service.syncPageNode({
          id: 'page-1',
          workspaceId: 'ws-1',
          spaceId: 'space-1',
          pageType: 'experiment',
          title: 'Test',
          domainTags: [],
          createdAt: '2026-01-01T00:00:00Z',
        }),
      ).resolves.toBeUndefined();

      expect(mockSession.close).toHaveBeenCalled();
    });
  });

  describe('removePageNode', () => {
    it('should detach delete a page node', async () => {
      mockSession.run.mockResolvedValue({});

      await service.removePageNode('page-1');

      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('DETACH DELETE'),
        { id: 'page-1' },
      );
      expect(mockSession.close).toHaveBeenCalled();
    });
  });

  describe('createRelationship', () => {
    it('should create an edge between two page nodes', async () => {
      mockSession.run.mockResolvedValue({});

      await service.createRelationship({
        fromPageId: 'page-1',
        toPageId: 'page-2',
        type: 'VALIDATES',
        createdBy: 'user-1',
        metadata: { confidence: 0.95 },
      });

      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('VALIDATES'),
        expect.objectContaining({
          fromId: 'page-1',
          toId: 'page-2',
          createdBy: 'user-1',
        }),
      );
      expect(mockSession.close).toHaveBeenCalled();
    });

    it('should throw for invalid edge type', async () => {
      await expect(
        service.createRelationship({
          fromPageId: 'page-1',
          toPageId: 'page-2',
          type: 'INVALID_TYPE' as any,
          createdBy: 'user-1',
        }),
      ).rejects.toThrow('Invalid edge type');
    });

    it('should handle REPRODUCES edge type', async () => {
      mockSession.run.mockResolvedValue({});

      await service.createRelationship({
        fromPageId: 'exp-2',
        toPageId: 'exp-1',
        type: 'REPRODUCES',
        createdBy: 'user-1',
      });

      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('REPRODUCES'),
        expect.objectContaining({ fromId: 'exp-2', toId: 'exp-1' }),
      );
    });

    it('should handle FAILS_TO_REPRODUCE edge type', async () => {
      mockSession.run.mockResolvedValue({});

      await service.createRelationship({
        fromPageId: 'exp-3',
        toPageId: 'exp-1',
        type: 'FAILS_TO_REPRODUCE',
        createdBy: 'user-1',
      });

      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('FAILS_TO_REPRODUCE'),
        expect.objectContaining({ fromId: 'exp-3', toId: 'exp-1' }),
      );
    });
  });

  describe('removeRelationship', () => {
    it('should remove an edge between two page nodes', async () => {
      mockSession.run.mockResolvedValue({});

      await service.removeRelationship('page-1', 'page-2', 'VALIDATES');

      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('DELETE r'),
        { fromId: 'page-1', toId: 'page-2' },
      );
      expect(mockSession.close).toHaveBeenCalled();
    });
  });

  describe('getRelationships', () => {
    it('should return outgoing edges', async () => {
      mockSession.run.mockResolvedValue({
        records: [
          {
            get: jest.fn((key) => {
              const data = {
                from: 'page-1',
                to: 'page-2',
                type: 'VALIDATES',
                createdAt: '2026-01-01',
                createdBy: 'user-1',
                metadata: null,
              };
              return data[key];
            }),
          },
        ],
      });

      const edges = await service.getRelationships('page-1', {
        direction: 'outgoing',
      });

      expect(edges).toHaveLength(1);
      expect(edges[0].type).toBe('VALIDATES');
      expect(edges[0].from).toBe('page-1');
      expect(mockSession.close).toHaveBeenCalled();
    });

    it('should return incoming edges', async () => {
      mockSession.run.mockResolvedValue({
        records: [
          {
            get: jest.fn((key) => {
              const data = {
                from: 'page-2',
                to: 'page-1',
                type: 'CONTRADICTS',
                createdAt: '2026-01-01',
                createdBy: 'user-1',
                metadata: '{"subtype":"direct_theorem"}',
              };
              return data[key];
            }),
          },
        ],
      });

      const edges = await service.getRelationships('page-1', {
        direction: 'incoming',
      });

      expect(edges).toHaveLength(1);
      expect(edges[0].type).toBe('CONTRADICTS');
      expect(edges[0].metadata).toEqual({ subtype: 'direct_theorem' });
    });

    it('should filter by edge types', async () => {
      mockSession.run.mockResolvedValue({
        records: [
          {
            get: jest.fn((key) => {
              const data = {
                from: 'page-1',
                to: 'page-2',
                type: 'VALIDATES',
                createdAt: '',
                createdBy: null,
                metadata: null,
              };
              return data[key];
            }),
          },
          {
            get: jest.fn((key) => {
              const data = {
                from: 'page-3',
                to: 'page-1',
                type: 'CITES',
                createdAt: '',
                createdBy: null,
                metadata: null,
              };
              return data[key];
            }),
          },
        ],
      });

      const edges = await service.getRelationships('page-1', {
        types: ['VALIDATES'],
      });

      expect(edges).toHaveLength(1);
      expect(edges[0].type).toBe('VALIDATES');
    });

    it('should default to both directions', async () => {
      mockSession.run.mockResolvedValue({ records: [] });

      await service.getRelationships('page-1');

      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('(p:PageNode {id: $pageId})-[r]-(other:PageNode)'),
        { pageId: 'page-1' },
      );
    });
  });

  describe('getEvidenceChain', () => {
    it('should return categorized evidence for a hypothesis', async () => {
      mockSession.run.mockResolvedValue({
        records: [
          {
            get: jest.fn((key) => {
              const data = {
                supporting: [{ from: 'exp-1', createdAt: '2026-01-01', createdBy: 'user-1' }],
                contradicting: [{ from: 'exp-2', createdAt: '2026-01-02', createdBy: 'user-2', metadata: '{"subtype":"direct_theorem"}' }],
                testing: [{ from: 'exp-3', createdAt: '2026-01-03', createdBy: 'user-1' }],
                reproductions: [{ from: 'exp-4', createdAt: '2026-01-04', createdBy: 'user-1' }],
                failedReproductions: [],
              };
              return data[key];
            }),
          },
        ],
      });

      const chain = await service.getEvidenceChain('hyp-1');

      expect(chain.supporting).toHaveLength(1);
      expect(chain.supporting[0].from).toBe('exp-1');
      expect(chain.supporting[0].type).toBe('VALIDATES');

      expect(chain.contradicting).toHaveLength(1);
      expect(chain.contradicting[0].from).toBe('exp-2');
      expect(chain.contradicting[0].type).toBe('CONTRADICTS');

      expect(chain.testing).toHaveLength(1);
      expect(chain.testing[0].type).toBe('TESTS_HYPOTHESIS');

      expect(chain.reproductions).toHaveLength(1);
      expect(chain.reproductions[0].type).toBe('REPRODUCES');

      expect(chain.failedReproductions).toHaveLength(0);
      expect(mockSession.close).toHaveBeenCalled();
    });

    it('should return empty arrays when no records', async () => {
      mockSession.run.mockResolvedValue({ records: [] });

      const chain = await service.getEvidenceChain('hyp-1');

      expect(chain.supporting).toEqual([]);
      expect(chain.contradicting).toEqual([]);
      expect(chain.testing).toEqual([]);
      expect(chain.reproductions).toEqual([]);
      expect(chain.failedReproductions).toEqual([]);
    });

    it('should filter out null from entries', async () => {
      mockSession.run.mockResolvedValue({
        records: [
          {
            get: jest.fn((key) => {
              const data = {
                supporting: [{ from: null, createdAt: null, createdBy: null }],
                contradicting: [],
                testing: [],
                reproductions: [],
                failedReproductions: [],
              };
              return data[key];
            }),
          },
        ],
      });

      const chain = await service.getEvidenceChain('hyp-1');

      expect(chain.supporting).toHaveLength(0);
    });
  });

  describe('findContradictions', () => {
    it('should find all contradicting edges for a workspace', async () => {
      mockSession.run.mockResolvedValue({
        records: [
          {
            get: jest.fn((key) => {
              const data = {
                from: 'exp-1',
                to: 'hyp-1',
                type: 'CONTRADICTS',
                createdAt: '2026-01-01',
                createdBy: 'user-1',
                metadata: null,
              };
              return data[key];
            }),
          },
        ],
      });

      const edges = await service.findContradictions('ws-1');

      expect(edges).toHaveLength(1);
      expect(edges[0].type).toBe('CONTRADICTS');
      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('CONTRADICTS'),
        expect.objectContaining({ workspaceId: 'ws-1' }),
      );
    });

    it('should filter by domain tags when provided', async () => {
      mockSession.run.mockResolvedValue({ records: [] });

      await service.findContradictions('ws-1', ['ml', 'nlp']);

      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('domainTags'),
        expect.objectContaining({ domainTags: ['ml', 'nlp'] }),
      );
    });
  });

  describe('getRelatedPages', () => {
    it('should return related page nodes', async () => {
      mockSession.run.mockResolvedValue({
        records: [
          {
            get: jest.fn(() => ({
              properties: {
                id: 'page-2',
                pageType: 'experiment',
                title: 'Related Exp',
                domainTags: ['ml'],
                workspaceId: 'ws-1',
                spaceId: 'space-1',
              },
            })),
          },
        ],
      });

      const nodes = await service.getRelatedPages('page-1');

      expect(nodes).toHaveLength(1);
      expect(nodes[0]).toEqual({
        id: 'page-2',
        pageType: 'experiment',
        title: 'Related Exp',
        domainTags: ['ml'],
        workspaceId: 'ws-1',
        spaceId: 'space-1',
      });
    });

    it('should respect maxDepth and edgeTypes options', async () => {
      mockSession.run.mockResolvedValue({ records: [] });

      await service.getRelatedPages('page-1', {
        maxDepth: 3,
        edgeTypes: ['VALIDATES', 'EXTENDS'],
      });

      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('VALIDATES|EXTENDS'),
        expect.objectContaining({ pageId: 'page-1' }),
      );
    });

    it('should filter by workspaceId when provided', async () => {
      mockSession.run.mockResolvedValue({ records: [] });

      await service.getRelatedPages('page-1', {
        workspaceId: 'ws-1',
      });

      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('workspaceId'),
        expect.objectContaining({ workspaceId: 'ws-1' }),
      );
    });
  });

  describe('getDomainGraph', () => {
    it('should return nodes and edges for a domain', async () => {
      mockSession.run.mockResolvedValue({
        records: [
          {
            get: jest.fn((key) => {
              if (key === 'nodes') {
                return [
                  {
                    id: 'page-1',
                    pageType: 'hypothesis',
                    title: 'H1',
                    domainTags: ['ml'],
                    workspaceId: 'ws-1',
                    spaceId: 'space-1',
                  },
                ];
              }
              if (key === 'edges') {
                return [
                  {
                    from: 'page-1',
                    to: 'page-2',
                    type: 'VALIDATES',
                    createdAt: '2026-01-01',
                    createdBy: 'user-1',
                    metadata: null,
                  },
                ];
              }
              return [];
            }),
          },
        ],
      });

      const graph = await service.getDomainGraph('ws-1', ['ml']);

      expect(graph.nodes).toHaveLength(1);
      expect(graph.nodes[0].title).toBe('H1');
      expect(graph.edges).toHaveLength(1);
      expect(graph.edges[0].type).toBe('VALIDATES');
    });

    it('should return empty when no records', async () => {
      mockSession.run.mockResolvedValue({ records: [] });

      const graph = await service.getDomainGraph('ws-1', ['ml']);

      expect(graph.nodes).toEqual([]);
      expect(graph.edges).toEqual([]);
    });
  });
});
