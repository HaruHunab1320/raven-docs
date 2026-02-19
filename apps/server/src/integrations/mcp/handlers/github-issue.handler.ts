import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { GitWorkspaceService } from '../../../core/git-workspace/git-workspace.service';
import {
  createInternalError,
  createInvalidParamsError,
  createResourceNotFoundError,
} from '../utils/error.utils';

/**
 * MCP Handler for GitHub Issue operations
 *
 * Provides tools for creating, reading, updating, and commenting on
 * GitHub issues via the git-workspace-service's GitHubPatClient.
 *
 * Methods:
 * - github_issue.create: Create a new issue
 * - github_issue.get: Get an issue by number
 * - github_issue.list: List issues for a repo
 * - github_issue.update: Update an issue
 * - github_issue.comment: Add a comment to an issue
 * - github_issue.close: Close an issue
 */
@Injectable()
export class GitHubIssueHandler {
  private readonly logger = new Logger(GitHubIssueHandler.name);

  constructor(
    @Inject(forwardRef(() => GitWorkspaceService))
    private readonly gitWorkspaceService: GitWorkspaceService,
  ) {}

  /**
   * Create a new GitHub issue
   * Method: github_issue.create
   */
  async create(params: any, userId: string) {
    this.logger.debug(`GitHubIssueHandler.create called by ${userId}`);
    try {
      if (!params.workspaceId) {
        throw createInvalidParamsError('workspaceId is required');
      }
      if (!params.repoUrl) {
        throw createInvalidParamsError('repoUrl is required');
      }
      if (!params.title) {
        throw createInvalidParamsError('title is required');
      }

      const issue = await this.gitWorkspaceService.createIssue(
        params.workspaceId,
        params.repoUrl,
        {
          title: params.title,
          body: params.body,
          labels: params.labels,
          assignees: params.assignees,
        },
      );

      return issue;
    } catch (error: any) {
      this.logger.error(
        `Error in github_issue.create: ${error.message || 'Unknown error'}`,
        error.stack,
      );
      if (error.code && typeof error.code === 'number') {
        throw error;
      }
      throw createInternalError(error.message || String(error));
    }
  }

  /**
   * Get an issue by number
   * Method: github_issue.get
   */
  async get(params: any, userId: string) {
    this.logger.debug(`GitHubIssueHandler.get called by ${userId}`);
    try {
      if (!params.workspaceId) {
        throw createInvalidParamsError('workspaceId is required');
      }
      if (!params.repoUrl) {
        throw createInvalidParamsError('repoUrl is required');
      }
      if (!params.issueNumber) {
        throw createInvalidParamsError('issueNumber is required');
      }

      const issue = await this.gitWorkspaceService.getIssue(
        params.workspaceId,
        params.repoUrl,
        Number(params.issueNumber),
      );

      if (!issue) {
        throw createResourceNotFoundError('Issue not found');
      }

      return issue;
    } catch (error: any) {
      this.logger.error(
        `Error in github_issue.get: ${error.message || 'Unknown error'}`,
        error.stack,
      );
      if (error.code && typeof error.code === 'number') {
        throw error;
      }
      throw createInternalError(error.message || String(error));
    }
  }

  /**
   * List issues for a repo
   * Method: github_issue.list
   */
  async list(params: any, userId: string) {
    this.logger.debug(`GitHubIssueHandler.list called by ${userId}`);
    try {
      if (!params.workspaceId) {
        throw createInvalidParamsError('workspaceId is required');
      }
      if (!params.repoUrl) {
        throw createInvalidParamsError('repoUrl is required');
      }

      const issues = await this.gitWorkspaceService.listIssues(
        params.workspaceId,
        params.repoUrl,
        {
          state: params.state,
          labels: params.labels,
          assignee: params.assignee,
        },
      );

      return {
        issues,
        total: issues.length,
      };
    } catch (error: any) {
      this.logger.error(
        `Error in github_issue.list: ${error.message || 'Unknown error'}`,
        error.stack,
      );
      if (error.code && typeof error.code === 'number') {
        throw error;
      }
      throw createInternalError(error.message || String(error));
    }
  }

  /**
   * Update an issue
   * Method: github_issue.update
   */
  async update(params: any, userId: string) {
    this.logger.debug(`GitHubIssueHandler.update called by ${userId}`);
    try {
      if (!params.workspaceId) {
        throw createInvalidParamsError('workspaceId is required');
      }
      if (!params.repoUrl) {
        throw createInvalidParamsError('repoUrl is required');
      }
      if (!params.issueNumber) {
        throw createInvalidParamsError('issueNumber is required');
      }

      const issue = await this.gitWorkspaceService.updateIssue(
        params.workspaceId,
        params.repoUrl,
        Number(params.issueNumber),
        {
          title: params.title,
          body: params.body,
          state: params.state,
          labels: params.labels,
          assignees: params.assignees,
        },
      );

      return issue;
    } catch (error: any) {
      this.logger.error(
        `Error in github_issue.update: ${error.message || 'Unknown error'}`,
        error.stack,
      );
      if (error.code && typeof error.code === 'number') {
        throw error;
      }
      throw createInternalError(error.message || String(error));
    }
  }

  /**
   * Add a comment to an issue
   * Method: github_issue.comment
   */
  async comment(params: any, userId: string) {
    this.logger.debug(`GitHubIssueHandler.comment called by ${userId}`);
    try {
      if (!params.workspaceId) {
        throw createInvalidParamsError('workspaceId is required');
      }
      if (!params.repoUrl) {
        throw createInvalidParamsError('repoUrl is required');
      }
      if (!params.issueNumber) {
        throw createInvalidParamsError('issueNumber is required');
      }
      if (!params.body) {
        throw createInvalidParamsError('body is required');
      }

      const result = await this.gitWorkspaceService.addIssueComment(
        params.workspaceId,
        params.repoUrl,
        Number(params.issueNumber),
        params.body,
      );

      return result;
    } catch (error: any) {
      this.logger.error(
        `Error in github_issue.comment: ${error.message || 'Unknown error'}`,
        error.stack,
      );
      if (error.code && typeof error.code === 'number') {
        throw error;
      }
      throw createInternalError(error.message || String(error));
    }
  }

  /**
   * Close an issue
   * Method: github_issue.close
   */
  async close(params: any, userId: string) {
    this.logger.debug(`GitHubIssueHandler.close called by ${userId}`);
    try {
      if (!params.workspaceId) {
        throw createInvalidParamsError('workspaceId is required');
      }
      if (!params.repoUrl) {
        throw createInvalidParamsError('repoUrl is required');
      }
      if (!params.issueNumber) {
        throw createInvalidParamsError('issueNumber is required');
      }

      const issue = await this.gitWorkspaceService.closeIssue(
        params.workspaceId,
        params.repoUrl,
        Number(params.issueNumber),
      );

      return issue;
    } catch (error: any) {
      this.logger.error(
        `Error in github_issue.close: ${error.message || 'Unknown error'}`,
        error.stack,
      );
      if (error.code && typeof error.code === 'number') {
        throw error;
      }
      throw createInternalError(error.message || String(error));
    }
  }
}
