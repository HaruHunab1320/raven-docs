import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotFoundException,
  ForbiddenException,
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
} from './dto/team.dto';
import { OrgPattern } from './org-chart.types';

@Controller('teams')
@UseGuards(JwtAuthGuard)
export class TeamController {
  constructor(
    private readonly deploymentService: TeamDeploymentService,
    private readonly templateRepo: TeamTemplateRepo,
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
      { projectId: dto.projectId },
    );
  }

  @Post('deploy-pattern')
  @HttpCode(HttpStatus.OK)
  async deployFromPattern(
    @Body() dto: DeployOrgPatternDto,
    @AuthWorkspace() workspace: Workspace,
    @AuthUser() user: User,
  ) {
    return this.deploymentService.deployFromOrgPattern(
      workspace.id,
      dto.spaceId,
      dto.orgPattern as unknown as OrgPattern,
      user.id,
      { projectId: dto.projectId },
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
    });
  }

  @Post('deployments/status')
  @HttpCode(HttpStatus.OK)
  async getDeploymentStatus(@Body() dto: TeamDeploymentIdDto) {
    return this.deploymentService.getDeployment(dto.deploymentId);
  }

  @Post('deployments/trigger')
  @HttpCode(HttpStatus.OK)
  async triggerRun(@Body() dto: TeamDeploymentIdDto) {
    return this.deploymentService.triggerTeamRun(dto.deploymentId);
  }

  @Post('deployments/pause')
  @HttpCode(HttpStatus.OK)
  async pauseDeployment(@Body() dto: TeamDeploymentIdDto) {
    return this.deploymentService.pauseDeployment(dto.deploymentId);
  }

  @Post('deployments/resume')
  @HttpCode(HttpStatus.OK)
  async resumeDeployment(@Body() dto: TeamDeploymentIdDto) {
    return this.deploymentService.resumeDeployment(dto.deploymentId);
  }

  @Post('deployments/teardown')
  @HttpCode(HttpStatus.OK)
  async teardownDeployment(@Body() dto: TeamDeploymentIdDto) {
    return this.deploymentService.teardownTeam(dto.deploymentId);
  }

  @Post('deployments/workflow/start')
  @HttpCode(HttpStatus.OK)
  async startWorkflow(@Body() dto: TeamDeploymentIdDto) {
    return this.deploymentService.startWorkflow(dto.deploymentId);
  }
}
