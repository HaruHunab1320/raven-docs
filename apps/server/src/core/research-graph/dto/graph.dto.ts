import {
  IsArray,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { RESEARCH_EDGE_TYPES, ResearchEdgeType } from '../research-graph.service';

export class CreateRelationshipDto {
  @IsUUID()
  fromPageId: string;

  @IsUUID()
  toPageId: string;

  @IsEnum(RESEARCH_EDGE_TYPES)
  type: ResearchEdgeType;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class RemoveRelationshipDto {
  @IsUUID()
  fromPageId: string;

  @IsUUID()
  toPageId: string;

  @IsEnum(RESEARCH_EDGE_TYPES)
  type: ResearchEdgeType;
}

export class GetRelationshipsDto {
  @IsUUID()
  pageId: string;

  @IsOptional()
  @IsString()
  direction?: 'outgoing' | 'incoming' | 'both';

  @IsOptional()
  @IsArray()
  types?: ResearchEdgeType[];
}

export class GetRelatedPagesDto {
  @IsUUID()
  pageId: string;

  @IsOptional()
  maxDepth?: number;

  @IsOptional()
  @IsArray()
  edgeTypes?: ResearchEdgeType[];
}

export class GetEvidenceChainDto {
  @IsUUID()
  hypothesisPageId: string;
}

export class GetDomainGraphDto {
  @IsArray()
  @IsString({ each: true })
  domainTags: string[];
}
