import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { BugReportSeverityDto } from './create-bug-report.dto';
import { BugReportStatusDto } from './list-bug-reports.dto';

export class UpdateBugReportDto {
  @IsUUID()
  bugReportId: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @IsOptional()
  @IsEnum(BugReportSeverityDto)
  severity?: BugReportSeverityDto;

  @IsOptional()
  @IsEnum(BugReportStatusDto)
  status?: BugReportStatusDto;
}
