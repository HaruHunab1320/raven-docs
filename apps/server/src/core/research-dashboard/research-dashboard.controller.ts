import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { Workspace } from '@raven-docs/db/types/entity.types';
import { ResearchDashboardService } from './research-dashboard.service';
import {
  DashboardStatsDto,
  DashboardTimelineDto,
  OpenQuestionsDto,
  ContradictionsDto,
  ActiveExperimentsDto,
  HypothesesDto,
  PatternListDto,
  PatternActionDto,
} from './dto/dashboard.dto';

@Controller('research-dashboard')
@UseGuards(JwtAuthGuard)
export class ResearchDashboardController {
  constructor(
    private readonly dashboardService: ResearchDashboardService,
  ) {}

  @Post('stats')
  @HttpCode(HttpStatus.OK)
  async getStats(
    @Body() dto: DashboardStatsDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.dashboardService.getStats(workspace.id, dto.spaceId);
  }

  @Post('timeline')
  @HttpCode(HttpStatus.OK)
  async getTimeline(
    @Body() dto: DashboardTimelineDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.dashboardService.getTimeline(
      workspace.id,
      dto.spaceId,
      dto.limit,
    );
  }

  @Post('open-questions')
  @HttpCode(HttpStatus.OK)
  async getOpenQuestions(
    @Body() dto: OpenQuestionsDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.dashboardService.getOpenQuestions(
      workspace.id,
      dto.spaceId,
      dto.domainTags,
    );
  }

  @Post('contradictions')
  @HttpCode(HttpStatus.OK)
  async getContradictions(
    @Body() dto: ContradictionsDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.dashboardService.getContradictions(workspace.id, dto.spaceId);
  }

  @Post('active-experiments')
  @HttpCode(HttpStatus.OK)
  async getActiveExperiments(
    @Body() dto: ActiveExperimentsDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.dashboardService.getActiveExperiments(
      workspace.id,
      dto.spaceId,
    );
  }

  @Post('hypotheses')
  @HttpCode(HttpStatus.OK)
  async getHypotheses(
    @Body() dto: HypothesesDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.dashboardService.getHypotheses(workspace.id, dto.spaceId);
  }

  @Post('patterns')
  @HttpCode(HttpStatus.OK)
  async getPatterns(
    @Body() dto: PatternListDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.dashboardService.getPatterns(workspace.id, {
      spaceId: dto.spaceId,
      status: dto.status,
      patternType: dto.patternType,
    });
  }

  @Post('patterns/acknowledge')
  @HttpCode(HttpStatus.OK)
  async acknowledgePattern(
    @Body() dto: PatternActionDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.dashboardService.acknowledgePattern(dto.id);
  }

  @Post('patterns/dismiss')
  @HttpCode(HttpStatus.OK)
  async dismissPattern(
    @Body() dto: PatternActionDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.dashboardService.dismissPattern(dto.id);
  }
}
