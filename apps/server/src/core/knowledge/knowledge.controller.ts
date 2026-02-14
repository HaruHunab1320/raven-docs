import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { KnowledgeService } from './knowledge.service';
import { CreateKnowledgeSourceDto, SearchKnowledgeDto } from './dto/knowledge.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';

@Controller('knowledge')
@UseGuards(JwtAuthGuard)
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Post('sources')
  async createSource(
    @Body() input: CreateKnowledgeSourceDto,
    @AuthUser() user: { id: string },
  ) {
    return this.knowledgeService.createSource(input, user.id);
  }

  @Get('sources')
  async listSources(
    @Query('workspaceId') workspaceId: string,
    @Query('spaceId') spaceId?: string,
  ) {
    return this.knowledgeService.listSources({
      workspaceId,
      spaceId,
      includeSystem: true,
    });
  }

  @Get('sources/:id')
  async getSource(@Param('id') id: string) {
    return this.knowledgeService.getSource(id);
  }

  @Get('sources/:id/chunks')
  async getSourceChunks(
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.knowledgeService.getSourceChunks(id, {
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Delete('sources/:id')
  async deleteSource(@Param('id') id: string) {
    await this.knowledgeService.deleteSource(id);
    return { success: true };
  }

  @Post('sources/refresh-all')
  async refreshAllSources() {
    return this.knowledgeService.refreshAllSources();
  }

  @Post('sources/:id/refresh')
  async refreshSource(@Param('id') id: string) {
    await this.knowledgeService.refreshSource(id);
    return { success: true };
  }

  @Post('search')
  async search(@Body() body: SearchKnowledgeDto) {
    return this.knowledgeService.searchKnowledge(body);
  }
}
