import { IsUUID, IsOptional, IsNumber, IsArray, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class DashboardStatsDto {
  @IsUUID()
  @IsOptional()
  spaceId?: string;
}

export class DashboardTimelineDto {
  @IsUUID()
  @IsOptional()
  spaceId?: string;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  limit?: number;
}

export class OpenQuestionsDto {
  @IsUUID()
  @IsOptional()
  spaceId?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  domainTags?: string[];
}

export class ContradictionsDto {
  @IsUUID()
  @IsOptional()
  spaceId?: string;
}

export class ActiveExperimentsDto {
  @IsUUID()
  @IsOptional()
  spaceId?: string;
}

export class PatternListDto {
  @IsUUID()
  @IsOptional()
  spaceId?: string;

  @IsString()
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  patternType?: string;
}

export class PatternActionDto {
  @IsUUID()
  id: string;
}
