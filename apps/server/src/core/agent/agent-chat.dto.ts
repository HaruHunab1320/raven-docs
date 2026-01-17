import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

export class AgentChatDto {
  @IsUUID()
  spaceId: string;

  @IsString()
  message: string;

  @IsOptional()
  @IsString()
  pageId?: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsOptional()
  @IsBoolean()
  autoApprove?: boolean;

  @IsOptional()
  @IsBoolean()
  internal?: boolean;
}
