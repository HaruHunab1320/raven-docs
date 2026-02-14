import {
  IsString,
  IsOptional,
  IsEnum,
  IsObject,
  IsUUID,
  MaxLength,
  IsDateString,
} from 'class-validator';
import { BugReportSourceDto, BugReportSeverityDto } from './create-bug-report.dto';

export class CreateAutoBugReportDto {
  @IsEnum(BugReportSourceDto)
  source: BugReportSourceDto;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  errorMessage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50000)
  errorStack?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  errorCode?: string;

  @IsOptional()
  @IsEnum(BugReportSeverityDto)
  severity?: BugReportSeverityDto;

  @IsOptional()
  @IsUUID()
  workspaceId?: string;

  @IsOptional()
  @IsUUID()
  spaceId?: string;

  @IsOptional()
  @IsObject()
  context?: Record<string, any>;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}
