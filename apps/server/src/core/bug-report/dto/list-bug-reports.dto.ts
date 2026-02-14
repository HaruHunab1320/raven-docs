import {
  IsOptional,
  IsEnum,
  IsUUID,
  IsDateString,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { BugReportSourceDto, BugReportSeverityDto } from './create-bug-report.dto';

export enum BugReportStatusDto {
  OPEN = 'open',
  TRIAGED = 'triaged',
  IN_PROGRESS = 'in_progress',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
}

export class ListBugReportsDto {
  @IsOptional()
  @IsEnum(BugReportSourceDto)
  source?: BugReportSourceDto;

  @IsOptional()
  @IsEnum(BugReportSeverityDto)
  severity?: BugReportSeverityDto;

  @IsOptional()
  @IsEnum(BugReportStatusDto)
  status?: BugReportStatusDto;

  @IsOptional()
  @IsUUID()
  workspaceId?: string;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
