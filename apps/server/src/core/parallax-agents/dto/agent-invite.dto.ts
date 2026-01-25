import { IsString, IsArray, IsOptional, IsNumber, IsDateString } from 'class-validator';

export class CreateAgentInviteDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @IsString({ each: true })
  permissions: string[];

  @IsOptional()
  @IsNumber()
  usesRemaining?: number | null;

  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;
}

export class RegisterWithInviteDto {
  @IsString()
  inviteToken: string;

  @IsString()
  agentId: string;

  @IsString()
  agentName: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @IsString({ each: true })
  capabilities: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requestedPermissions?: string[];

  @IsOptional()
  metadata?: Record<string, any>;

  @IsOptional()
  @IsString()
  endpoint?: string;
}
