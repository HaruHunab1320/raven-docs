import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { Kysely } from 'kysely';
import { DB } from '../../types/db';
import { TerminalSessions, TerminalSessionLogs } from '../../types/db';
import { Insertable, Selectable, Updateable } from 'kysely';

export type TerminalSession = Selectable<TerminalSessions>;
export type NewTerminalSession = Insertable<TerminalSessions>;
export type TerminalSessionUpdate = Updateable<TerminalSessions>;

export type TerminalSessionLog = Selectable<TerminalSessionLogs>;
export type NewTerminalSessionLog = Insertable<TerminalSessionLogs>;

export type TerminalSessionStatus =
  | 'pending'
  | 'connecting'
  | 'active'
  | 'login_required'
  | 'disconnected'
  | 'terminated';

@Injectable()
export class TerminalSessionRepo {
  constructor(@InjectKysely() private readonly db: Kysely<DB>) {}

  async create(session: NewTerminalSession): Promise<TerminalSession> {
    return this.db
      .insertInto('terminalSessions')
      .values(session)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async findById(id: string): Promise<TerminalSession | undefined> {
    return this.db
      .selectFrom('terminalSessions')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  async findByRuntimeSessionId(
    runtimeSessionId: string,
  ): Promise<TerminalSession | undefined> {
    return this.db
      .selectFrom('terminalSessions')
      .selectAll()
      .where('runtimeSessionId', '=', runtimeSessionId)
      .executeTakeFirst();
  }

  async findByAgent(agentId: string): Promise<TerminalSession[]> {
    return this.db
      .selectFrom('terminalSessions')
      .selectAll()
      .where('agentId', '=', agentId)
      .where('terminatedAt', 'is', null)
      .orderBy('createdAt', 'desc')
      .execute();
  }

  async findActiveByAgent(agentId: string): Promise<TerminalSession | undefined> {
    return this.db
      .selectFrom('terminalSessions')
      .selectAll()
      .where('agentId', '=', agentId)
      .where('status', 'in', ['pending', 'connecting', 'active', 'login_required'])
      .where('terminatedAt', 'is', null)
      .orderBy('createdAt', 'desc')
      .executeTakeFirst();
  }

  async findByWorkspace(
    workspaceId: string,
    options?: {
      status?: TerminalSessionStatus[];
      includeTerminated?: boolean;
    },
  ): Promise<TerminalSession[]> {
    let query = this.db
      .selectFrom('terminalSessions')
      .selectAll()
      .where('workspaceId', '=', workspaceId);

    if (options?.status && options.status.length > 0) {
      query = query.where('status', 'in', options.status);
    }

    if (!options?.includeTerminated) {
      query = query.where('terminatedAt', 'is', null);
    }

    return query.orderBy('createdAt', 'desc').execute();
  }

  async update(id: string, updates: TerminalSessionUpdate): Promise<TerminalSession> {
    return this.db
      .updateTable('terminalSessions')
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async updateStatus(
    id: string,
    status: TerminalSessionStatus,
  ): Promise<TerminalSession> {
    const updates: TerminalSessionUpdate = {
      status,
      updatedAt: new Date(),
    };

    if (status === 'terminated') {
      updates.terminatedAt = new Date();
    }

    return this.update(id, updates);
  }

  async updateActivity(id: string): Promise<void> {
    await this.db
      .updateTable('terminalSessions')
      .set({
        lastActivityAt: new Date(),
        updatedAt: new Date(),
      })
      .where('id', '=', id)
      .execute();
  }

  async setConnectedUser(id: string, userId: string | null): Promise<TerminalSession> {
    return this.update(id, { connectedUserId: userId });
  }

  async terminate(id: string): Promise<TerminalSession> {
    return this.update(id, {
      status: 'terminated',
      terminatedAt: new Date(),
      connectedUserId: null,
    });
  }

  async terminateByAgent(agentId: string): Promise<void> {
    await this.db
      .updateTable('terminalSessions')
      .set({
        status: 'terminated',
        terminatedAt: new Date(),
        connectedUserId: null,
        updatedAt: new Date(),
      })
      .where('agentId', '=', agentId)
      .where('terminatedAt', 'is', null)
      .execute();
  }

  // Session logs

  async addLog(log: NewTerminalSessionLog): Promise<TerminalSessionLog> {
    return this.db
      .insertInto('terminalSessionLogs')
      .values(log)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async getLogs(
    sessionId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<TerminalSessionLog[]> {
    let query = this.db
      .selectFrom('terminalSessionLogs')
      .selectAll()
      .where('sessionId', '=', sessionId)
      .orderBy('createdAt', 'asc');

    if (options?.offset) {
      query = query.offset(options.offset);
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    return query.execute();
  }

  async getRecentLogs(
    sessionId: string,
    limit: number = 100,
  ): Promise<TerminalSessionLog[]> {
    return this.db
      .selectFrom('terminalSessionLogs')
      .selectAll()
      .where('sessionId', '=', sessionId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .execute()
      .then((logs) => logs.reverse()); // Return in chronological order
  }
}
