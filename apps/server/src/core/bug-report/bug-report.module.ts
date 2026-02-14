import { Module } from '@nestjs/common';
import { BugReportService } from './bug-report.service';
import { BugReportController } from './bug-report.controller';
import { BugContextService } from './bug-context.service';
import { DatabaseModule } from '../../database/database.module';
import { AgentMemoryModule } from '../agent-memory/agent-memory.module';
import { BugReportRepo } from '../../database/repos/bug-report/bug-report.repo';
import { BugReportExceptionFilter } from '../../common/filters/bug-report-exception.filter';

@Module({
  imports: [DatabaseModule, AgentMemoryModule],
  controllers: [BugReportController],
  providers: [BugReportService, BugContextService, BugReportRepo, BugReportExceptionFilter],
  exports: [BugReportService, BugContextService, BugReportExceptionFilter],
})
export class BugReportModule {}
