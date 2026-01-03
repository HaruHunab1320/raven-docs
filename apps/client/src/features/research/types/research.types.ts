export type ResearchSourceConfig = {
  docs?: boolean;
  web?: boolean;
  repo?: boolean;
};

export type ResearchJob = {
  id: string;
  topic: string;
  goal?: string | null;
  status: string;
  timeBudgetMinutes: number;
  outputMode: "longform" | "brief";
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  reportPageId?: string | null;
  logPageId?: string | null;
};

export type CreateResearchJobInput = {
  workspaceId: string;
  spaceId: string;
  topic: string;
  goal?: string;
  timeBudgetMinutes?: number;
  outputMode?: "longform" | "brief";
  sources?: ResearchSourceConfig;
  reportPageId?: string;
};
