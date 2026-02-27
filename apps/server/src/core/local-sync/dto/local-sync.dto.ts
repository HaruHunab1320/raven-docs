import {
  IsBoolean,
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LocalSyncMode, LocalSyncResolution } from '../local-sync.types';

export class RegisterConnectorDto {
  @IsString()
  name: string;

  @IsString()
  platform: string;

  @IsOptional()
  @IsString()
  version?: string;
}

export class ConnectorHeartbeatDto {
  @IsUUID()
  connectorId: string;
}

export class CreateLocalSyncSourceDto {
  @IsString()
  name: string;

  @IsEnum(['import_only', 'local_to_cloud', 'bidirectional'])
  mode: LocalSyncMode;

  @IsUUID()
  connectorId: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  includePatterns?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  excludePatterns?: string[];
}

export class GetSourceFilesDto {
  @IsUUID()
  sourceId: string;
}

export class GetSourceDeltasDto {
  @IsUUID()
  sourceId: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cursor?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(500)
  limit?: number;
}

export class PushBatchItemDto {
  @IsString()
  operationId: string;

  @IsString()
  relativePath: string;

  @IsString()
  content: string;

  @IsOptional()
  @IsString()
  contentType?: string;

  @IsOptional()
  @IsString()
  contentHash?: string;

  @IsOptional()
  @IsString()
  baseHash?: string;

  @IsOptional()
  @IsBoolean()
  isDelete?: boolean;
}

export class PushBatchDto {
  @IsUUID()
  sourceId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PushBatchItemDto)
  @ArrayMaxSize(100)
  items: PushBatchItemDto[];
}

export class PauseSourceDto {
  @IsUUID()
  sourceId: string;
}

export class ResolveConflictDto {
  @IsUUID()
  sourceId: string;

  @IsUUID()
  conflictId: string;

  @IsEnum(['keep_local', 'keep_raven', 'manual_merge'])
  resolution: LocalSyncResolution;

  @IsOptional()
  @IsString()
  resolvedContent?: string;
}

export class GetConflictsDto {
  @IsUUID()
  sourceId: string;
}

export class GetFileHistoryDto {
  @IsUUID()
  sourceId: string;

  @IsString()
  relativePath: string;
}

export class GetSourceFileDto {
  @IsUUID()
  sourceId: string;

  @IsString()
  relativePath: string;
}

export class UpdateSourceFileDto {
  @IsUUID()
  sourceId: string;

  @IsString()
  relativePath: string;

  @IsString()
  content: string;

  @IsOptional()
  @IsString()
  baseHash?: string;
}

export class GetConflictPreviewDto {
  @IsUUID()
  sourceId: string;

  @IsUUID()
  conflictId: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(50)
  contextLines?: number;
}
