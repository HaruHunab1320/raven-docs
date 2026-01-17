import { IsIn, IsOptional, IsUUID } from 'class-validator';

export class AgentPlanDto {
  @IsUUID()
  spaceId: string;

  @IsOptional()
  @IsIn(['daily', 'short', 'mid', 'long'])
  horizon?: 'daily' | 'short' | 'mid' | 'long';
}
