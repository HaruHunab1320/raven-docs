import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '../../types/kysely.types';
import { dbOrTx } from '../../utils';
import { PaginationOptions } from '../../pagination/pagination-options';
import { executeWithPagination, PaginationResult } from '../../pagination/pagination';
import { ExpressionBuilder, sql } from 'kysely';
import { DB } from '../../types/db';
import { jsonObjectFrom } from 'kysely/helpers/postgres';

// Types for BugReport entity
export type BugReportSource =
  | 'auto:server'
  | 'auto:client'
  | 'auto:agent'
  | 'user:command';

export type BugReportSeverity = 'low' | 'medium' | 'high' | 'critical';

export type BugReportStatus =
  | 'open'
  | 'triaged'
  | 'in_progress'
  | 'resolved'
  | 'closed';

export interface BugReport {
  id: string;
  workspaceId: string | null;
  spaceId: string | null;
  reporterId: string | null;
  source: BugReportSource;
  severity: BugReportSeverity;
  status: BugReportStatus;
  title: string;
  description: string | null;
  errorMessage: string | null;
  errorStack: string | null;
  errorCode: string | null;
  userJourney: Record<string, any> | null;
  context: Record<string, any> | null;
  metadata: Record<string, any> | null;
  occurrenceCount: number;
  occurredAt: Date;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
  deletedAt: Date | null;
}

export interface InsertableBugReport {
  workspaceId?: string | null;
  spaceId?: string | null;
  reporterId?: string | null;
  source: BugReportSource;
  severity?: BugReportSeverity;
  status?: BugReportStatus;
  title: string;
  description?: string | null;
  errorMessage?: string | null;
  errorStack?: string | null;
  errorCode?: string | null;
  userJourney?: Record<string, any> | null;
  context?: Record<string, any> | null;
  metadata?: Record<string, any> | null;
  occurrenceCount?: number;
  occurredAt?: Date;
}

export interface UpdatableBugReport {
  severity?: BugReportSeverity;
  status?: BugReportStatus;
  title?: string;
  description?: string | null;
  occurrenceCount?: number;
  resolvedAt?: Date | null;
  updatedAt?: Date;
}

export interface BugReportListFilters {
  source?: BugReportSource;
  severity?: BugReportSeverity;
  status?: BugReportStatus;
  workspaceId?: string;
  fromDate?: Date;
  toDate?: Date;
}

export type ExtendedBugReport = BugReport & {
  reporter?: {
    id: string;
    name: string | null;
    avatarUrl: string | null;
  } | null;
};

@Injectable()
export class BugReportRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async findById(
    bugReportId: string,
    opts?: { includeReporter?: boolean },
  ): Promise<ExtendedBugReport | undefined> {
    return await this.db
      .selectFrom('bugReports')
      .selectAll('bugReports')
      .$if(opts?.includeReporter ?? false, (qb) =>
        qb.select((eb) => this.withReporter(eb)),
      )
      .where('bugReports.id', '=', bugReportId)
      .where('bugReports.deletedAt', 'is', null)
      .executeTakeFirst() as ExtendedBugReport | undefined;
  }

  async list(
    filters: BugReportListFilters,
    pagination: PaginationOptions,
  ): Promise<PaginationResult<ExtendedBugReport>> {
    let query = this.db
      .selectFrom('bugReports')
      .selectAll('bugReports')
      .select((eb) => this.withReporter(eb))
      .where('bugReports.deletedAt', 'is', null)
      .orderBy('bugReports.occurredAt', 'desc');

    if (filters.source) {
      query = query.where('bugReports.source', '=', filters.source);
    }
    if (filters.severity) {
      query = query.where('bugReports.severity', '=', filters.severity);
    }
    if (filters.status) {
      query = query.where('bugReports.status', '=', filters.status);
    }
    if (filters.workspaceId) {
      query = query.where('bugReports.workspaceId', '=', filters.workspaceId);
    }
    if (filters.fromDate) {
      query = query.where('bugReports.occurredAt', '>=', filters.fromDate);
    }
    if (filters.toDate) {
      query = query.where('bugReports.occurredAt', '<=', filters.toDate);
    }

    return executeWithPagination(query, {
      page: pagination.page,
      perPage: pagination.limit,
    }) as Promise<PaginationResult<ExtendedBugReport>>;
  }

  async insert(
    insertableBugReport: InsertableBugReport,
    trx?: KyselyTransaction,
  ): Promise<BugReport> {
    const db = dbOrTx(this.db, trx);
    return db
      .insertInto('bugReports')
      .values({
        ...insertableBugReport,
        userJourney: insertableBugReport.userJourney
          ? JSON.stringify(insertableBugReport.userJourney)
          : null,
        context: insertableBugReport.context
          ? JSON.stringify(insertableBugReport.context)
          : null,
        metadata: insertableBugReport.metadata
          ? JSON.stringify(insertableBugReport.metadata)
          : null,
      } as any)
      .returningAll()
      .executeTakeFirst() as Promise<BugReport>;
  }

  async update(
    bugReportId: string,
    updatableBugReport: UpdatableBugReport,
    trx?: KyselyTransaction,
  ): Promise<void> {
    const db = dbOrTx(this.db, trx);
    await db
      .updateTable('bugReports')
      .set({
        ...updatableBugReport,
        updatedAt: new Date(),
      })
      .where('id', '=', bugReportId)
      .execute();
  }

  async findDuplicate(
    errorMessage: string,
    source: BugReportSource,
    hoursBack: number = 24,
  ): Promise<BugReport | undefined> {
    const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

    return await this.db
      .selectFrom('bugReports')
      .selectAll()
      .where('bugReports.errorMessage', '=', errorMessage)
      .where('bugReports.source', '=', source)
      .where('bugReports.occurredAt', '>=', cutoffTime)
      .where('bugReports.deletedAt', 'is', null)
      .where('bugReports.status', 'in', ['open', 'triaged', 'in_progress'])
      .orderBy('bugReports.occurredAt', 'desc')
      .executeTakeFirst() as BugReport | undefined;
  }

  async incrementOccurrence(
    bugReportId: string,
    trx?: KyselyTransaction,
  ): Promise<void> {
    const db = dbOrTx(this.db, trx);
    await db
      .updateTable('bugReports')
      .set((eb) => ({
        occurrenceCount: sql`${eb.ref('occurrenceCount')} + 1`,
        updatedAt: new Date(),
      }))
      .where('id', '=', bugReportId)
      .execute();
  }

  async softDelete(bugReportId: string, trx?: KyselyTransaction): Promise<void> {
    const db = dbOrTx(this.db, trx);
    await db
      .updateTable('bugReports')
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where('id', '=', bugReportId)
      .execute();
  }

  private withReporter(eb: ExpressionBuilder<DB, 'bugReports'>) {
    return jsonObjectFrom(
      eb
        .selectFrom('users')
        .select(['users.id', 'users.name', 'users.avatarUrl'])
        .whereRef('users.id', '=', 'bugReports.reporterId'),
    ).as('reporter');
  }
}
