import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { CodingSwarmService } from '../../../core/coding-swarm/coding-swarm.service';
import {
  createInternalError,
  createInvalidParamsError,
  createResourceNotFoundError,
} from '../utils/error.utils';

/**
 * MCP Handler for Coding Swarm operations
 *
 * Provides tools for executing, monitoring, and managing coding swarms
 * that spawn coding agents (Claude Code, Aider, etc.) in isolated git workspaces.
 *
 * Methods:
 * - swarm.execute: Start a coding swarm execution
 * - swarm.status: Get execution status
 * - swarm.list: List executions in a workspace
 * - swarm.stop: Stop a running swarm execution
 * - swarm.logs: Get terminal output logs
 */
@Injectable()
export class SwarmHandler {
  private readonly logger = new Logger(SwarmHandler.name);

  constructor(
    @Inject(forwardRef(() => CodingSwarmService))
    private readonly codingSwarmService: CodingSwarmService,
  ) {}

  /**
   * Start a coding swarm execution
   * Method: swarm.execute
   */
  async execute(params: any, userId: string) {
    this.logger.debug(`SwarmHandler.execute called by ${userId}`);
    try {
      if (!params.workspaceId) {
        throw createInvalidParamsError('workspaceId is required');
      }
      if (!params.repoUrl) {
        throw createInvalidParamsError('repoUrl is required');
      }
      if (!params.taskDescription) {
        throw createInvalidParamsError('taskDescription is required');
      }

      const result = await this.codingSwarmService.execute({
        workspaceId: params.workspaceId,
        experimentId: params.experimentId,
        spaceId: params.spaceId,
        repoUrl: params.repoUrl,
        taskDescription: params.taskDescription,
        agentType: params.agentType,
        baseBranch: params.baseBranch,
        taskContext: params.taskContext,
        triggeredBy: userId,
      });

      return result;
    } catch (error: any) {
      this.logger.error(
        `Error in swarm.execute: ${error.message || 'Unknown error'}`,
        error.stack,
      );
      if (error.code && typeof error.code === 'number') {
        throw error;
      }
      throw createInternalError(error.message || String(error));
    }
  }

  /**
   * Get execution status
   * Method: swarm.status
   */
  async status(params: any, userId: string) {
    this.logger.debug(`SwarmHandler.status called by ${userId}`);
    try {
      if (!params.executionId) {
        throw createInvalidParamsError('executionId is required');
      }

      const execution = await this.codingSwarmService.getStatus(
        params.executionId,
      );

      if (!execution) {
        throw createResourceNotFoundError('Execution not found');
      }

      return {
        id: execution.id,
        status: execution.status,
        agentType: execution.agentType,
        agentId: execution.agentId,
        taskDescription: execution.taskDescription,
        outputSummary: execution.outputSummary,
        exitCode: execution.exitCode,
        results: execution.results,
        filesChanged: execution.filesChanged,
        startedAt: execution.startedAt,
        completedAt: execution.completedAt,
        errorMessage: execution.errorMessage,
        createdAt: execution.createdAt,
      };
    } catch (error: any) {
      this.logger.error(
        `Error in swarm.status: ${error.message || 'Unknown error'}`,
        error.stack,
      );
      if (error.code && typeof error.code === 'number') {
        throw error;
      }
      throw createInternalError(error.message || String(error));
    }
  }

  /**
   * List executions in a workspace
   * Method: swarm.list
   */
  async list(params: any, userId: string) {
    this.logger.debug(`SwarmHandler.list called by ${userId}`);
    try {
      if (!params.workspaceId) {
        throw createInvalidParamsError('workspaceId is required');
      }

      const executions = await this.codingSwarmService.list(
        params.workspaceId,
        {
          status: params.status,
          experimentId: params.experimentId,
          limit: params.limit,
        },
      );

      return {
        executions: executions.map((e: any) => ({
          id: e.id,
          status: e.status,
          agentType: e.agentType,
          taskDescription: e.taskDescription,
          experimentId: e.experimentId,
          startedAt: e.startedAt,
          completedAt: e.completedAt,
          createdAt: e.createdAt,
        })),
        total: executions.length,
      };
    } catch (error: any) {
      this.logger.error(
        `Error in swarm.list: ${error.message || 'Unknown error'}`,
        error.stack,
      );
      if (error.code && typeof error.code === 'number') {
        throw error;
      }
      throw createInternalError(error.message || String(error));
    }
  }

  /**
   * Stop a running swarm execution
   * Method: swarm.stop
   */
  async stop(params: any, userId: string) {
    this.logger.debug(`SwarmHandler.stop called by ${userId}`);
    try {
      if (!params.executionId) {
        throw createInvalidParamsError('executionId is required');
      }

      const result = await this.codingSwarmService.stop(params.executionId);

      return result;
    } catch (error: any) {
      this.logger.error(
        `Error in swarm.stop: ${error.message || 'Unknown error'}`,
        error.stack,
      );
      if (error.code && typeof error.code === 'number') {
        throw error;
      }
      throw createInternalError(error.message || String(error));
    }
  }

  /**
   * Get terminal output logs
   * Method: swarm.logs
   */
  async logs(params: any, userId: string) {
    this.logger.debug(`SwarmHandler.logs called by ${userId}`);
    try {
      if (!params.executionId) {
        throw createInvalidParamsError('executionId is required');
      }

      const result = await this.codingSwarmService.getLogs(
        params.executionId,
        params.limit,
      );

      return result;
    } catch (error: any) {
      this.logger.error(
        `Error in swarm.logs: ${error.message || 'Unknown error'}`,
        error.stack,
      );
      if (error.code && typeof error.code === 'number') {
        throw error;
      }
      throw createInternalError(error.message || String(error));
    }
  }
}
