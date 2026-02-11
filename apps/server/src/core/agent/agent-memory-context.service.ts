import { Injectable } from '@nestjs/common';
import { AgentMemoryService } from '../agent-memory/agent-memory.service';
import { KnowledgeService } from '../knowledge/knowledge.service';

export type MemoryContextParams = {
  workspaceId: string;
  spaceId: string;
  userId?: string;
  pageId?: string;
  projectId?: string | null;
  sessionId?: string;
  message?: string;
  pageTitle?: string | null;
  recentLimit?: number;
  shortTermDays?: number;
  shortTermLimit?: number;
  projectLimit?: number;
  topicLimit?: number;
  profileLimit?: number;
  profileTags?: string[];
  knowledgeLimit?: number;
  includeRecent?: boolean;
  includeShortTerm?: boolean;
  includeProject?: boolean;
  includeTopic?: boolean;
  includeProfile?: boolean;
  includeKnowledge?: boolean;
};

export type MemoryContextResult = {
  tags: {
    pageChatTag: string;
    sessionChatTag: string | null;
    chatTag: string;
    projectChatTag: string | null;
    pageTag: string | null;
    userTag: string | null;
  };
  memories: {
    recentMemories: any[];
    shortTermMemories: any[];
    projectMemories: any[];
    topicMemories: any[];
    profileMemories: any[];
  };
  knowledge: Array<{
    content: string;
    sourceName: string;
    similarity: number;
    metadata?: any;
  }>;
};

@Injectable()
export class AgentMemoryContextService {
  constructor(
    private readonly memoryService: AgentMemoryService,
    private readonly knowledgeService: KnowledgeService,
  ) {}

  async buildContext(params: MemoryContextParams): Promise<MemoryContextResult> {
    const pageChatTag = params.pageId
      ? `agent-chat-page:${params.pageId}`
      : 'agent-chat';
    const sessionChatTag = params.sessionId
      ? `agent-chat-session:${params.sessionId}`
      : null;
    const chatTag = sessionChatTag || pageChatTag;
    const projectChatTag = params.projectId ? `project:${params.projectId}` : null;
    const pageTag = params.pageId ? `page:${params.pageId}` : null;
    const userTag = params.userId ? `user:${params.userId}` : null;

    const recentMemories =
      params.includeRecent === false
        ? []
        : await this.memoryService.queryMemories(
            {
              workspaceId: params.workspaceId,
              spaceId: params.spaceId,
              tags: [chatTag],
              limit: params.recentLimit ?? 5,
            },
            undefined,
          );

    const shortTermDays = params.shortTermDays ?? 14;
    const shortTermSince = new Date(
      Date.now() - shortTermDays * 24 * 60 * 60 * 1000,
    );
    const shortTermMemories =
      params.includeShortTerm === false
        ? []
        : await this.memoryService.queryMemories(
            {
              workspaceId: params.workspaceId,
              spaceId: params.spaceId,
              from: shortTermSince,
              limit: params.shortTermLimit ?? 8,
            },
            undefined,
          );

    const projectMemories =
      params.includeProject === false || !projectChatTag
        ? []
        : await this.memoryService.queryMemories(
            {
              workspaceId: params.workspaceId,
              spaceId: params.spaceId,
              tags: [projectChatTag],
              limit: params.projectLimit ?? 6,
            },
            undefined,
          );

    const topicQuery = params.message || params.pageTitle || '';
    const topicMemories =
      params.includeTopic === false || !topicQuery
        ? []
        : await this.memoryService.queryMemories(
            {
              workspaceId: params.workspaceId,
              spaceId: params.spaceId,
              limit: params.topicLimit ?? 6,
            },
            topicQuery,
          );

    const profileTags =
      params.profileTags ??
      (userTag ? [userTag] : []);
    const profileMemories =
      params.includeProfile === false || profileTags.length === 0
        ? []
        : await this.memoryService.queryMemories(
            {
              workspaceId: params.workspaceId,
              spaceId: params.spaceId,
              tags: profileTags,
              limit: params.profileLimit ?? 1,
            },
            undefined,
          );

    // Search knowledge base for relevant documentation
    const knowledgeQuery = params.message || params.pageTitle || '';
    const knowledge =
      params.includeKnowledge === false || !knowledgeQuery
        ? []
        : await this.knowledgeService
            .searchKnowledge({
              query: knowledgeQuery,
              workspaceId: params.workspaceId,
              spaceId: params.spaceId,
              limit: params.knowledgeLimit ?? 3,
            })
            .catch(() => []); // Gracefully handle if knowledge search fails

    return {
      tags: {
        pageChatTag,
        sessionChatTag,
        chatTag,
        projectChatTag,
        pageTag,
        userTag,
      },
      memories: {
        recentMemories,
        shortTermMemories,
        projectMemories,
        topicMemories,
        profileMemories,
      },
      knowledge,
    };
  }
}
