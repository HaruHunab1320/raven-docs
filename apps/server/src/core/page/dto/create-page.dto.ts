import { IsObject, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreatePageDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsString()
  parentPageId?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  pageType?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @IsUUID()
  spaceId: string;
}
