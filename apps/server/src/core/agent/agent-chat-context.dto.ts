import { IsOptional, IsString, IsUUID } from 'class-validator';

export class AgentChatContextDto {
  @IsUUID()
  spaceId: string;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsString()
  pageId?: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  sessionId?: string;
}
