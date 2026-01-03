import { Type } from 'class-transformer';
import {
  IsArray,
  IsDate,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class MemoryIngestDto {
  @IsUUID()
  workspaceId: string;

  @IsUUID()
  @IsOptional()
  spaceId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  source: string;

  @IsOptional()
  content?: any;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  summary?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MemoryEntityInputDto)
  entities?: MemoryEntityInputDto[];

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  timestamp?: Date;
}

export class MemoryEntityInputDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  id: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  type: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  name: string;
}

export class MemoryQueryDto {
  @IsUUID()
  workspaceId: string;

  @IsUUID()
  @IsOptional()
  spaceId?: string;

  @IsString()
  @IsOptional()
  query?: string;

  @IsOptional()
  @IsArray()
  tags?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sources?: string[];

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;

  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;
}

export class MemoryDailyDto {
  @IsUUID()
  workspaceId: string;

  @IsUUID()
  @IsOptional()
  spaceId?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  date?: Date;

  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;
}

export class MemoryDaysDto {
  @IsUUID()
  workspaceId: string;

  @IsUUID()
  @IsOptional()
  spaceId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  days?: number;
}

export class MemoryGraphDto {
  @IsUUID()
  workspaceId: string;

  @IsUUID()
  @IsOptional()
  spaceId?: string;

  @IsOptional()
  @IsArray()
  tags?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sources?: string[];

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxNodes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxEdges?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  minWeight?: number;
}

export class MemoryEntityDto {
  @IsUUID()
  workspaceId: string;

  @IsUUID()
  @IsOptional()
  spaceId?: string;

  @IsString()
  entityId: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;
}

export class MemoryEntityDetailsDto {
  @IsUUID()
  workspaceId: string;

  @IsUUID()
  @IsOptional()
  spaceId?: string;

  @IsString()
  entityId: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;
}

export class MemoryLinksDto {
  @IsUUID()
  workspaceId: string;

  @IsUUID()
  @IsOptional()
  spaceId?: string;

  @IsOptional()
  @IsArray()
  taskIds?: string[];

  @IsOptional()
  @IsArray()
  goalIds?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;
}
