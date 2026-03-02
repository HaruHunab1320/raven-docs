import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { Workspace, User } from '@raven-docs/db/types/entity.types';
import { TeamDeploymentService } from './team-deployment.service';
import { TeamTemplateRepo } from '../../database/repos/team/team-template.repo';
import {
  ListTemplatesDto,
  GetTemplateDto,
  CreateTemplateDto,
  UpdateTemplateDto,
  DuplicateTemplateDto,
  DeleteTemplateDto,
  DeployTeamDto,
  DeployOrgPatternDto,
  TeamDeploymentIdDto,
  ListDeploymentsDto,
  RedeployTeamDto,
  RenameTeamDto,
  AssignTeamTaskDto,
} from './dto/team.dto';
import { OrgPattern } from './org-chart.types';
import { TeamTemplateValidationService } from './team-template-validation.service';
import { StallClassifierService } from '../coding-swarm/stall-classifier.service';

@Controller('teams')
@UseGuards(JwtAuthGuard)
export class TeamController {
  constructor(
    private readonly deploymentService: TeamDeploymentService,
    private readonly templateRepo: TeamTemplateRepo,
    private readonly templateValidation: TeamTemplateValidationService,
    private readonly stallClassifier: StallClassifierService,
  ) {}

  // ─── Template Endpoints ──────────────────────────────────────────────────

  @Post('templates/list')
  @HttpCode(HttpStatus.OK)
  async listTemplates(
    @Body() dto: ListTemplatesDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.templateRepo.listByWorkspace(workspace.id);
  }

  @Post('templates/get')
  @HttpCode(HttpStatus.OK)
  async getTemplate(@Body() dto: GetTemplateDto) {
    const template = await this.templateRepo.findById(dto.templateId);
    if (!template) {
      throw new NotFoundException('Template not found');
    }
    return template;
  }

  @Post('templates/create')
  @HttpCode(HttpStatus.OK)
  async createTemplate(
    @Body() dto: CreateTemplateDto,
    @AuthWorkspace() workspace: Workspace,
    @AuthUser() user: User,
  ) {
    const validation = this.templateValidation.validateOrgPatternCapabilities(
      dto.orgPattern,
    );
    if (!validation.valid) {
      throw new BadRequestException({
        message: 'Template contains invalid role capabilities',
        invalidCapabilities: validation.invalidCapabilities,
      });
    }

    return this.templateRepo.create({
      workspaceId: workspace.id,
      name: dto.name,
      description: dto.description,
      version: dto.version,
      orgPattern: dto.orgPattern,
      metadata: dto.metadata,
      createdBy: user.id,
    });
  }

  @Post('templates/update')
  @HttpCode(HttpStatus.OK)
  async updateTemplate(
    @Body() dto: UpdateTemplateDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const existing = await this.templateRepo.findById(dto.templateId);
    if (!existing) {
      throw new NotFoundException('Template not found');
    }
    if (existing.isSystem) {
      throw new ForbiddenException('Cannot modify system templates');
    }

    if (dto.orgPattern) {
      const validation = this.templateValidation.validateOrgPatternCapabilities(
        dto.orgPattern,
      );
      if (!validation.valid) {
        throw new BadRequestException({
          message: 'Template contains invalid role capabilities',
          invalidCapabilities: validation.invalidCapabilities,
        });
      }
    }

    return this.templateRepo.update(dto.templateId, {
      name: dto.name,
      description: dto.description,
      version: dto.version,
      orgPattern: dto.orgPattern,
      metadata: dto.metadata,
    });
  }

  @Post('templates/duplicate')
  @HttpCode(HttpStatus.OK)
  async duplicateTemplate(
    @Body() dto: DuplicateTemplateDto,
    @AuthWorkspace() workspace: Workspace,
    @AuthUser() user: User,
  ) {
    const result = await this.templateRepo.duplicate(
      dto.templateId,
      workspace.id,
      user.id,
    );
    if (!result) {
      throw new NotFoundException('Template not found');
    }
    return result;
  }

  @Post('templates/delete')
  @HttpCode(HttpStatus.OK)
  async deleteTemplate(@Body() dto: DeleteTemplateDto) {
    const existing = await this.templateRepo.findById(dto.templateId);
    if (!existing) {
      throw new NotFoundException('Template not found');
    }
    if (existing.isSystem) {
      throw new ForbiddenException('Cannot delete system templates');
    }

    return this.templateRepo.softDelete(dto.templateId);
  }

  // ─── Deployment Endpoints ────────────────────────────────────────────────

  @Post('deploy')
  @HttpCode(HttpStatus.OK)
  async deployFromTemplate(
    @Body() dto: DeployTeamDto,
    @AuthWorkspace() workspace: Workspace,
    @AuthUser() user: User,
  ) {
    return this.deploymentService.deployFromTemplateId(
      workspace.id,
      dto.spaceId,
      dto.templateId,
      user.id,
      { projectId: dto.projectId, teamName: dto.teamName },
    );
  }

  @Post('deploy-pattern')
  @HttpCode(HttpStatus.OK)
  async deployFromPattern(
    @Body() dto: DeployOrgPatternDto,
    @AuthWorkspace() workspace: Workspace,
    @AuthUser() user: User,
  ) {
    const validation = this.templateValidation.validateOrgPatternCapabilities(
      dto.orgPattern,
    );
    if (!validation.valid) {
      throw new BadRequestException({
        message: 'Org pattern contains invalid role capabilities',
        invalidCapabilities: validation.invalidCapabilities,
      });
    }

    return this.deploymentService.deployFromOrgPattern(
      workspace.id,
      dto.spaceId,
      dto.orgPattern as unknown as OrgPattern,
      user.id,
      { projectId: dto.projectId, teamName: dto.teamName },
    );
  }

  @Post('deployments/list')
  @HttpCode(HttpStatus.OK)
  async listDeployments(
    @Body() dto: ListDeploymentsDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.deploymentService.listDeployments(workspace.id, {
      spaceId: dto.spaceId,
      status: dto.status,
      includeTornDown: dto.includeTornDown,
    });
  }

  @Post('deployments/redeploy')
  @HttpCode(HttpStatus.OK)
  async redeploy(
    @Body() dto: RedeployTeamDto,
    @AuthWorkspace() workspace: Workspace,
    @AuthUser() user: User,
  ) {
    return this.deploymentService.redeployDeployment(
      workspace.id,
      dto.sourceDeploymentId,
      user.id,
      {
        spaceId: dto.spaceId,
        projectId: dto.projectId,
        memoryPolicy: dto.memoryPolicy,
        teamName: dto.teamName,
      },
    );
  }

  @Post('deployments/rename')
  @HttpCode(HttpStatus.OK)
  async renameDeployment(
    @Body() dto: RenameTeamDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.deploymentService.renameDeployment(
      workspace.id,
      dto.deploymentId,
      dto.teamName,
    );
  }

  @Post('deployments/assign-task')
  @HttpCode(HttpStatus.OK)
  async assignTask(
    @Body() dto: AssignTeamTaskDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.deploymentService.assignTargetTask(
      workspace.id,
      dto.deploymentId,
      dto.taskId,
      dto.experimentId,
    );
  }

  @Post('deployments/status')
  @HttpCode(HttpStatus.OK)
  async getDeploymentStatus(
    @Body() dto: TeamDeploymentIdDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.deploymentService.getDeployment(workspace.id, dto.deploymentId);
  }

  @Post('deployments/trigger')
  @HttpCode(HttpStatus.OK)
  async triggerRun(
    @Body() dto: TeamDeploymentIdDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.deploymentService.triggerTeamRun(workspace.id, dto.deploymentId);
  }

  @Post('deployments/pause')
  @HttpCode(HttpStatus.OK)
  async pauseDeployment(
    @Body() dto: TeamDeploymentIdDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.deploymentService.pauseDeployment(workspace.id, dto.deploymentId);
  }

  @Post('deployments/resume')
  @HttpCode(HttpStatus.OK)
  async resumeDeployment(
    @Body() dto: TeamDeploymentIdDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.deploymentService.resumeDeployment(workspace.id, dto.deploymentId);
  }

  @Post('deployments/reset')
  @HttpCode(HttpStatus.OK)
  async resetTeam(
    @Body() dto: TeamDeploymentIdDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.deploymentService.resetTeam(workspace.id, dto.deploymentId);
  }

  @Post('deployments/teardown')
  @HttpCode(HttpStatus.OK)
  async teardownDeployment(
    @Body() dto: TeamDeploymentIdDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.deploymentService.teardownTeam(workspace.id, dto.deploymentId);
  }

  @Post('deployments/workflow/start')
  @HttpCode(HttpStatus.OK)
  async startWorkflow(
    @Body() dto: TeamDeploymentIdDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.deploymentService.triggerTeamRun(workspace.id, dto.deploymentId);
  }

  @Post('classify-stall')
  @HttpCode(HttpStatus.OK)
  async classifyStall(
    @Body() body: { recentOutput: string; stallDurationMs: number; agentType?: string; role?: string },
  ) {
    const classification = await this.stallClassifier.classify(
      body.recentOutput,
      body.stallDurationMs,
      { agentType: body.agentType, role: body.role },
    );
    return classification;
  }
}
