import { Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import {
  WorkspaceService as GitWsService,
  CredentialService,
  GitHubPatClient,
} from 'git-workspace-service';
import { CodingWorkspaceRepo } from '../../database/repos/coding-swarm/coding-workspace.repo';
import { KyselyDB } from '../../database/types/kysely.types';
import { WorkspaceRepo } from '../../database/repos/workspace/workspace.repo';
import { GitHubOAuthService } from '../../integrations/github/github-oauth.service';

@Injectable()
export class GitWorkspaceService {
  private readonly logger = new Logger(GitWorkspaceService.name);
  private wsService: GitWsService;
  private credService: CredentialService;

  constructor(
    private readonly codingWorkspaceRepo: CodingWorkspaceRepo,
    private readonly workspaceRepo: WorkspaceRepo,
    @InjectKysely() private readonly db: KyselyDB,
    private readonly githubOAuthService: GitHubOAuthService,
  ) {
    const baseDir = process.env.GIT_WORKSPACE_DIR || '/tmp/raven-workspaces';

    this.credService = new CredentialService({
      defaultTtlSeconds: 3600,
      maxTtlSeconds: 7200,
    });

    this.wsService = new GitWsService({
      config: {
        baseDir,
        branchPrefix: 'experiment',
      },
      credentialService: this.credService,
    });
  }

  /**
   * Provision a git workspace — clone/worktree a repo, store in DB
   */
  async provision(config: {
    workspaceId: string;
    repoUrl: string;
    experimentId?: string;
    spaceId?: string;
    baseBranch?: string;
    workspaceType?: string;
    provisionedBy?: string;
    config?: Record<string, any>;
  }) {
    const branchName = config.experimentId
      ? `experiment/${config.experimentId.slice(0, 8)}`
      : `experiment/${Date.now()}`;

    // Create the DB record
    const record = await this.codingWorkspaceRepo.create({
      workspaceId: config.workspaceId,
      repoUrl: config.repoUrl,
      branch: branchName,
      spaceId: config.spaceId,
      experimentId: config.experimentId,
      workspaceType: config.workspaceType || 'worktree',
      baseBranch: config.baseBranch || 'main',
      provisionedBy: config.provisionedBy,
      config: config.config,
    });

    await this.codingWorkspaceRepo.updateStatus(record.id, 'provisioning');

    try {
      // Resolve credentials from workspace settings or env
      const credential = await this.resolveCredentials(
        config.workspaceId,
        config.repoUrl,
        record.id,
      );

      // Provision via git-workspace-service
      const workspace = await this.wsService.provision({
        repo: config.repoUrl,
        strategy: (config.workspaceType as 'clone' | 'worktree') || 'worktree',
        branchStrategy: 'feature_branch',
        baseBranch: config.baseBranch || 'main',
        execution: {
          id: record.id,
          patternName: 'coding-swarm',
        },
        task: {
          id: config.experimentId || record.id,
          role: 'coding-agent',
          slug: config.experimentId?.slice(0, 8),
        },
        userCredentials: credential
          ? { type: 'pat' as const, token: credential }
          : undefined,
      });

      // Ensure .git-workspace/ is gitignored (contains credential context)
      this.ensureGitignore(workspace.path, '.git-workspace/');

      // Store the git-workspace-service internal ID for finalize/cleanup calls
      const existingConfig = (record as any)?.config || {};
      const updatedConfig =
        typeof existingConfig === 'string'
          ? { ...JSON.parse(existingConfig), gitWsId: workspace.id }
          : { ...existingConfig, gitWsId: workspace.id };

      // Update with workspace path and ready status
      await this.codingWorkspaceRepo.updateStatus(record.id, 'ready', {
        worktreePath: workspace.path,
        branch: workspace.branch.name,
        config: JSON.stringify(updatedConfig),
      });

      this.logger.log(
        `Provisioned git workspace ${record.id} (gitWsId: ${workspace.id}) at ${workspace.path}`,
      );

      return {
        id: record.id,
        path: workspace.path,
        branch: workspace.branch.name,
        status: 'ready',
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to provision workspace: ${error.message}`,
        error.stack,
      );
      await this.codingWorkspaceRepo.updateStatus(record.id, 'error', {
        errorMessage: error.message,
      });
      throw error;
    }
  }

  /**
   * Finalize a workspace — commit, push, create PR
   */
  async finalize(
    id: string,
    opts?: {
      commitMessage?: string;
      prTitle?: string;
      prBody?: string;
      targetBranch?: string;
    },
  ) {
    const record = await this.codingWorkspaceRepo.findById(id);
    if (!record) throw new Error(`Coding workspace ${id} not found`);

    // Resolve git-workspace-service's internal workspace ID
    const gitWsId = this.resolveGitWsId(record);

    await this.codingWorkspaceRepo.updateStatus(id, 'finalizing');

    try {
      const result = await this.wsService.finalize(gitWsId, {
        push: true,
        createPr: true,
        pr: {
          title: opts?.prTitle || `Experiment results: ${record.branch}`,
          body: opts?.prBody || 'Automated coding swarm results',
          targetBranch: opts?.targetBranch || record.baseBranch || 'main',
        },
        cleanup: false,
      });

      // finalize returns PullRequestInfo | void
      const prInfo = result || null;

      await this.codingWorkspaceRepo.updateStatus(id, 'finalized', {
        prUrl: prInfo?.url,
        prNumber: prInfo?.number,
        commitSha: prInfo?.sourceBranch, // closest available field
      });

      this.logger.log(
        `Finalized workspace ${id} — PR: ${prInfo?.url}`,
      );

      return {
        prUrl: prInfo?.url,
        prNumber: prInfo?.number,
        commitSha: prInfo?.sourceBranch,
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to finalize workspace ${id}: ${error.message}`,
        error.stack,
      );
      await this.codingWorkspaceRepo.updateStatus(id, 'error', {
        errorMessage: error.message,
      });
      throw error;
    }
  }

  /**
   * Cleanup a workspace — remove worktree/clone
   */
  async cleanup(id: string) {
    try {
      const record = await this.codingWorkspaceRepo.findById(id);
      const gitWsId = record ? this.resolveGitWsId(record) : id;
      await this.wsService.cleanup(gitWsId);
      await this.codingWorkspaceRepo.updateStatus(id, 'cleaned');
      this.logger.log(`Cleaned up workspace ${id}`);
    } catch (error: any) {
      this.logger.error(
        `Failed to cleanup workspace ${id}: ${error.message}`,
        error.stack,
      );
      await this.codingWorkspaceRepo.updateStatus(id, 'error', {
        errorMessage: `Cleanup failed: ${error.message}`,
      });
    }
  }

  async getWorkspace(id: string) {
    return this.codingWorkspaceRepo.findById(id);
  }

  async getByExperiment(experimentId: string) {
    return this.codingWorkspaceRepo.findByExperiment(experimentId);
  }

  // =========================================================================
  // GitHub Issue Management
  // =========================================================================

  /**
   * Create a GitHub issue
   */
  async createIssue(
    workspaceId: string,
    repoUrl: string,
    opts: { title: string; body?: string; labels?: string[]; assignees?: string[] },
  ) {
    const { owner, repo } = this.parseRepoUrl(repoUrl);
    const client = await this.getPatClient(workspaceId);
    return client.createIssue(owner, repo, { ...opts, body: opts.body || '' });
  }

  /**
   * Get a GitHub issue by number
   */
  async getIssue(workspaceId: string, repoUrl: string, issueNumber: number) {
    const { owner, repo } = this.parseRepoUrl(repoUrl);
    const client = await this.getPatClient(workspaceId);
    return client.getIssue(owner, repo, issueNumber);
  }

  /**
   * List GitHub issues for a repo
   */
  async listIssues(
    workspaceId: string,
    repoUrl: string,
    filters?: {
      state?: 'open' | 'closed' | 'all';
      labels?: string[];
      assignee?: string;
    },
  ) {
    const { owner, repo } = this.parseRepoUrl(repoUrl);
    const client = await this.getPatClient(workspaceId);
    return client.listIssues(owner, repo, filters);
  }

  /**
   * Update a GitHub issue
   */
  async updateIssue(
    workspaceId: string,
    repoUrl: string,
    issueNumber: number,
    opts: {
      title?: string;
      body?: string;
      state?: 'open' | 'closed';
      labels?: string[];
      assignees?: string[];
    },
  ) {
    const { owner, repo } = this.parseRepoUrl(repoUrl);
    const client = await this.getPatClient(workspaceId);
    return client.updateIssue(owner, repo, issueNumber, opts);
  }

  /**
   * Add a comment to a GitHub issue
   */
  async addIssueComment(
    workspaceId: string,
    repoUrl: string,
    issueNumber: number,
    body: string,
  ) {
    const { owner, repo } = this.parseRepoUrl(repoUrl);
    const client = await this.getPatClient(workspaceId);
    return client.addComment(owner, repo, issueNumber, { body });
  }

  /**
   * List comments on a GitHub issue
   */
  async listIssueComments(
    workspaceId: string,
    repoUrl: string,
    issueNumber: number,
  ) {
    const { owner, repo } = this.parseRepoUrl(repoUrl);
    const client = await this.getPatClient(workspaceId);
    return client.listComments(owner, repo, issueNumber);
  }

  /**
   * Close a GitHub issue
   */
  async closeIssue(
    workspaceId: string,
    repoUrl: string,
    issueNumber: number,
  ) {
    const { owner, repo } = this.parseRepoUrl(repoUrl);
    const client = await this.getPatClient(workspaceId);
    return client.closeIssue(owner, repo, issueNumber);
  }

  // =========================================================================
  // Private helpers
  // =========================================================================

  /**
   * Resolve the git-workspace-service internal ID from a DB record.
   * Falls back to record.id if not stored (backwards compat).
   */
  private resolveGitWsId(record: any): string {
    const config =
      typeof record.config === 'string'
        ? JSON.parse(record.config)
        : record.config || {};
    return config.gitWsId || record.id;
  }

  private async getPatClient(workspaceId: string): Promise<GitHubPatClient> {
    const token = await this.resolveCredentials(workspaceId, '', '');
    if (!token) {
      throw new Error(
        'GitHub PAT not configured — set workspace integrations.githubPat or GITHUB_PAT env',
      );
    }
    return new GitHubPatClient({ token });
  }

  private parseRepoUrl(repoUrl: string): { owner: string; repo: string } {
    // Handle: https://github.com/owner/repo, https://github.com/owner/repo.git, git@github.com:owner/repo.git
    const httpsMatch = repoUrl.match(
      /github\.com[/:]([^/]+)\/([^/.]+)(?:\.git)?/,
    );
    if (httpsMatch) {
      return { owner: httpsMatch[1], repo: httpsMatch[2] };
    }
    throw new Error(`Cannot parse GitHub owner/repo from URL: ${repoUrl}`);
  }

  /**
   * Resolve credentials from workspace settings or environment
   */
  private async resolveCredentials(
    workspaceId: string,
    repoUrl: string,
    executionId: string,
  ): Promise<string | null> {
    // 1. Try GitHub App OAuth token
    try {
      const workspace = await this.workspaceRepo.findById(workspaceId);
      const settings = workspace?.settings as any;
      const github = settings?.integrations?.github;
      if (github?.connected && github?.accessToken) {
        const decrypted =
          await this.githubOAuthService.getDecryptedToken(workspaceId);
        if (decrypted) return decrypted;
      }

      // 2. Try manual PAT from workspace settings
      const pat = settings?.integrations?.githubPat;
      if (pat) return pat;
    } catch {
      // Fall through to env
    }

    // 3. Fall back to environment variable
    if (process.env.GITHUB_PAT) {
      return process.env.GITHUB_PAT;
    }

    return null;
  }

  private ensureGitignore(workspacePath: string, entry: string) {
    try {
      const fs = require('fs');
      const path = require('path');
      const gitignorePath = path.join(workspacePath, '.gitignore');
      if (fs.existsSync(gitignorePath)) {
        const content = fs.readFileSync(gitignorePath, 'utf-8');
        if (!content.includes(entry.trim())) {
          fs.appendFileSync(gitignorePath, `\n${entry}\n`);
        }
      } else {
        fs.writeFileSync(gitignorePath, `${entry}\n`);
      }
    } catch (err: any) {
      this.logger.warn(`Failed to update .gitignore: ${err.message}`);
    }
  }
}
