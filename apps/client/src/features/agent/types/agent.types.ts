export interface AgentSettings {
  policy?: {
    allowAutoApply?: string[];
    requireApproval?: string[];
    deny?: string[];
  };
  enabled: boolean;
  enableDailySummary: boolean;
  enableAutoTriage: boolean;
  enableMemoryAutoIngest: boolean;
  enableGoalAutoLink: boolean;
  enablePlannerLoop: boolean;
  enableProactiveQuestions: boolean;
  enableAutonomousLoop: boolean;
  enableMemoryInsights: boolean;
  allowAgentChat: boolean;
  allowTaskWrites: boolean;
  allowPageWrites: boolean;
  allowProjectWrites: boolean;
  allowGoalWrites: boolean;
  allowResearchWrites: boolean;
  chatDraftLimit: number;
  autonomySchedule: {
    dailyEnabled: boolean;
    dailyHour: number;
    weeklyEnabled: boolean;
    weeklyDay: number;
    monthlyEnabled: boolean;
    monthlyDay: number;
    timezone: string;
    lastDailyRun?: string;
    lastWeeklyRun?: string;
    lastMonthlyRun?: string;
  };
  spaceOverrides?: Record<
    string,
    {
      autonomySchedule?: {
        dailyEnabled?: boolean;
        dailyHour?: number;
        weeklyEnabled?: boolean;
        weeklyDay?: number;
        monthlyEnabled?: boolean;
        monthlyDay?: number;
        timezone?: string;
        lastDailyRun?: string;
        lastWeeklyRun?: string;
        lastMonthlyRun?: string;
      };
    }
  >;
}

export interface AgentChatResponse {
  reply: string;
  actions?: Array<{ method: string; status?: string }>;
  approvalsRequired?: boolean;
  approvalTokens?: string[];
  approvalItems?: Array<{ token: string; method: string; params?: any }>;
}

export interface AgentChatContextItem {
  id: string;
  summary?: string;
  source?: string | null;
  timestamp?: string | null;
  tags?: string[];
}

export interface AgentChatContextSource {
  key: string;
  label: string;
  count: number;
  items: AgentChatContextItem[];
}

export interface AgentChatContextResponse {
  spaceId: string;
  pageId?: string | null;
  projectId?: string | null;
  sources: AgentChatContextSource[];
}
