import {
  IsString,
  IsOptional,
  IsEnum,
  IsObject,
  IsUUID,
  MaxLength,
} from 'class-validator';

export enum BugReportSourceDto {
  AUTO_SERVER = 'auto:server',
  AUTO_CLIENT = 'auto:client',
  AUTO_AGENT = 'auto:agent',
  USER_COMMAND = 'user:command',
}

export enum BugReportSeverityDto {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export class CreateBugReportDto {
  @IsString()
  @MaxLength(500)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @IsEnum(BugReportSourceDto)
  source: BugReportSourceDto;

  @IsOptional()
  @IsEnum(BugReportSeverityDto)
  severity?: BugReportSeverityDto;

  @IsOptional()
  @IsUUID()
  spaceId?: string;

  @IsOptional()
  @IsObject()
  context?: Record<string, any>;
}
