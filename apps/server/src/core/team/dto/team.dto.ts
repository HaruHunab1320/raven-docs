import {
  IsString,
  IsOptional,
  IsUUID,
  IsObject,
  IsBoolean,
  IsIn,
} from 'class-validator';

// ─── Template DTOs ───────────────────────────────────────────────────────────

export class ListTemplatesDto {
  @IsUUID()
  @IsOptional()
  workspaceId?: string;
}

export class GetTemplateDto {
  @IsUUID()
  templateId: string;
}

export class CreateTemplateDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  version?: string;

  @IsObject()
  orgPattern: Record<string, any>;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}

export class UpdateTemplateDto {
  @IsUUID()
  templateId: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  version?: string;

  @IsObject()
  @IsOptional()
  orgPattern?: Record<string, any>;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}

export class DuplicateTemplateDto {
  @IsUUID()
  templateId: string;
}

export class DeleteTemplateDto {
  @IsUUID()
  templateId: string;
}

// ─── Deployment DTOs ─────────────────────────────────────────────────────────

export class DeployTeamDto {
  @IsUUID()
  templateId: string;

  @IsUUID()
  spaceId: string;

  @IsUUID()
  @IsOptional()
  projectId?: string;

  @IsString()
  @IsOptional()
  teamName?: string;
}

export class DeployOrgPatternDto {
  @IsObject()
  orgPattern: Record<string, any>;

  @IsUUID()
  spaceId: string;

  @IsUUID()
  @IsOptional()
  projectId?: string;

  @IsString()
  @IsOptional()
  teamName?: string;
}

export class TeamDeploymentIdDto {
  @IsUUID()
  deploymentId: string;
}

export class ListDeploymentsDto {
  @IsUUID()
  @IsOptional()
  spaceId?: string;

  @IsString()
  @IsOptional()
  status?: string;

  @IsBoolean()
  @IsOptional()
  includeTornDown?: boolean;
}

export class RedeployTeamDto {
  @IsUUID()
  sourceDeploymentId: string;

  @IsUUID()
  @IsOptional()
  spaceId?: string;

  @IsUUID()
  @IsOptional()
  projectId?: string;

  @IsIn(['none', 'carry_all'])
  @IsOptional()
  memoryPolicy?: 'none' | 'carry_all';

  @IsString()
  @IsOptional()
  teamName?: string;
}

export class RenameTeamDto {
  @IsUUID()
  deploymentId: string;

  @IsString()
  teamName: string;
}
