import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ParallaxClientService } from './parallax-client.service';
import { TeamDeploymentRepo } from '../../database/repos/team/team-deployment.repo';

const POLL_INTERVAL_MS = 5_000;

// Thread statuses that mean the thread is done — stop polling it
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'stopped']);

/**
 * Polls Parallax thread status for active remote deployments and translates
 * thread lifecycle events into the standard parallax.* event names so the
 * existing team event handlers work unchanged in both local and remote mode.
 *
 * Only active when PARALLAX_API_KEY + PARALLAX_CONTROL_PLANE_URL are set.
 *
 * Thread → parallax event mapping:
 *   pending/preparing/starting → (no event yet)
 *   ready                      → parallax.agent_started + parallax.agent_ready
 *   running                    → (output events handled separately)
 *   blocked                    → parallax.blocking_prompt
 *   completed                  → parallax.task_complete → parallax.agent_stopped
 *   failed                     → parallax.agent_error
 *   stopped                    → parallax.agent_stopped
 */
@Injectable()
export class ParallaxThreadPollerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ParallaxThreadPollerService.name);
  private pollingTimer: ReturnType<typeof setInterval> | null = null;

  /** threadId → last known status */
  private statusCache = new Map<string, string>();
  /** threadId → number of events seen (cursor) */
  private eventCursors = new Map<string, number>();
  /** deploymentId → workspaceId (cached) */
  private workspaceCache = new Map<string, string>();

  constructor(
    private readonly parallaxClient: ParallaxClientService,
    private readonly teamRepo: TeamDeploymentRepo,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  onModuleInit() {
    // SDK client may be configured but health check is async — start if client
    // is instantiated, let poll() skip silently if still unhealthy.
    if (!this.parallaxClient.sdkClient) return;
    this.pollingTimer = setInterval(() => void this.poll(), POLL_INTERVAL_MS);
    this.logger.log('Thread poller started');
  }

  onModuleDestroy() {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
    this.statusCache.clear();
    this.eventCursors.clear();
    this.workspaceCache.clear();
  }

  private async poll(): Promise<void> {
    // Skip if SDK not yet healthy (health check is async and may still be pending)
    if (!this.parallaxClient.isSdkAvailable) return;
    try {
      const deployments = await this.teamRepo.findActiveDeployments();

      for (const deployment of deployments) {
        const config = this.parseJson(deployment.config);
        const executionId = config?.parallaxExecutionId as string | undefined;
        // Only poll deployments that were started via threads
        if (!executionId || !config?.parallaxThreadIds) continue;

        await this.pollDeployment(deployment.id, deployment.workspaceId, executionId);
      }
    } catch (err: any) {
      this.logger.warn(`Thread poll error: ${err?.message}`);
    }
  }

  private async pollDeployment(
    deploymentId: string,
    workspaceId: string,
    executionId: string,
  ): Promise<void> {
    this.workspaceCache.set(deploymentId, workspaceId);

    let threads: Awaited<ReturnType<typeof this.parallaxClient.getThreadsByExecution>>;
    try {
      threads = await this.parallaxClient.getThreadsByExecution(executionId);
    } catch {
      return;
    }

    for (const thread of threads) {
      const prevStatus = this.statusCache.get(thread.id);
      const currStatus = thread.status;

      if (prevStatus !== currStatus) {
        this.statusCache.set(thread.id, currStatus);
        await this.handleStatusChange(thread, prevStatus, workspaceId);
      }

      // Poll events for non-terminal threads
      if (!TERMINAL_STATUSES.has(currStatus)) {
        await this.pollThreadEvents(thread, workspaceId);
      } else {
        // Clean up cursor for terminal threads
        this.eventCursors.delete(thread.id);
      }
    }
  }

  private async handleStatusChange(
    thread: { id: string; role?: string; agentType: string; status: string; objective?: string },
    prevStatus: string | undefined,
    workspaceId: string,
  ): Promise<void> {
    const { id: threadId, role, agentType, status } = thread;

    this.logger.debug(
      `Thread ${threadId} (role=${role}) status: ${prevStatus ?? 'new'} → ${status}`,
    );

    switch (status) {
      case 'starting':
      case 'ready':
        // First time we see this thread as starting/ready — emit agent_started
        if (!prevStatus || prevStatus === 'pending' || prevStatus === 'preparing') {
          this.eventEmitter.emit('parallax.agent_started', {
            workspaceId,
            agent: {
              id: threadId,
              role,
              type: agentType,
              runtimeSessionId: threadId,
            },
          });
        }
        if (status === 'ready') {
          this.eventEmitter.emit('parallax.agent_ready', {
            workspaceId,
            agentId: threadId,
          });
        }
        break;

      case 'blocked':
        this.eventEmitter.emit('parallax.blocking_prompt', {
          workspaceId,
          agentId: threadId,
          runtimeSessionId: threadId,
          promptInfo: { type: 'blocked', prompt: 'Thread blocked — waiting for input' },
        });
        break;

      case 'completed': {
        // Emit task_complete then agent_stopped
        this.eventEmitter.emit('parallax.task_complete', {
          workspaceId,
          agentId: threadId,
          runtimeSessionId: threadId,
          result: { summary: 'Thread completed', reason: 'thread_completed' },
        });
        await new Promise((r) => setTimeout(r, 200));
        this.eventEmitter.emit('parallax.agent_stopped', {
          workspaceId,
          agentId: threadId,
          reason: 'completed',
          exitCode: 0,
        });
        break;
      }

      case 'failed':
        this.eventEmitter.emit('parallax.agent_error', {
          workspaceId,
          agentId: threadId,
          error: 'Thread failed',
        });
        break;

      case 'stopped':
        this.eventEmitter.emit('parallax.agent_stopped', {
          workspaceId,
          agentId: threadId,
          reason: 'stopped',
        });
        break;
    }
  }

  private async pollThreadEvents(
    thread: { id: string; role?: string },
    workspaceId: string,
  ): Promise<void> {
    let events: unknown[];
    try {
      events = await this.parallaxClient.getThreadEvents(thread.id);
    } catch {
      return;
    }

    if (!events.length) return;

    const cursor = this.eventCursors.get(thread.id) ?? 0;
    const newEvents = events.slice(cursor);
    if (!newEvents.length) return;

    this.eventCursors.set(thread.id, events.length);

    for (const event of newEvents) {
      this.handleThreadEvent(thread.id, workspaceId, event as Record<string, unknown>);
    }
  }

  private handleThreadEvent(
    threadId: string,
    workspaceId: string,
    event: Record<string, unknown>,
  ): void {
    const type = event.type as string | undefined;
    if (!type) return;

    switch (type) {
      case 'thread_output':
        // Raw output — not mapped to a parallax.* event, but useful for logs
        break;

      case 'thread_tool_running':
        this.eventEmitter.emit('parallax.tool_running', {
          workspaceId,
          agentId: threadId,
          info: {
            toolName: (event.data as any)?.tool || 'unknown',
            description: (event.data as any)?.description || '',
          },
          autoInterruptEnabled: true,
        });
        break;

      case 'thread_blocked':
        this.eventEmitter.emit('parallax.blocking_prompt', {
          workspaceId,
          agentId: threadId,
          runtimeSessionId: threadId,
          promptInfo: {
            type: 'blocked',
            prompt: (event.data as any)?.prompt || 'Thread blocked',
          },
        });
        break;

      case 'thread_idle':
        // Agent is idle/waiting — could deliver pending messages
        this.eventEmitter.emit('parallax.agent_idle', {
          workspaceId,
          agentId: threadId,
          runtimeSessionId: threadId,
        });
        break;
    }
  }

  private parseJson(value: unknown): Record<string, unknown> | null {
    if (!value) return null;
    if (typeof value === 'string') {
      try { return JSON.parse(value); } catch { return null; }
    }
    return value as Record<string, unknown>;
  }
}
