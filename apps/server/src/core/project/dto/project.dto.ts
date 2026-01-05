import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PaginationOptionsDto } from '../../../common/dto/pagination-options.dto';

export class ProjectIdDto {
  @IsUUID()
  projectId: string;
}

export class CreateProjectDto {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsUUID()
  spaceId: string;

  @IsString()
  @IsOptional()
  icon?: string;

  @IsString()
  @IsOptional()
  color?: string;

  @IsString()
  @IsOptional()
  coverImage?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startDate?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;
}

export class UpdateProjectDto {
  @IsUUID()
  projectId: string;

  @IsString()
  @MaxLength(255)
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  icon?: string;

  @IsString()
  @IsOptional()
  color?: string;

  @IsString()
  @IsOptional()
  coverImage?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startDate?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;
}

export class ProjectListDto extends PaginationOptionsDto {
  @IsUUID()
  spaceId: string;

  @IsOptional()
  @IsBoolean()
  includeArchived?: boolean;

  @IsOptional()
  @IsString()
  searchTerm?: string;
}

export class ProjectArchiveDto {
  @IsUUID()
  projectId: string;

  @IsBoolean()
  isArchived: boolean;
}

export class ProjectTrashDto extends PaginationOptionsDto {
  @IsUUID()
  spaceId: string;
}

export class ProjectPlaybookDraftDto {
  @IsUUID()
  projectId: string;

  @IsString()
  @MaxLength(10000)
  brief: string;
}

export class ProjectPlaybookChatDraftDto {
  @IsUUID()
  projectId: string;

  @IsOptional()
  @IsString()
  pageId?: string;

  @IsOptional()
  @IsString()
  sessionId?: string;
}

export class ProjectPlaybookChatSummaryDto {
  @IsUUID()
  projectId: string;

  @IsOptional()
  @IsString()
  pageId?: string;

  @IsOptional()
  @IsString()
  sessionId?: string;
}
