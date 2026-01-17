import { IsArray, IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

export type AgentChatUiMessage = {
  role?: 'system' | 'user' | 'assistant';
  parts?: Array<{ type?: string; text?: string }>;
  text?: string;
  content?: string;
};

export class AgentChatUiDto {
  @IsUUID()
  spaceId: string;

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
  @IsArray()
  messages?: AgentChatUiMessage[];
}
