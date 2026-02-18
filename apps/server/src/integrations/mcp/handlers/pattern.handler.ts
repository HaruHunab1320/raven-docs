import { Injectable, Logger } from '@nestjs/common';
import { PatternDetectionService } from '../../../core/pattern-detection/pattern-detection.service';
import { PatternDetectionRepo } from '../../../database/repos/pattern-detection/pattern-detection.repo';
import { WorkspaceRepo } from '@raven-docs/db/repos/workspace/workspace.repo';
import { resolveIntelligenceSettings } from '../../../core/workspace/intelligence-defaults';
import {
  createInternalError,
  createInvalidParamsError,
  createResourceNotFoundError,
} from '../utils/error.utils';

/**
 * MCP Handler for Pattern Detection operations
 *
 * Methods:
 * - pattern.list: List detected patterns for a workspace
 * - pattern.acknowledge: Acknowledge a pattern
 * - pattern.dismiss: Dismiss a pattern
 * - pattern.run: Manually trigger pattern detection
 */
@Injectable()
export class PatternHandler {
  private readonly logger = new Logger(PatternHandler.name);

  constructor(
    private readonly patternService: PatternDetectionService,
    private readonly patternRepo: PatternDetectionRepo,
    private readonly workspaceRepo: WorkspaceRepo,
  ) {}

  /**
   * List detected patterns for a workspace
   * Method: pattern.list
   */
  async list(params: any, userId: string) {
    this.logger.debug(`PatternHandler.list called by ${userId}`);
    try {
      if (!params.workspaceId) {
        throw createInvalidParamsError('workspaceId is required');
      }

      const patterns = await this.patternRepo.listByWorkspace(
        params.workspaceId,
        {
          spaceId: params.spaceId,
          status: params.status,
          patternType: params.patternType,
          limit: params.limit,
        },
      );

      return {
        patterns: patterns.map((p) => ({
          id: p.id,
          patternType: p.patternType,
          severity: p.severity,
          title: p.title,
          details:
            typeof p.details === 'string' ? JSON.parse(p.details) : p.details,
          status: p.status,
          detectedAt: p.detectedAt,
          acknowledgedAt: p.acknowledgedAt,
        })),
        total: patterns.length,
      };
    } catch (error: any) {
      this.logger.error(
        `Error in pattern.list: ${error.message || 'Unknown error'}`,
        error.stack,
      );
      if (error.code && typeof error.code === 'number') throw error;
      throw createInternalError(error.message || String(error));
    }
  }

  /**
   * Acknowledge a detected pattern
   * Method: pattern.acknowledge
   */
  async acknowledge(params: any, userId: string) {
    this.logger.debug(`PatternHandler.acknowledge called by ${userId}`);
    try {
      if (!params.patternId) {
        throw createInvalidParamsError('patternId is required');
      }

      const pattern = await this.patternRepo.findById(params.patternId);
      if (!pattern) {
        throw createResourceNotFoundError('Pattern', params.patternId);
      }

      const updated = await this.patternRepo.updateStatus(
        params.patternId,
        'acknowledged',
        params.actionTaken,
      );

      return {
        success: true,
        pattern: {
          id: updated?.id,
          status: updated?.status,
          acknowledgedAt: updated?.acknowledgedAt,
        },
      };
    } catch (error: any) {
      this.logger.error(
        `Error in pattern.acknowledge: ${error.message || 'Unknown error'}`,
        error.stack,
      );
      if (error.code && typeof error.code === 'number') throw error;
      throw createInternalError(error.message || String(error));
    }
  }

  /**
   * Dismiss a detected pattern
   * Method: pattern.dismiss
   */
  async dismiss(params: any, userId: string) {
    this.logger.debug(`PatternHandler.dismiss called by ${userId}`);
    try {
      if (!params.patternId) {
        throw createInvalidParamsError('patternId is required');
      }

      const pattern = await this.patternRepo.findById(params.patternId);
      if (!pattern) {
        throw createResourceNotFoundError('Pattern', params.patternId);
      }

      const updated = await this.patternRepo.updateStatus(
        params.patternId,
        'dismissed',
      );

      return {
        success: true,
        pattern: {
          id: updated?.id,
          status: updated?.status,
        },
      };
    } catch (error: any) {
      this.logger.error(
        `Error in pattern.dismiss: ${error.message || 'Unknown error'}`,
        error.stack,
      );
      if (error.code && typeof error.code === 'number') throw error;
      throw createInternalError(error.message || String(error));
    }
  }

  /**
   * Manually trigger pattern detection for a workspace
   * Method: pattern.run
   */
  async run(params: any, userId: string) {
    this.logger.debug(`PatternHandler.run called by ${userId}`);
    try {
      if (!params.workspaceId) {
        throw createInvalidParamsError('workspaceId is required');
      }

      const workspace = await this.workspaceRepo.findById(params.workspaceId);
      if (!workspace) {
        throw createResourceNotFoundError('Workspace', params.workspaceId);
      }

      const settings = resolveIntelligenceSettings(workspace.settings);
      if (!settings.enabled) {
        return {
          success: false,
          message: 'Intelligence is not enabled for this workspace',
          detected: 0,
        };
      }

      const detected = await this.patternService.runAllPatterns(
        params.workspaceId,
        settings,
      );

      return {
        success: true,
        detected,
        message: `Pattern detection completed: ${detected} new pattern(s) detected`,
      };
    } catch (error: any) {
      this.logger.error(
        `Error in pattern.run: ${error.message || 'Unknown error'}`,
        error.stack,
      );
      if (error.code && typeof error.code === 'number') throw error;
      throw createInternalError(error.message || String(error));
    }
  }
}
