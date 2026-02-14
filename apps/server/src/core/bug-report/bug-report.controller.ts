import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { BugReportService } from './bug-report.service';
import { CreateBugReportDto } from './dto/create-bug-report.dto';
import { CreateAutoBugReportDto } from './dto/create-auto-bug-report.dto';
import { ListBugReportsDto } from './dto/list-bug-reports.dto';
import { UpdateBugReportDto } from './dto/update-bug-report.dto';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { User, Workspace } from '@raven-docs/db/types/entity.types';

@UseGuards(JwtAuthGuard)
@Controller('bug-reports')
export class BugReportController {
  constructor(private readonly bugReportService: BugReportService) {}

  @HttpCode(HttpStatus.OK)
  @Post('create')
  async create(
    @Body() createBugReportDto: CreateBugReportDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.bugReportService.create(
      user.id,
      workspace.id,
      createBugReportDto,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('auto')
  async createAuto(
    @Body() createAutoBugReportDto: CreateAutoBugReportDto,
    @AuthUser() user: User,
  ) {
    return this.bugReportService.createAutoReport(
      createAutoBugReportDto,
      user.id,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('list')
  async list(@Body() listBugReportsDto: ListBugReportsDto) {
    return this.bugReportService.list(listBugReportsDto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('get')
  async getById(@Body() body: { bugReportId: string }) {
    return this.bugReportService.getById(body.bugReportId);
  }

  @HttpCode(HttpStatus.OK)
  @Post('update')
  async update(@Body() updateBugReportDto: UpdateBugReportDto) {
    return this.bugReportService.update(updateBugReportDto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('delete')
  async delete(@Body() body: { bugReportId: string }) {
    return this.bugReportService.delete(body.bugReportId);
  }
}
