import { Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { WorkspaceService as GitWsService, CredentialService } from 'git-workspace-service';
import { CodingWorkspaceRepo } from '../../database/repos/coding-swarm/coding-workspace.repo';
import { KyselyDB } from '../../database/types/kysely.types';
import { WorkspaceRepo } from '../../database/repos/workspace/workspace.repo';

@Injectable()
export class GitWorkspaceService {
  private readonly logger = new Logger(GitWorkspaceService.name);
  private wsService: GitWsService;
  private credService: CredentialService;

  constructor(
    private readonly codingWorkspaceRepo: CodingWorkspaceRepo,
    private readonly workspaceRepo: WorkspaceRepo,
    @InjectKysely() private readonly db: KyselyDB,
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

      // Update with workspace path and ready status
      await this.codingWorkspaceRepo.updateStatus(record.id, 'ready', {
        worktreePath: workspace.path,
        branch: workspace.branch.name,
      });

      this.logger.log(
        `Provisioned git workspace ${record.id} at ${workspace.path}`,
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

    await this.codingWorkspaceRepo.updateStatus(id, 'finalizing');

    try {
      const result = await this.wsService.finalize(id, {
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
      await this.wsService.cleanup(id);
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

  /**
   * Resolve credentials from workspace settings or environment
   */
  private async resolveCredentials(
    workspaceId: string,
    repoUrl: string,
    executionId: string,
  ): Promise<string | null> {
    // Try workspace settings first
    try {
      const workspace = await this.workspaceRepo.findById(workspaceId);
      const settings = workspace?.settings as any;
      const pat = settings?.integrations?.githubPat;
      if (pat) return pat;
    } catch {
      // Fall through to env
    }

    // Fall back to environment variable
    if (process.env.GITHUB_PAT) {
      return process.env.GITHUB_PAT;
    }

    return null;
  }
}
