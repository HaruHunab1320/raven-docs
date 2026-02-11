import { IsString, IsOptional, IsEnum, IsUUID, IsUrl } from 'class-validator';

export type KnowledgeSourceType = 'url' | 'file' | 'page';
export type KnowledgeScope = 'system' | 'workspace' | 'space';
export type KnowledgeSourceStatus = 'pending' | 'processing' | 'ready' | 'error';

export class CreateKnowledgeSourceDto {
  @IsString()
  name: string;

  @IsEnum(['url', 'file', 'page'])
  type: KnowledgeSourceType;

  @IsOptional()
  @IsUrl()
  sourceUrl?: string;

  @IsOptional()
  @IsUUID()
  fileId?: string;

  @IsOptional()
  @IsUUID()
  pageId?: string;

  @IsEnum(['system', 'workspace', 'space'])
  scope: KnowledgeScope;

  @IsOptional()
  @IsUUID()
  workspaceId?: string;

  @IsOptional()
  @IsUUID()
  spaceId?: string;

  @IsOptional()
  @IsString()
  syncSchedule?: string;
}

export class SearchKnowledgeDto {
  @IsString()
  query: string;

  @IsUUID()
  workspaceId: string;

  @IsOptional()
  @IsUUID()
  spaceId?: string;

  @IsOptional()
  limit?: number;
}

export interface KnowledgeSourceRecord {
  id: string;
  name: string;
  type: KnowledgeSourceType;
  sourceUrl?: string | null;
  fileId?: string | null;
  pageId?: string | null;
  scope: KnowledgeScope;
  workspaceId?: string | null;
  spaceId?: string | null;
  status: KnowledgeSourceStatus;
  errorMessage?: string | null;
  lastSyncedAt?: Date | null;
  syncSchedule?: string | null;
  chunkCount: number;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface KnowledgeChunkRecord {
  id: string;
  sourceId: string;
  content: string;
  chunkIndex: number;
  metadata?: Record<string, any> | null;
  tokenCount?: number | null;
  scope: KnowledgeScope;
  workspaceId?: string | null;
  spaceId?: string | null;
  createdAt: Date;
}
