import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { DB } from '../../types/db';
import { InjectKysely } from 'nestjs-kysely';
import { randomBytes } from 'crypto';

export interface AgentInvite {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  token: string;
  permissions: string[];
  usesRemaining: number | null;
  usesCount: number;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAgentInviteInput {
  workspaceId: string;
  name: string;
  description?: string;
  permissions?: string[];
  usesRemaining?: number | null;
  expiresAt?: Date | null;
  createdBy?: string;
}

@Injectable()
export class AgentInviteRepo {
  constructor(@InjectKysely() private readonly db: Kysely<DB>) {}

  private generateToken(): string {
    return `agent_inv_${randomBytes(24).toString('base64url')}`;
  }

  async create(input: CreateAgentInviteInput): Promise<AgentInvite> {
    const token = this.generateToken();

    const result = await this.db
      .insertInto('agentInvites')
      .values({
        workspaceId: input.workspaceId,
        name: input.name,
        description: input.description,
        token,
        permissions: input.permissions || [],
        usesRemaining: input.usesRemaining,
        expiresAt: input.expiresAt,
        createdBy: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapToAgentInvite(result);
  }

  async findById(id: string): Promise<AgentInvite | undefined> {
    const result = await this.db
      .selectFrom('agentInvites')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    return result ? this.mapToAgentInvite(result) : undefined;
  }

  async findByToken(token: string): Promise<AgentInvite | undefined> {
    const result = await this.db
      .selectFrom('agentInvites')
      .selectAll()
      .where('token', '=', token)
      .executeTakeFirst();

    return result ? this.mapToAgentInvite(result) : undefined;
  }

  async findByWorkspace(workspaceId: string): Promise<AgentInvite[]> {
    const results = await this.db
      .selectFrom('agentInvites')
      .selectAll()
      .where('workspaceId', '=', workspaceId)
      .where('revokedAt', 'is', null)
      .orderBy('createdAt', 'desc')
      .execute();

    return results.map(this.mapToAgentInvite);
  }

  async findActiveByWorkspace(workspaceId: string): Promise<AgentInvite[]> {
    const now = new Date();

    const results = await this.db
      .selectFrom('agentInvites')
      .selectAll()
      .where('workspaceId', '=', workspaceId)
      .where('revokedAt', 'is', null)
      .where((eb) =>
        eb.or([
          eb('expiresAt', 'is', null),
          eb('expiresAt', '>', now),
        ]),
      )
      .where((eb) =>
        eb.or([
          eb('usesRemaining', 'is', null),
          eb('usesRemaining', '>', 0),
        ]),
      )
      .orderBy('createdAt', 'desc')
      .execute();

    return results.map(this.mapToAgentInvite);
  }

  async incrementUsage(id: string): Promise<AgentInvite> {
    const result = await this.db
      .updateTable('agentInvites')
      .set((eb) => ({
        usesCount: eb('usesCount', '+', 1),
        usesRemaining: eb.case()
          .when('usesRemaining', 'is not', null)
          .then(eb('usesRemaining', '-', 1))
          .else(null)
          .end(),
        updatedAt: new Date(),
      }))
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapToAgentInvite(result);
  }

  async revoke(id: string): Promise<AgentInvite> {
    const result = await this.db
      .updateTable('agentInvites')
      .set({
        revokedAt: new Date(),
        updatedAt: new Date(),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapToAgentInvite(result);
  }

  async delete(id: string): Promise<void> {
    await this.db
      .deleteFrom('agentInvites')
      .where('id', '=', id)
      .execute();
  }

  async isValidInvite(token: string): Promise<{ valid: boolean; invite?: AgentInvite; reason?: string }> {
    const invite = await this.findByToken(token);

    if (!invite) {
      return { valid: false, reason: 'Invite not found' };
    }

    if (invite.revokedAt) {
      return { valid: false, reason: 'Invite has been revoked' };
    }

    if (invite.expiresAt && invite.expiresAt < new Date()) {
      return { valid: false, reason: 'Invite has expired' };
    }

    if (invite.usesRemaining !== null && invite.usesRemaining <= 0) {
      return { valid: false, reason: 'Invite has no remaining uses' };
    }

    return { valid: true, invite };
  }

  private mapToAgentInvite(row: any): AgentInvite {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      name: row.name,
      description: row.description,
      token: row.token,
      permissions: row.permissions || [],
      usesRemaining: row.usesRemaining,
      usesCount: row.usesCount,
      expiresAt: row.expiresAt ? new Date(row.expiresAt) : null,
      revokedAt: row.revokedAt ? new Date(row.revokedAt) : null,
      createdBy: row.createdBy,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }
}
