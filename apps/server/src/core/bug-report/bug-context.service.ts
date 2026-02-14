import { Injectable, Logger } from '@nestjs/common';
import { AgentMemoryService } from '../agent-memory/agent-memory.service';

export interface UserJourneyAction {
  id: string;
  source: string | null;
  summary: string | null;
  timestamp: Date;
  content?: any;
}

export interface UserJourneyContext {
  recentActions: UserJourneyAction[];
  sessionStartedAt: Date | null;
}

@Injectable()
export class BugContextService {
  private readonly logger = new Logger(BugContextService.name);

  constructor(private readonly agentMemoryService: AgentMemoryService) {}

  async gatherUserJourney(params: {
    workspaceId: string;
    spaceId?: string;
    userId: string;
    minutesBack?: number;
  }): Promise<UserJourneyContext> {
    const minutesBack = params.minutesBack ?? 30;
    const fromTime = new Date(Date.now() - minutesBack * 60 * 1000);

    try {
      const memories = await this.agentMemoryService.queryMemories({
        workspaceId: params.workspaceId,
        spaceId: params.spaceId,
        creatorId: params.userId,
        from: fromTime,
        limit: 20,
      });

      const recentActions: UserJourneyAction[] = memories.map((memory) => ({
        id: memory.id,
        source: memory.source,
        summary: memory.summary,
        timestamp: new Date(memory.timestamp),
        content: memory.content,
      }));

      // Estimate session start based on first action in timeframe
      // or oldest action if we have any
      const sessionStartedAt =
        recentActions.length > 0
          ? recentActions[recentActions.length - 1].timestamp
          : null;

      return {
        recentActions,
        sessionStartedAt,
      };
    } catch (error: any) {
      this.logger.warn(
        `Failed to gather user journey for user ${params.userId}: ${error?.message || error}`,
      );
      return {
        recentActions: [],
        sessionStartedAt: null,
      };
    }
  }

  sanitizeUserJourney(journey: UserJourneyContext): UserJourneyContext {
    const sensitivePatterns = [
      /password/i,
      /secret/i,
      /token/i,
      /api[_-]?key/i,
      /credential/i,
      /auth[_-]?code/i,
    ];

    const sanitizeValue = (value: any): any => {
      if (typeof value === 'string') {
        let sanitized = value;
        for (const pattern of sensitivePatterns) {
          if (pattern.test(sanitized)) {
            sanitized = '[REDACTED]';
            break;
          }
        }
        return sanitized;
      }
      if (Array.isArray(value)) {
        return value.map(sanitizeValue);
      }
      if (value && typeof value === 'object') {
        const sanitized: Record<string, any> = {};
        for (const [key, val] of Object.entries(value)) {
          if (sensitivePatterns.some((p) => p.test(key))) {
            sanitized[key] = '[REDACTED]';
          } else {
            sanitized[key] = sanitizeValue(val);
          }
        }
        return sanitized;
      }
      return value;
    };

    return {
      recentActions: journey.recentActions.map((action) => ({
        ...action,
        content: action.content ? sanitizeValue(action.content) : undefined,
      })),
      sessionStartedAt: journey.sessionStartedAt,
    };
  }
}
