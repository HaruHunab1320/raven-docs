import {
  IsArray,
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PageTypeSchemaFieldDto {
  @IsString()
  type: 'text' | 'text[]' | 'enum' | 'tag[]' | 'page_ref' | 'json' | 'boolean' | 'number';

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  values?: string[];

  @IsOptional()
  @IsString()
  pageType?: string;
}

export class PageTypeDefinitionDto {
  @IsString()
  type: string;

  @IsString()
  label: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsArray()
  @IsString({ each: true })
  statusFlow: string[];

  @IsObject()
  metadataSchema: Record<string, PageTypeSchemaFieldDto>;
}

export class EdgeTypeDefinitionDto {
  @IsString()
  name: string;

  @IsString()
  label: string;

  @IsString()
  from: string;

  @IsString()
  to: string;

  @IsOptional()
  @IsString()
  color?: string;
}

export class TeamRoleDto {
  @IsString()
  role: string;

  @IsString()
  systemPrompt: string;

  @IsArray()
  @IsString({ each: true })
  capabilities: string[];

  count: number;
}

export class TeamTemplateDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TeamRoleDto)
  roles: TeamRoleDto[];
}

export class PatternRuleDto {
  @IsString()
  type: string;

  @IsString()
  condition: string;

  @IsOptional()
  @IsObject()
  params?: Record<string, any>;

  @IsString()
  action: 'notify' | 'flag' | 'surface' | 'create_task';
}

export class IntelligenceSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  profileType?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PageTypeDefinitionDto)
  pageTypes?: PageTypeDefinitionDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EdgeTypeDefinitionDto)
  edgeTypes?: EdgeTypeDefinitionDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TeamTemplateDto)
  teamTemplates?: TeamTemplateDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PatternRuleDto)
  patternRules?: PatternRuleDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dashboardWidgets?: string[];
}
