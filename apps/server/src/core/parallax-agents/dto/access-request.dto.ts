import {
  IsString,
  IsArray,
  IsOptional,
  IsObject,
  IsNotEmpty,
  ArrayMinSize,
} from 'class-validator';

export class AgentAccessRequestDto {
  @IsString()
  @IsNotEmpty()
  agentId: string;

  @IsString()
  @IsNotEmpty()
  agentName: string;

  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  capabilities: string[];

  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  requestedPermissions: string[];

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @IsOptional()
  @IsString()
  justification?: string;

  @IsOptional()
  @IsString()
  endpoint?: string;
}
