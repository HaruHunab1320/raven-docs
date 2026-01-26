import {
  IsArray,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export enum AgentType {
  CLAUDE_CODE = 'claude-code',
  CODEX = 'codex',
  GEMINI_CLI = 'gemini-cli',
  AIDER = 'aider',
  CUSTOM = 'custom',
}

export class SpawnAgentRequestDto {
  @IsEnum(AgentType)
  agentType: AgentType;

  @IsInt()
  @Min(1)
  count: number;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  capabilities?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  taskId?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, any>;
}

export class TestRuntimeConnectionDto {
  @IsOptional()
  @IsString()
  endpoint?: string;
}

export class RuntimeHeartbeatDto {
  @IsString()
  runtimeId: string;

  @IsOptional()
  @IsInt()
  activeAgents?: number;

  @IsOptional()
  @IsString()
  version?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export interface SpawnResult {
  success: boolean;
  spawnedAgents: Array<{
    id: string;
    name: string;
    type: AgentType;
    status: string;
  }>;
  errors?: string[];
}

export interface RuntimeStatusResult {
  connected: boolean;
  lastHeartbeat?: Date;
  activeAgents?: number;
  version?: string;
  error?: string;
}
