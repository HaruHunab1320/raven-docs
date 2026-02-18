export interface TypedPage {
  id: string;
  slugId: string;
  title: string | null;
  pageType: string | null;
  metadata: Record<string, any> | null;
  spaceId: string;
  workspaceId: string;
  createdAt: Date;
  updatedAt: Date;
  similarity?: number;
}

export interface TimelineEntry {
  id: string;
  title: string | null;
  pageType: string | null;
  date: Date;
  metadataStatus?: string;
}

export interface ContextBundle {
  query: string;
  directHits: TypedPage[];
  relatedWork: TypedPage[];
  timeline: TimelineEntry[];
  currentState: {
    validated: TypedPage[];
    refuted: TypedPage[];
    testing: TypedPage[];
    open: TypedPage[];
  };
  openQuestions: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    labels: string[];
  }>;
  contradictions: Array<{
    from: string;
    to: string;
    type: string;
  }>;
  experiments: TypedPage[];
  papers: TypedPage[];
}
