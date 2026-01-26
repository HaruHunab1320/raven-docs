import { IsBoolean, IsEnum, IsInt, IsObject, IsOptional, IsString, IsUrl, Max, Min } from 'class-validator';

export enum AgentHostingMode {
  LOCAL = 'local',
  PARALLAX = 'parallax',
  CUSTOM = 'custom',
}

export enum RuntimeAuthType {
  API_KEY = 'api_key',
  NONE = 'none',
}

export class AgentSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  enableDailySummary?: boolean;

  @IsOptional()
  @IsBoolean()
  enableAutoTriage?: boolean;

  @IsOptional()
  @IsBoolean()
  enableMemoryAutoIngest?: boolean;

  @IsOptional()
  @IsBoolean()
  enableGoalAutoLink?: boolean;

  @IsOptional()
  @IsBoolean()
  enablePlannerLoop?: boolean;

  @IsOptional()
  @IsBoolean()
  enableProactiveQuestions?: boolean;

  @IsOptional()
  @IsBoolean()
  enableAutonomousLoop?: boolean;

  @IsOptional()
  @IsBoolean()
  enableMemoryInsights?: boolean;

  @IsOptional()
  @IsBoolean()
  allowAgentChat?: boolean;

  @IsOptional()
  @IsBoolean()
  allowTaskWrites?: boolean;

  @IsOptional()
  @IsBoolean()
  allowPageWrites?: boolean;

  @IsOptional()
  @IsBoolean()
  allowProjectWrites?: boolean;

  @IsOptional()
  @IsBoolean()
  allowGoalWrites?: boolean;

  @IsOptional()
  @IsBoolean()
  allowResearchWrites?: boolean;

  @IsOptional()
  @IsBoolean()
  allowPublicAgentRegistration?: boolean;

  @IsOptional()
  @IsInt()
  @Min(50)
  @Max(2000)
  chatDraftLimit?: number;

  @IsOptional()
  @IsObject()
  policy?: {
    allowAutoApply?: string[];
    requireApproval?: string[];
    deny?: string[];
  };

  @IsOptional()
  @IsObject()
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
    lastWeeklyReviewRun?: string;
    lastMonthlyRun?: string;
  };

  @IsOptional()
  @IsObject()
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
        lastWeeklyReviewRun?: string;
        lastMonthlyRun?: string;
      };
    }
  >;

  // Agent Runtime Hosting Configuration
  @IsOptional()
  @IsEnum(AgentHostingMode)
  hostingMode?: AgentHostingMode;

  @IsOptional()
  @IsString()
  runtimeEndpoint?: string;

  @IsOptional()
  @IsEnum(RuntimeAuthType)
  runtimeAuthType?: RuntimeAuthType;

  @IsOptional()
  @IsString()
  runtimeApiKey?: string;

  @IsOptional()
  @IsString()
  defaultRegion?: string;

  @IsOptional()
  @IsObject()
  runtimeStatus?: {
    connected?: boolean;
    lastHeartbeat?: string;
    activeAgents?: number;
    version?: string;
    error?: string;
  };
}
