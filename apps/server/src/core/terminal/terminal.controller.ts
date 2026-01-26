import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { TerminalSessionService } from './terminal-session.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '../../database/types/entity.types';

class CreateSessionDto {
  agentId: string;
  runtimeSessionId: string;
  title?: string;
  cols?: number;
  rows?: number;
  runtimeEndpoint?: string;
}

@Controller('terminal')
export class TerminalController {
  constructor(private readonly sessionService: TerminalSessionService) {}

  /**
   * Get all terminal sessions for the workspace
   */
  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  async getSessions(
    @AuthWorkspace() workspace: Workspace,
    @Query('includeTerminated') includeTerminated?: string,
  ) {
    return this.sessionService.getWorkspaceSessions(workspace.id, {
      includeTerminated: includeTerminated === 'true',
    });
  }

  /**
   * Get a specific session
   */
  @Get('sessions/:sessionId')
  @UseGuards(JwtAuthGuard)
  async getSession(
    @Param('sessionId') sessionId: string,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const session = await this.sessionService.findById(sessionId);
    if (!session || session.workspaceId !== workspace.id) {
      throw new Error('Session not found');
    }
    return session;
  }

  /**
   * Get active session for an agent
   */
  @Get('agents/:agentId/session')
  @UseGuards(JwtAuthGuard)
  async getAgentSession(
    @Param('agentId') agentId: string,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const session = await this.sessionService.findActiveByAgent(agentId);
    if (!session || session.workspaceId !== workspace.id) {
      return null;
    }
    return session;
  }

  /**
   * Create a new terminal session (called by runtime or spawn flow)
   */
  @Post('sessions')
  @HttpCode(HttpStatus.CREATED)
  async createSession(
    @Body() body: CreateSessionDto & { workspaceId: string },
  ) {
    return this.sessionService.createSession(
      body.agentId,
      body.workspaceId,
      body.runtimeSessionId,
      {
        title: body.title,
        cols: body.cols,
        rows: body.rows,
        runtimeEndpoint: body.runtimeEndpoint,
      },
    );
  }

  /**
   * Get session logs
   */
  @Get('sessions/:sessionId/logs')
  @UseGuards(JwtAuthGuard)
  async getSessionLogs(
    @Param('sessionId') sessionId: string,
    @AuthWorkspace() workspace: Workspace,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const session = await this.sessionService.findById(sessionId);
    if (!session || session.workspaceId !== workspace.id) {
      throw new Error('Session not found');
    }
    return this.sessionService.getLogs(sessionId, {
      limit: limit ? parseInt(limit, 10) : 100,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }

  /**
   * Terminate a session
   */
  @Delete('sessions/:sessionId')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async terminateSession(
    @Param('sessionId') sessionId: string,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const session = await this.sessionService.findById(sessionId);
    if (!session || session.workspaceId !== workspace.id) {
      throw new Error('Session not found');
    }
    return this.sessionService.terminate(sessionId);
  }

  /**
   * Runtime callback for session status updates
   */
  @Post('sessions/:runtimeSessionId/status')
  @HttpCode(HttpStatus.OK)
  async updateSessionStatus(
    @Param('runtimeSessionId') runtimeSessionId: string,
    @Body() body: { status: string; loginUrl?: string },
  ) {
    const session =
      await this.sessionService.findByRuntimeSessionId(runtimeSessionId);
    if (!session) {
      throw new Error('Session not found');
    }
    return this.sessionService.updateStatus(
      session.id,
      body.status as any,
    );
  }
}
