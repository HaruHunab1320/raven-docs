import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  TerminalSessionRepo,
  TerminalSession,
  TerminalSessionStatus,
  TerminalSessionLog,
} from '../../database/repos/terminal-session/terminal-session.repo';
import { ParallaxAgentRepo } from '../../database/repos/parallax-agent/parallax-agent.repo';

@Injectable()
export class TerminalSessionService {
  private readonly logger = new Logger(TerminalSessionService.name);

  constructor(
    private readonly sessionRepo: TerminalSessionRepo,
    private readonly agentRepo: ParallaxAgentRepo,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Create a new terminal session for an agent
   */
  async createSession(
    agentId: string,
    workspaceId: string,
    runtimeSessionId: string,
    options?: {
      title?: string;
      cols?: number;
      rows?: number;
      runtimeEndpoint?: string;
    },
  ): Promise<TerminalSession> {
    // Verify agent exists and belongs to workspace
    const agent = await this.agentRepo.findByIdAndWorkspace(agentId, workspaceId);
    if (!agent) {
      throw new Error('Agent not found');
    }

    // Check if agent already has an active session
    const existingSession = await this.sessionRepo.findActiveByAgent(agentId);
    if (existingSession) {
      // Terminate the old session
      await this.sessionRepo.terminate(existingSession.id);
    }

    const session = await this.sessionRepo.create({
      workspaceId,
      agentId,
      runtimeSessionId,
      title: options?.title || `Terminal: ${agent.name}`,
      cols: options?.cols || 80,
      rows: options?.rows || 24,
      runtimeEndpoint: options?.runtimeEndpoint,
      status: 'pending',
    });

    this.eventEmitter.emit('terminal.session_created', {
      sessionId: session.id,
      agentId,
      workspaceId,
    });

    this.logger.log(`Created terminal session ${session.id} for agent ${agentId}`);

    return session;
  }

  /**
   * Find a session by ID
   */
  async findById(sessionId: string): Promise<TerminalSession | undefined> {
    return this.sessionRepo.findById(sessionId);
  }

  /**
   * Find a session by runtime session ID
   */
  async findByRuntimeSessionId(
    runtimeSessionId: string,
  ): Promise<TerminalSession | undefined> {
    return this.sessionRepo.findByRuntimeSessionId(runtimeSessionId);
  }

  /**
   * Find active session for an agent
   */
  async findActiveByAgent(agentId: string): Promise<TerminalSession | undefined> {
    return this.sessionRepo.findActiveByAgent(agentId);
  }

  /**
   * Get all sessions for a workspace
   */
  async getWorkspaceSessions(
    workspaceId: string,
    options?: { includeTerminated?: boolean },
  ): Promise<TerminalSession[]> {
    return this.sessionRepo.findByWorkspace(workspaceId, {
      includeTerminated: options?.includeTerminated,
    });
  }

  /**
   * Update session status
   */
  async updateStatus(
    sessionId: string,
    status: TerminalSessionStatus,
  ): Promise<TerminalSession> {
    const session = await this.sessionRepo.updateStatus(sessionId, status);

    this.eventEmitter.emit('terminal.status_changed', {
      sessionId,
      status,
    });

    return session;
  }

  /**
   * Attach a user to a session
   */
  async attachUser(
    sessionId: string,
    userId: string,
    workspaceId: string,
  ): Promise<TerminalSession> {
    const session = await this.sessionRepo.findById(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    if (session.workspaceId !== workspaceId) {
      throw new Error('Session does not belong to this workspace');
    }

    if (session.status === 'terminated') {
      throw new Error('Session has been terminated');
    }

    const updatedSession = await this.sessionRepo.setConnectedUser(sessionId, userId);
    await this.sessionRepo.updateActivity(sessionId);

    this.eventEmitter.emit('terminal.user_attached', {
      sessionId,
      userId,
    });

    this.logger.log(`User ${userId} attached to session ${sessionId}`);

    return updatedSession;
  }

  /**
   * Detach a user from a session
   */
  async detachUser(sessionId: string, userId: string): Promise<void> {
    const session = await this.sessionRepo.findById(sessionId);
    if (!session) return;

    if (session.connectedUserId === userId) {
      await this.sessionRepo.setConnectedUser(sessionId, null);

      this.eventEmitter.emit('terminal.user_detached', {
        sessionId,
        userId,
      });

      this.logger.log(`User ${userId} detached from session ${sessionId}`);
    }
  }

  /**
   * Handle user disconnect
   */
  async handleUserDisconnect(sessionId: string, userId: string): Promise<void> {
    await this.detachUser(sessionId, userId);
  }

  /**
   * Handle runtime disconnect
   */
  async handleRuntimeDisconnect(runtimeSessionId: string): Promise<void> {
    const session = await this.sessionRepo.findByRuntimeSessionId(runtimeSessionId);
    if (session && session.status !== 'terminated') {
      await this.updateStatus(session.id, 'disconnected');
      this.logger.log(`Session ${session.id} marked as disconnected`);
    }
  }

  /**
   * Resize terminal
   */
  async resize(sessionId: string, cols: number, rows: number): Promise<void> {
    await this.sessionRepo.update(sessionId, { cols, rows });
  }

  /**
   * Terminate a session
   */
  async terminate(sessionId: string): Promise<TerminalSession> {
    const session = await this.sessionRepo.terminate(sessionId);

    this.eventEmitter.emit('terminal.session_terminated', {
      sessionId,
    });

    this.logger.log(`Session ${sessionId} terminated`);

    return session;
  }

  /**
   * Terminate all sessions for an agent
   */
  async terminateByAgent(agentId: string): Promise<void> {
    await this.sessionRepo.terminateByAgent(agentId);
    this.logger.log(`All sessions for agent ${agentId} terminated`);
  }

  // Logging

  async logInput(sessionId: string, data: string): Promise<void> {
    await this.sessionRepo.addLog({
      sessionId,
      logType: 'stdin',
      content: data,
    });
    await this.sessionRepo.updateActivity(sessionId);
  }

  async logOutput(sessionId: string, data: string): Promise<void> {
    await this.sessionRepo.addLog({
      sessionId,
      logType: 'stdout',
      content: data,
    });
    await this.sessionRepo.updateActivity(sessionId);
  }

  async logError(sessionId: string, data: string): Promise<void> {
    await this.sessionRepo.addLog({
      sessionId,
      logType: 'stderr',
      content: data,
    });
  }

  async logSystem(sessionId: string, message: string): Promise<void> {
    await this.sessionRepo.addLog({
      sessionId,
      logType: 'system',
      content: message,
    });
  }

  async getRecentLogs(sessionId: string, limit: number = 100): Promise<TerminalSessionLog[]> {
    return this.sessionRepo.getRecentLogs(sessionId, limit);
  }

  async getLogs(
    sessionId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<TerminalSessionLog[]> {
    return this.sessionRepo.getLogs(sessionId, options);
  }
}
