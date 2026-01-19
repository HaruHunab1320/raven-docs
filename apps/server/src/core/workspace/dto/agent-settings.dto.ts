import { IsBoolean, IsInt, IsObject, IsOptional, Max, Min } from 'class-validator';

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
}
