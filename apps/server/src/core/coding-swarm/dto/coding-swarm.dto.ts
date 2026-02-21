import { IsString, IsOptional, IsUUID, IsNumber, IsObject } from 'class-validator';
import { Type } from 'class-transformer';

export class ExecuteSwarmDto {
  @IsString()
  @IsOptional()
  repoUrl?: string;

  @IsString()
  taskDescription: string;

  @IsUUID()
  @IsOptional()
  experimentId?: string;

  @IsUUID()
  @IsOptional()
  spaceId?: string;

  @IsString()
  @IsOptional()
  agentType?: string;

  @IsString()
  @IsOptional()
  baseBranch?: string;

  @IsString()
  @IsOptional()
  branchName?: string;

  @IsObject()
  @IsOptional()
  taskContext?: Record<string, any>;
}

export class SwarmStatusDto {
  @IsUUID()
  executionId: string;
}

export class ListSwarmDto {
  @IsString()
  @IsOptional()
  status?: string;

  @IsUUID()
  @IsOptional()
  experimentId?: string;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  limit?: number;
}

export class StopSwarmDto {
  @IsUUID()
  executionId: string;
}

export class SwarmLogsDto {
  @IsUUID()
  executionId: string;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  limit?: number;
}
