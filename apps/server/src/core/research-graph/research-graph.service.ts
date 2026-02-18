import { Injectable, Logger } from '@nestjs/common';
import { MemgraphService } from '../../integrations/memgraph/memgraph.service';

export const RESEARCH_EDGE_TYPES = [
  'VALIDATES',
  'CONTRADICTS',
  'EXTENDS',
  'INSPIRED_BY',
  'USES_DATA_FROM',
  'FORMALIZES',
  'TESTS_HYPOTHESIS',
  'SPAWNED_FROM',
  'SUPERSEDES',
  'CITES',
  'REPLICATES',
] as const;

export type ResearchEdgeType = (typeof RESEARCH_EDGE_TYPES)[number];

export interface PageNodeData {
  id: string;
  workspaceId: string;
  spaceId: string;
  pageType: string;
  title: string;
  domainTags: string[];
  createdAt: string;
}

export interface GraphRelationship {
  fromPageId: string;
  toPageId: string;
  type: ResearchEdgeType;
  createdBy?: string;
  metadata?: Record<string, any>;
}

export interface GraphEdge {
  from: string;
  to: string;
  type: string;
  createdAt: string;
  createdBy: string | null;
  metadata: Record<string, any> | null;
}

export interface GraphNode {
  id: string;
  pageType: string;
  title: string;
  domainTags: string[];
  workspaceId: string;
  spaceId: string;
}

@Injectable()
export class ResearchGraphService {
  private readonly logger = new Logger(ResearchGraphService.name);

  constructor(private readonly memgraph: MemgraphService) {}

  async syncPageNode(data: PageNodeData): Promise<void> {
    const session = this.memgraph.getSession();
    try {
      await session.run(
        `
        MERGE (p:PageNode {id: $id})
        SET p.workspaceId = $workspaceId,
            p.spaceId = $spaceId,
            p.pageType = $pageType,
            p.title = $title,
            p.domainTags = $domainTags,
            p.createdAt = $createdAt
        `,
        {
          id: data.id,
          workspaceId: data.workspaceId,
          spaceId: data.spaceId,
          pageType: data.pageType,
          title: data.title,
          domainTags: data.domainTags,
          createdAt: data.createdAt,
        },
      );
    } catch (error: any) {
      this.logger.warn(`Failed to sync PageNode ${data.id}: ${error?.message}`);
    } finally {
      await session.close();
    }
  }

  async removePageNode(pageId: string): Promise<void> {
    const session = this.memgraph.getSession();
    try {
      await session.run(
        `MATCH (p:PageNode {id: $id}) DETACH DELETE p`,
        { id: pageId },
      );
    } catch (error: any) {
      this.logger.warn(`Failed to remove PageNode ${pageId}: ${error?.message}`);
    } finally {
      await session.close();
    }
  }

  async createRelationship(rel: GraphRelationship): Promise<void> {
    if (!RESEARCH_EDGE_TYPES.includes(rel.type)) {
      throw new Error(`Invalid edge type: ${rel.type}`);
    }

    const session = this.memgraph.getSession();
    try {
      // Use a parameterized type via string interpolation (Cypher doesn't support parameterized relationship types)
      await session.run(
        `
        MATCH (from:PageNode {id: $fromId})
        MATCH (to:PageNode {id: $toId})
        CREATE (from)-[r:${rel.type} {
          createdAt: $createdAt,
          createdBy: $createdBy,
          metadata: $metadata
        }]->(to)
        `,
        {
          fromId: rel.fromPageId,
          toId: rel.toPageId,
          createdAt: new Date().toISOString(),
          createdBy: rel.createdBy || null,
          metadata: JSON.stringify(rel.metadata || {}),
        },
      );
    } finally {
      await session.close();
    }
  }

  async removeRelationship(
    fromPageId: string,
    toPageId: string,
    type: ResearchEdgeType,
  ): Promise<void> {
    const session = this.memgraph.getSession();
    try {
      await session.run(
        `
        MATCH (from:PageNode {id: $fromId})-[r:${type}]->(to:PageNode {id: $toId})
        DELETE r
        `,
        { fromId: fromPageId, toId: toPageId },
      );
    } finally {
      await session.close();
    }
  }

  async getRelationships(
    pageId: string,
    opts?: {
      direction?: 'outgoing' | 'incoming' | 'both';
      types?: ResearchEdgeType[];
    },
  ): Promise<GraphEdge[]> {
    const direction = opts?.direction || 'both';
    const session = this.memgraph.getSession();
    try {
      let query: string;

      if (direction === 'outgoing') {
        query = `
          MATCH (p:PageNode {id: $pageId})-[r]->(other:PageNode)
          RETURN p.id AS from, other.id AS to, type(r) AS type,
                 r.createdAt AS createdAt, r.createdBy AS createdBy, r.metadata AS metadata
        `;
      } else if (direction === 'incoming') {
        query = `
          MATCH (other:PageNode)-[r]->(p:PageNode {id: $pageId})
          RETURN other.id AS from, p.id AS to, type(r) AS type,
                 r.createdAt AS createdAt, r.createdBy AS createdBy, r.metadata AS metadata
        `;
      } else {
        query = `
          MATCH (p:PageNode {id: $pageId})-[r]-(other:PageNode)
          RETURN
            CASE WHEN startNode(r) = p THEN p.id ELSE other.id END AS from,
            CASE WHEN endNode(r) = p THEN p.id ELSE other.id END AS to,
            type(r) AS type,
            r.createdAt AS createdAt, r.createdBy AS createdBy, r.metadata AS metadata
        `;
      }

      const result = await session.run(query, { pageId });

      let edges = result.records.map((record) => ({
        from: record.get('from'),
        to: record.get('to'),
        type: record.get('type'),
        createdAt: record.get('createdAt') || '',
        createdBy: record.get('createdBy') || null,
        metadata: this.parseMetadata(record.get('metadata')),
      }));

      if (opts?.types?.length) {
        edges = edges.filter((e) => opts.types.includes(e.type as ResearchEdgeType));
      }

      return edges;
    } finally {
      await session.close();
    }
  }

  async getRelatedPages(
    pageId: string,
    opts?: {
      maxDepth?: number;
      edgeTypes?: ResearchEdgeType[];
      workspaceId?: string;
    },
  ): Promise<GraphNode[]> {
    const maxDepth = opts?.maxDepth || 2;
    const session = this.memgraph.getSession();
    try {
      let query: string;

      if (opts?.edgeTypes?.length) {
        // Filter by specific edge types — build union of type patterns
        const typeFilter = opts.edgeTypes.join('|');
        query = `
          MATCH (start:PageNode {id: $pageId})-[:${typeFilter}*1..${maxDepth}]-(related:PageNode)
          WHERE related.id <> $pageId
          ${opts?.workspaceId ? 'AND related.workspaceId = $workspaceId' : ''}
          RETURN DISTINCT related
        `;
      } else {
        query = `
          MATCH (start:PageNode {id: $pageId})-[*1..${maxDepth}]-(related:PageNode)
          WHERE related.id <> $pageId
          ${opts?.workspaceId ? 'AND related.workspaceId = $workspaceId' : ''}
          RETURN DISTINCT related
        `;
      }

      const result = await session.run(query, {
        pageId,
        workspaceId: opts?.workspaceId || null,
      });

      return result.records.map((record) => {
        const node = record.get('related').properties;
        return {
          id: node.id,
          pageType: node.pageType,
          title: node.title,
          domainTags: node.domainTags || [],
          workspaceId: node.workspaceId,
          spaceId: node.spaceId,
        };
      });
    } finally {
      await session.close();
    }
  }

  async findContradictions(
    workspaceId: string,
    domainTags?: string[],
  ): Promise<GraphEdge[]> {
    const session = this.memgraph.getSession();
    try {
      let query = `
        MATCH (a:PageNode)-[r:CONTRADICTS]->(b:PageNode)
        WHERE a.workspaceId = $workspaceId
      `;

      if (domainTags?.length) {
        query += `
          AND ANY(tag IN a.domainTags WHERE tag IN $domainTags)
        `;
      }

      query += `
        RETURN a.id AS from, b.id AS to, type(r) AS type,
               r.createdAt AS createdAt, r.createdBy AS createdBy, r.metadata AS metadata
      `;

      const result = await session.run(query, {
        workspaceId,
        domainTags: domainTags || [],
      });

      return result.records.map((record) => ({
        from: record.get('from'),
        to: record.get('to'),
        type: record.get('type'),
        createdAt: record.get('createdAt') || '',
        createdBy: record.get('createdBy') || null,
        metadata: this.parseMetadata(record.get('metadata')),
      }));
    } finally {
      await session.close();
    }
  }

  async getEvidenceChain(hypothesisPageId: string): Promise<{
    supporting: GraphEdge[];
    contradicting: GraphEdge[];
    testing: GraphEdge[];
  }> {
    const session = this.memgraph.getSession();
    try {
      const result = await session.run(
        `
        MATCH (h:PageNode {id: $hypothesisId})
        OPTIONAL MATCH (e1:PageNode)-[r1:VALIDATES]->(h)
        OPTIONAL MATCH (e2:PageNode)-[r2:CONTRADICTS]->(h)
        OPTIONAL MATCH (e3:PageNode)-[r3:TESTS_HYPOTHESIS]->(h)
        RETURN
          collect(DISTINCT {from: e1.id, createdAt: r1.createdAt, createdBy: r1.createdBy}) AS supporting,
          collect(DISTINCT {from: e2.id, createdAt: r2.createdAt, createdBy: r2.createdBy}) AS contradicting,
          collect(DISTINCT {from: e3.id, createdAt: r3.createdAt, createdBy: r3.createdBy}) AS testing
        `,
        { hypothesisId: hypothesisPageId },
      );

      const record = result.records[0];
      if (!record) {
        return { supporting: [], contradicting: [], testing: [] };
      }

      const mapEdges = (items: any[], type: string): GraphEdge[] =>
        items
          .filter((item) => item.from)
          .map((item) => ({
            from: item.from,
            to: hypothesisPageId,
            type,
            createdAt: item.createdAt || '',
            createdBy: item.createdBy || null,
            metadata: null,
          }));

      return {
        supporting: mapEdges(record.get('supporting'), 'VALIDATES'),
        contradicting: mapEdges(record.get('contradicting'), 'CONTRADICTS'),
        testing: mapEdges(record.get('testing'), 'TESTS_HYPOTHESIS'),
      };
    } finally {
      await session.close();
    }
  }

  async getDomainGraph(
    workspaceId: string,
    domainTags: string[],
  ): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
    const session = this.memgraph.getSession();
    try {
      const result = await session.run(
        `
        MATCH (p:PageNode)
        WHERE p.workspaceId = $workspaceId
          AND ANY(tag IN p.domainTags WHERE tag IN $domainTags)
        WITH collect(p) AS nodes
        UNWIND nodes AS n
        OPTIONAL MATCH (n)-[r]->(other:PageNode)
        WHERE other IN nodes
        RETURN
          collect(DISTINCT {id: n.id, pageType: n.pageType, title: n.title,
                           domainTags: n.domainTags, workspaceId: n.workspaceId,
                           spaceId: n.spaceId}) AS nodes,
          collect(DISTINCT {from: n.id, to: other.id, type: type(r),
                           createdAt: r.createdAt, createdBy: r.createdBy,
                           metadata: r.metadata}) AS edges
        `,
        { workspaceId, domainTags },
      );

      const record = result.records[0];
      if (!record) {
        return { nodes: [], edges: [] };
      }

      return {
        nodes: (record.get('nodes') || []).map((n: any) => ({
          id: n.id,
          pageType: n.pageType,
          title: n.title,
          domainTags: n.domainTags || [],
          workspaceId: n.workspaceId,
          spaceId: n.spaceId,
        })),
        edges: (record.get('edges') || [])
          .filter((e: any) => e.from && e.to && e.type)
          .map((e: any) => ({
            from: e.from,
            to: e.to,
            type: e.type,
            createdAt: e.createdAt || '',
            createdBy: e.createdBy || null,
            metadata: this.parseMetadata(e.metadata),
          })),
      };
    } finally {
      await session.close();
    }
  }

  private parseMetadata(raw: any): Record<string, any> | null {
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
}
