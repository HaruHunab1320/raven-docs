export interface HypothesisScoreboard {
  validated: number;
  testing: number;
  refuted: number;
  proposed: number;
  total: number;
}

export interface DashboardStats {
  hypotheses: HypothesisScoreboard;
  activeExperiments: number;
  openQuestions: number;
  contradictions: number;
  totalTypedPages: number;
}

export interface TimelineEntry {
  id: string;
  title: string | null;
  pageType: string | null;
  updatedAt: string;
  metadataStatus: string | null;
}

export interface OpenQuestion {
  id: string;
  title: string;
  status: string;
  priority: string;
  updatedAt: string;
}

export interface Contradiction {
  from: string;
  to: string;
  type: string;
  fromTitle: string;
  fromType: string | null;
  toTitle: string;
  toType: string | null;
}

export interface TypedPageSummary {
  id: string;
  title: string | null;
  pageType: string | null;
  metadata: Record<string, any> | null;
  slugId?: string;
  updatedAt: string;
  activeTeam?: {
    deploymentId: string;
    teamName: string;
    status: string;
    swarmExecutionId?: string;
    swarmStatus?: string;
  } | null;
}

export interface GraphNode {
  id: string;
  pageType: string;
  title: string;
  domainTags: string[];
}

export interface GraphEdge {
  from: string;
  to: string;
  type: string;
}

export interface DomainGraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface PatternDetection {
  id: string;
  patternType: string;
  severity: string;
  title: string;
  details: Record<string, any>;
  status: string;
  detectedAt: string;
}
