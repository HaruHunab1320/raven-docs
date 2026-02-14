import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  BugReportRepo,
  BugReport,
  BugReportSeverity,
  BugReportSource,
  BugReportStatus,
  InsertableBugReport,
  BugReportListFilters,
  ExtendedBugReport,
} from '../../database/repos/bug-report/bug-report.repo';
import { BugContextService, UserJourneyContext } from './bug-context.service';
import { PaginationResult } from '../../database/pagination/pagination';
import {
  CreateBugReportDto,
  BugReportSeverityDto,
  BugReportSourceDto,
} from './dto/create-bug-report.dto';
import { CreateAutoBugReportDto } from './dto/create-auto-bug-report.dto';
import { UpdateBugReportDto } from './dto/update-bug-report.dto';
import { ListBugReportsDto, BugReportStatusDto } from './dto/list-bug-reports.dto';

@Injectable()
export class BugReportService {
  private readonly logger = new Logger(BugReportService.name);

  constructor(
    private readonly bugReportRepo: BugReportRepo,
    private readonly bugContextService: BugContextService,
  ) {}

  async create(
    userId: string,
    workspaceId: string,
    dto: CreateBugReportDto,
  ): Promise<BugReport> {
    // Gather user journey for context
    let userJourney: UserJourneyContext | null = null;
    try {
      const journey = await this.bugContextService.gatherUserJourney({
        workspaceId,
        spaceId: dto.spaceId,
        userId,
        minutesBack: 30,
      });
      userJourney = this.bugContextService.sanitizeUserJourney(journey);
    } catch (error: any) {
      this.logger.warn(`Failed to gather user journey: ${error?.message || error}`);
    }

    const insertable: InsertableBugReport = {
      workspaceId,
      spaceId: dto.spaceId || null,
      reporterId: userId,
      source: dto.source as BugReportSource,
      severity: (dto.severity as BugReportSeverity) || 'medium',
      status: 'open',
      title: dto.title,
      description: dto.description || null,
      context: dto.context || null,
      userJourney: userJourney
        ? {
            recentActions: userJourney.recentActions,
            sessionStartedAt: userJourney.sessionStartedAt?.toISOString() || null,
          }
        : null,
      occurredAt: new Date(),
    };

    const bugReport = await this.bugReportRepo.insert(insertable);

    this.logger.log(
      `Bug report created: ${bugReport.id} by user ${userId} in workspace ${workspaceId}`,
    );

    return bugReport;
  }

  async createAutoReport(
    dto: CreateAutoBugReportDto,
    reporterId?: string,
  ): Promise<BugReport> {
    // Check for duplicate within last 24 hours
    if (dto.errorMessage) {
      const duplicate = await this.bugReportRepo.findDuplicate(
        dto.errorMessage,
        dto.source as BugReportSource,
        24,
      );

      if (duplicate) {
        await this.bugReportRepo.incrementOccurrence(duplicate.id);
        this.logger.log(
          `Incremented occurrence count for existing bug report: ${duplicate.id}`,
        );
        return duplicate;
      }
    }

    // Auto-determine severity if not provided
    const severity = dto.severity
      ? (dto.severity as BugReportSeverity)
      : this.determineSeverity(dto);

    // Generate title if not provided
    const title = dto.title || this.generateTitle(dto);

    // Gather user journey if we have enough context
    let userJourney: UserJourneyContext | null = null;
    if (dto.workspaceId && reporterId) {
      try {
        const journey = await this.bugContextService.gatherUserJourney({
          workspaceId: dto.workspaceId,
          spaceId: dto.spaceId,
          userId: reporterId,
          minutesBack: 15,
        });
        userJourney = this.bugContextService.sanitizeUserJourney(journey);
      } catch (error: any) {
        this.logger.warn(`Failed to gather user journey: ${error?.message || error}`);
      }
    }

    const insertable: InsertableBugReport = {
      workspaceId: dto.workspaceId || null,
      spaceId: dto.spaceId || null,
      reporterId: reporterId || null,
      source: dto.source as BugReportSource,
      severity,
      status: 'open',
      title,
      errorMessage: dto.errorMessage || null,
      errorStack: dto.errorStack || null,
      errorCode: dto.errorCode || null,
      context: this.sanitizeContext(dto.context) || null,
      metadata: this.sanitizeMetadata(dto.metadata) || null,
      userJourney: userJourney
        ? {
            recentActions: userJourney.recentActions,
            sessionStartedAt: userJourney.sessionStartedAt?.toISOString() || null,
          }
        : null,
      occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
    };

    const bugReport = await this.bugReportRepo.insert(insertable);

    this.logger.log(
      `Auto bug report created: ${bugReport.id} from ${dto.source}`,
    );

    return bugReport;
  }

  async list(
    dto: ListBugReportsDto,
  ): Promise<PaginationResult<ExtendedBugReport>> {
    const filters: BugReportListFilters = {
      source: dto.source as BugReportSource | undefined,
      severity: dto.severity as BugReportSeverity | undefined,
      status: dto.status as BugReportStatus | undefined,
      workspaceId: dto.workspaceId,
      fromDate: dto.fromDate ? new Date(dto.fromDate) : undefined,
      toDate: dto.toDate ? new Date(dto.toDate) : undefined,
    };

    return this.bugReportRepo.list(filters, {
      page: dto.page || 1,
      limit: dto.limit || 20,
      query: '',
    });
  }

  async getById(bugReportId: string): Promise<ExtendedBugReport> {
    const bugReport = await this.bugReportRepo.findById(bugReportId, {
      includeReporter: true,
    });

    if (!bugReport) {
      throw new NotFoundException('Bug report not found');
    }

    return bugReport;
  }

  async update(dto: UpdateBugReportDto): Promise<ExtendedBugReport> {
    const bugReport = await this.bugReportRepo.findById(dto.bugReportId);

    if (!bugReport) {
      throw new NotFoundException('Bug report not found');
    }

    const updateData: any = {};

    if (dto.title !== undefined) {
      updateData.title = dto.title;
    }
    if (dto.description !== undefined) {
      updateData.description = dto.description;
    }
    if (dto.severity !== undefined) {
      updateData.severity = dto.severity as BugReportSeverity;
    }
    if (dto.status !== undefined) {
      updateData.status = dto.status as BugReportStatus;
      if (dto.status === BugReportStatusDto.RESOLVED) {
        updateData.resolvedAt = new Date();
      }
    }

    await this.bugReportRepo.update(dto.bugReportId, updateData);

    this.logger.log(`Bug report updated: ${dto.bugReportId}`);

    return this.getById(dto.bugReportId);
  }

  async delete(bugReportId: string): Promise<void> {
    const bugReport = await this.bugReportRepo.findById(bugReportId);

    if (!bugReport) {
      throw new NotFoundException('Bug report not found');
    }

    await this.bugReportRepo.softDelete(bugReportId);

    this.logger.log(`Bug report deleted: ${bugReportId}`);
  }

  private determineSeverity(dto: CreateAutoBugReportDto): BugReportSeverity {
    const errorMessage = dto.errorMessage?.toLowerCase() || '';
    const errorCode = dto.errorCode?.toLowerCase() || '';

    // Critical: Database failures, complete service outages
    if (
      errorMessage.includes('database') ||
      errorMessage.includes('connection refused') ||
      errorCode === '500' ||
      errorMessage.includes('internal server error')
    ) {
      return 'critical';
    }

    // High: Auth failures, timeouts, critical operation failures
    if (
      errorMessage.includes('timeout') ||
      errorMessage.includes('authentication') ||
      errorMessage.includes('unauthorized') ||
      errorCode === '401' ||
      errorCode === '403'
    ) {
      return 'high';
    }

    // Medium: Validation errors, tool errors, general failures
    if (
      errorMessage.includes('validation') ||
      errorMessage.includes('invalid') ||
      dto.source === BugReportSourceDto.AUTO_AGENT
    ) {
      return 'medium';
    }

    // Low: UI issues, warnings
    if (dto.source === BugReportSourceDto.AUTO_CLIENT) {
      return 'low';
    }

    return 'medium';
  }

  private generateTitle(dto: CreateAutoBugReportDto): string {
    if (dto.errorMessage) {
      // Take first line or first 100 chars
      const firstLine = dto.errorMessage.split('\n')[0];
      return firstLine.length > 100
        ? `${firstLine.substring(0, 97)}...`
        : firstLine;
    }

    if (dto.errorCode) {
      return `Error ${dto.errorCode}`;
    }

    const sourceLabel = {
      'auto:server': 'Server',
      'auto:client': 'Client',
      'auto:agent': 'Agent',
      'user:command': 'User',
    }[dto.source] || 'Unknown';

    return `${sourceLabel} error at ${new Date().toISOString()}`;
  }

  private sanitizeContext(context?: Record<string, any>): Record<string, any> | null {
    if (!context) return null;

    const sensitiveKeys = [
      'password',
      'secret',
      'token',
      'apiKey',
      'api_key',
      'credential',
      'authorization',
    ];

    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(context)) {
      if (sensitiveKeys.some((sk) => key.toLowerCase().includes(sk))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeContext(value as Record<string, any>);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  private sanitizeMetadata(
    metadata?: Record<string, any>,
  ): Record<string, any> | null {
    return this.sanitizeContext(metadata);
  }
}
