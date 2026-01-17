import { IsOptional, IsString, IsUUID } from 'class-validator';

export class AgentPlanDecisionDto {
  @IsUUID()
  spaceId: string;

  @IsUUID()
  planId: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
