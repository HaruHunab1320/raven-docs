import {
  IsString,
  IsOptional,
  IsUUID,
  IsObject,
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
}

export class DeployOrgPatternDto {
  @IsObject()
  orgPattern: Record<string, any>;

  @IsUUID()
  spaceId: string;

  @IsUUID()
  @IsOptional()
  projectId?: string;
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
}
