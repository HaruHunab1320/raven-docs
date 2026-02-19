import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectKysely } from 'nestjs-kysely';
import { SwarmExecutionRepo } from '../../database/repos/coding-swarm/swarm-execution.repo';
import { CodingWorkspaceRepo } from '../../database/repos/coding-swarm/coding-workspace.repo';
import { GitWorkspaceService } from '../git-workspace/git-workspace.service';
import { ParallaxAgentsService } from '../parallax-agents/parallax-agents.service';
import { WorkspaceRepo } from '../../database/repos/workspace/workspace.repo';
import { KyselyDB } from '../../database/types/kysely.types';
import { QueueName, QueueJob } from '../../integrations/queue/constants';

@Injectable()
export class CodingSwarmService {
  private readonly logger = new Logger(CodingSwarmService.name);

  constructor(
    private readonly swarmExecRepo: SwarmExecutionRepo,
    private readonly codingWorkspaceRepo: CodingWorkspaceRepo,
    private readonly gitWorkspaceService: GitWorkspaceService,
    private readonly parallaxAgentsService: ParallaxAgentsService,
    private readonly workspaceRepo: WorkspaceRepo,
    private readonly eventEmitter: EventEmitter2,
    @InjectQueue(QueueName.GENERAL_QUEUE) private readonly generalQueue: Queue,
    @InjectKysely() private readonly db: KyselyDB,
  ) {}

  /**
   * Entry point — create execution and enqueue processing job
   */
  async execute(params: {
    workspaceId: string;
    experimentId?: string;
    spaceId?: string;
    repoUrl: string;
    taskDescription: string;
    agentType?: string;
    baseBranch?: string;
    taskContext?: Record<string, any>;
    triggeredBy?: string;
    config?: Record<string, any>;
  }) {
    const execution = await this.swarmExecRepo.create({
      workspaceId: params.workspaceId,
      taskDescription: params.taskDescription,
      spaceId: params.spaceId,
      experimentId: params.experimentId,
      agentType: params.agentType || 'claude-code',
      taskContext: params.taskContext,
      config: {
        ...params.config,
        repoUrl: params.repoUrl,
        baseBranch: params.baseBranch || 'main',
      },
      triggeredBy: params.triggeredBy,
    });

    // Enqueue for async processing
    await this.generalQueue.add(
      QueueJob.CODING_SWARM,
      { executionId: execution.id },
      {
        attempts: 1,
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 20 },
      },
    );

    this.logger.log(
      `Coding swarm execution ${execution.id} enqueued for workspace ${params.workspaceId}`,
    );

    return { executionId: execution.id, status: 'pending' };
  }

  /**
   * Process execution — called by BullMQ processor
   */
  async processExecution(executionId: string) {
    const execution = await this.swarmExecRepo.findById(executionId);
    if (!execution) throw new Error(`Execution ${executionId} not found`);

    const config = execution.config as any;

    try {
      // Step 1: Provision git workspace
      await this.swarmExecRepo.updateStatus(executionId, 'provisioning');
      this.emitStatusChanged(execution.workspaceId, executionId, 'provisioning');

      const gitWorkspace = await this.gitWorkspaceService.provision({
        workspaceId: execution.workspaceId,
        repoUrl: config.repoUrl,
        experimentId: execution.experimentId || undefined,
        spaceId: execution.spaceId || undefined,
        baseBranch: config.baseBranch || 'main',
      });

      await this.swarmExecRepo.updateStatus(executionId, 'spawning', {
        codingWorkspaceId: gitWorkspace.id,
      });
      this.emitStatusChanged(execution.workspaceId, executionId, 'spawning');

      // Step 2: Spawn coding agent via parallax
      const spawnResult = await this.parallaxAgentsService.spawnAgents(
        execution.workspaceId,
        {
          agentType: execution.agentType,
          count: 1,
          name: `swarm-${executionId.slice(0, 8)}`,
          config: { workdir: gitWorkspace.path },
        },
        execution.triggeredBy || 'system',
      );

      const agentId = spawnResult.spawnedAgents?.[0]?.id;
      if (agentId) {
        await this.swarmExecRepo.updateStatus(executionId, 'spawning', {
          agentId,
        });
      }

      this.logger.log(
        `Spawned coding agent ${agentId} for execution ${executionId}`,
      );

      // Steps 3-7 are event-driven (agent_ready → send task → agent_stopped → capture → finalize)
      // The CodingSwarmListener will call handleAgentReady/handleAgentStopped

    } catch (error: any) {
      this.logger.error(
        `Execution ${executionId} failed: ${error.message}`,
        error.stack,
      );
      await this.swarmExecRepo.updateStatus(executionId, 'failed', {
        errorMessage: error.message,
        completedAt: new Date(),
      });
      this.emitStatusChanged(execution.workspaceId, executionId, 'failed');
      throw error;
    }
  }

  /**
   * Called by listener when agent is ready — send the task
   */
  async handleAgentReady(agentId: string, data: any) {
    const execution = await this.findExecutionByAgentId(agentId);
    if (!execution) return;

    await this.swarmExecRepo.updateStatus(execution.id, 'running', {
      startedAt: new Date(),
      runtimeSessionId: data.runtimeSessionId,
      terminalSessionId: data.terminalSessionId,
    });
    this.emitStatusChanged(execution.workspaceId, execution.id, 'running');

    // Send the task to the agent via runtime API
    try {
      const taskPayload = this.buildTaskPayload(execution);
      await this.sendToRuntime(execution.workspaceId, agentId, taskPayload);
      this.logger.log(`Sent task to agent ${agentId} for execution ${execution.id}`);
    } catch (error: any) {
      this.logger.error(
        `Failed to send task to agent ${agentId}: ${error.message}`,
      );
    }
  }

  /**
   * Called by listener when agent stops — capture results and finalize
   */
  async handleAgentStopped(agentId: string, data: any) {
    const execution = await this.findExecutionByAgentId(agentId);
    if (!execution) return;

    try {
      // Step 6: Capture results
      await this.swarmExecRepo.updateStatus(execution.id, 'capturing');

      await this.swarmExecRepo.updateResults(execution.id, {
        outputSummary: data.reason || 'Agent completed',
        exitCode: data.exitCode ?? 0,
        results: data.results || {},
        filesChanged: data.filesChanged || [],
      });

      // Step 7: Finalize — commit, push, PR
      if (execution.codingWorkspaceId) {
        await this.swarmExecRepo.updateStatus(execution.id, 'finalizing');
        this.emitStatusChanged(execution.workspaceId, execution.id, 'finalizing');

        try {
          const finResult = await this.gitWorkspaceService.finalize(
            execution.codingWorkspaceId,
            {
              commitMessage: `Coding swarm results: ${execution.taskDescription.slice(0, 50)}`,
              prTitle: `[Experiment] ${execution.taskDescription.slice(0, 60)}`,
              prBody: [
                `## Coding Swarm Results`,
                ``,
                `**Agent type:** ${execution.agentType}`,
                `**Task:** ${execution.taskDescription}`,
                `**Execution:** ${execution.id}`,
              ].join('\n'),
            },
          );

          // Update experiment page metadata if linked
          if (execution.experimentId) {
            await this.updateExperimentMetadata(execution.experimentId, {
              codeRef: finResult.prUrl,
              prNumber: finResult.prNumber,
              commitSha: finResult.commitSha,
              status: 'completed',
            });
          }
        } catch (finError: any) {
          this.logger.warn(
            `Finalization failed for ${execution.id}: ${finError.message}`,
          );
        }
      }

      // Mark completed
      await this.swarmExecRepo.updateStatus(execution.id, 'completed', {
        completedAt: new Date(),
      });
      this.emitStatusChanged(execution.workspaceId, execution.id, 'completed');

      this.eventEmitter.emit('coding_swarm.completed', {
        workspaceId: execution.workspaceId,
        executionId: execution.id,
        experimentId: execution.experimentId,
      });

      // Schedule deferred cleanup (30 min)
      this.scheduleCleanup(execution.codingWorkspaceId, 30 * 60 * 1000);

    } catch (error: any) {
      this.logger.error(
        `Failed to capture/finalize execution ${execution.id}: ${error.message}`,
        error.stack,
      );
      await this.swarmExecRepo.updateStatus(execution.id, 'failed', {
        errorMessage: error.message,
        completedAt: new Date(),
      });
      this.emitStatusChanged(execution.workspaceId, execution.id, 'failed');
    }
  }

  /**
   * Called by listener on agent error
   */
  async handleAgentError(agentId: string, data: any) {
    const execution = await this.findExecutionByAgentId(agentId);
    if (!execution) return;

    await this.swarmExecRepo.updateStatus(execution.id, 'failed', {
      errorMessage: data.error || 'Agent error',
      completedAt: new Date(),
    });
    this.emitStatusChanged(execution.workspaceId, execution.id, 'failed');

    // Cleanup workspace
    if (execution.codingWorkspaceId) {
      this.scheduleCleanup(execution.codingWorkspaceId, 5 * 60 * 1000);
    }
  }

  /**
   * Get execution status
   */
  async getStatus(executionId: string) {
    return this.swarmExecRepo.findById(executionId);
  }

  /**
   * List executions for a workspace
   */
  async list(
    workspaceId: string,
    opts?: { status?: string; experimentId?: string; limit?: number },
  ) {
    return this.swarmExecRepo.findByWorkspace(workspaceId, opts);
  }

  /**
   * Stop a running execution
   */
  async stop(executionId: string) {
    const execution = await this.swarmExecRepo.findById(executionId);
    if (!execution) throw new Error(`Execution ${executionId} not found`);

    // Stop the runtime agent if running
    if (execution.agentId) {
      try {
        await this.stopRuntimeAgent(execution.workspaceId, execution.agentId);
      } catch (error: any) {
        this.logger.warn(
          `Failed to stop agent ${execution.agentId}: ${error.message}`,
        );
      }
    }

    await this.swarmExecRepo.updateStatus(executionId, 'cancelled', {
      completedAt: new Date(),
    });
    this.emitStatusChanged(execution.workspaceId, executionId, 'cancelled');

    // Cleanup workspace
    if (execution.codingWorkspaceId) {
      this.scheduleCleanup(execution.codingWorkspaceId, 5 * 60 * 1000);
    }

    return { success: true, executionId, status: 'cancelled' };
  }

  /**
   * Get terminal logs for an execution
   */
  async getLogs(executionId: string, limit?: number) {
    const execution = await this.swarmExecRepo.findById(executionId);
    if (!execution) throw new Error(`Execution ${executionId} not found`);

    if (!execution.terminalSessionId) {
      return { logs: [], message: 'No terminal session associated' };
    }

    const logs = await this.db
      .selectFrom('terminalSessionLogs')
      .selectAll()
      .where('sessionId', '=', execution.terminalSessionId)
      .orderBy('createdAt', 'desc')
      .limit(limit || 100)
      .execute();

    return { logs };
  }

  // --- Private helpers ---

  private async getRuntimeEndpoint(workspaceId: string): Promise<string | null> {
    if (process.env.AGENT_RUNTIME_ENDPOINT) {
      return process.env.AGENT_RUNTIME_ENDPOINT;
    }
    return null;
  }

  private async sendToRuntime(
    workspaceId: string,
    agentId: string,
    payload: { message: string; context?: any },
  ) {
    const endpoint = await this.getRuntimeEndpoint(workspaceId);
    if (!endpoint) {
      throw new Error('Runtime endpoint not configured');
    }

    const response = await fetch(`${endpoint}/api/agents/${agentId}/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Workspace-Id': workspaceId,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Runtime returned ${response.status}: ${errorText}`);
    }

    return response.json();
  }

  private async stopRuntimeAgent(workspaceId: string, agentId: string) {
    const endpoint = await this.getRuntimeEndpoint(workspaceId);
    if (!endpoint) {
      throw new Error('Runtime endpoint not configured');
    }

    const response = await fetch(`${endpoint}/api/agents/${agentId}/stop`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Workspace-Id': workspaceId,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Runtime returned ${response.status}: ${errorText}`);
    }
  }

  private async findExecutionByAgentId(agentId: string) {
    // Find active execution matching this agentId
    const results = await this.db
      .selectFrom('swarmExecutions')
      .selectAll()
      .where('agentId', '=', agentId)
      .where('status', 'in', ['spawning', 'running', 'capturing', 'finalizing'])
      .orderBy('createdAt', 'desc')
      .limit(1)
      .execute();

    return results[0] || null;
  }

  private buildTaskPayload(execution: any) {
    const context = execution.taskContext || {};
    return {
      message: execution.taskDescription,
      context: {
        experimentId: execution.experimentId,
        ...context,
      },
    };
  }

  private async updateExperimentMetadata(
    experimentId: string,
    data: Record<string, any>,
  ) {
    try {
      const page = await this.db
        .selectFrom('pages')
        .select(['id', 'metadata'])
        .where('id', '=', experimentId)
        .executeTakeFirst();

      if (page) {
        const currentMetadata = (page.metadata as any) || {};
        const updatedMetadata = {
          ...currentMetadata,
          codingSwarm: {
            ...currentMetadata.codingSwarm,
            ...data,
          },
        };

        await this.db
          .updateTable('pages')
          .set({
            metadata: JSON.stringify(updatedMetadata),
            updatedAt: new Date(),
          })
          .where('id', '=', experimentId)
          .execute();
      }
    } catch (error: any) {
      this.logger.warn(
        `Failed to update experiment metadata for ${experimentId}: ${error.message}`,
      );
    }
  }

  private emitStatusChanged(
    workspaceId: string,
    executionId: string,
    status: string,
  ) {
    this.eventEmitter.emit('coding_swarm.status_changed', {
      workspaceId,
      executionId,
      status,
    });
  }

  private scheduleCleanup(codingWorkspaceId: string | null, delayMs: number) {
    if (!codingWorkspaceId) return;
    setTimeout(async () => {
      try {
        await this.gitWorkspaceService.cleanup(codingWorkspaceId);
      } catch (error: any) {
        this.logger.warn(
          `Deferred cleanup failed for ${codingWorkspaceId}: ${error.message}`,
        );
      }
    }, delayMs);
  }
}
