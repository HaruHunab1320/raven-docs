import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ResearchGraphService } from './research-graph.service';
import {
  CreateRelationshipDto,
  RemoveRelationshipDto,
  GetRelationshipsDto,
  GetRelatedPagesDto,
  GetEvidenceChainDto,
  GetDomainGraphDto,
} from './dto/graph.dto';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { User, Workspace } from '@raven-docs/db/types/entity.types';

@UseGuards(JwtAuthGuard)
@Controller('research-graph')
export class ResearchGraphController {
  constructor(
    private readonly researchGraphService: ResearchGraphService,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('/relationships/create')
  async createRelationship(
    @Body() dto: CreateRelationshipDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.researchGraphService.createRelationship({
      fromPageId: dto.fromPageId,
      toPageId: dto.toPageId,
      type: dto.type,
      createdBy: user.id,
      metadata: dto.metadata,
    });
    return { success: true };
  }

  @HttpCode(HttpStatus.OK)
  @Post('/relationships/remove')
  async removeRelationship(
    @Body() dto: RemoveRelationshipDto,
    @AuthWorkspace() _workspace: Workspace,
  ) {
    await this.researchGraphService.removeRelationship(
      dto.fromPageId,
      dto.toPageId,
      dto.type,
    );
    return { success: true };
  }

  @HttpCode(HttpStatus.OK)
  @Post('/relationships/list')
  async getRelationships(
    @Body() dto: GetRelationshipsDto,
    @AuthWorkspace() _workspace: Workspace,
  ) {
    return this.researchGraphService.getRelationships(dto.pageId, {
      direction: dto.direction,
      types: dto.types,
    });
  }

  @HttpCode(HttpStatus.OK)
  @Post('/related-pages')
  async getRelatedPages(
    @Body() dto: GetRelatedPagesDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.researchGraphService.getRelatedPages(dto.pageId, {
      maxDepth: dto.maxDepth,
      edgeTypes: dto.edgeTypes,
      workspaceId: workspace.id,
    });
  }

  @HttpCode(HttpStatus.OK)
  @Post('/evidence-chain')
  async getEvidenceChain(
    @Body() dto: GetEvidenceChainDto,
    @AuthWorkspace() _workspace: Workspace,
  ) {
    return this.researchGraphService.getEvidenceChain(dto.hypothesisPageId);
  }

  @HttpCode(HttpStatus.OK)
  @Post('/domain-graph')
  async getDomainGraph(
    @Body() dto: GetDomainGraphDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.researchGraphService.getDomainGraph(workspace.id, dto.domainTags);
  }
}
