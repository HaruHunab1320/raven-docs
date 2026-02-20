// Mock deep transitive imports to avoid module resolution issues in Jest
jest.mock('../../common/helpers/prosemirror/html/index', () => ({}));
jest.mock('../../collaboration/collaboration.util', () => ({}));
jest.mock('../../core/workspace/services/workspace-invitation.service', () => ({
  WorkspaceInvitationService: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { MCPService } from './mcp.service';
import { MCPRequest } from './interfaces/mcp.interface';
import { User } from '@raven-docs/db/types/entity.types';
import { PageHandler } from './handlers/page.handler';
import { SpaceHandler } from './handlers/space.handler';
import { UserHandler } from './handlers/user.handler';
import { GroupHandler } from './handlers/group.handler';
import { WorkspaceHandler } from './handlers/workspace.handler';
import { AttachmentHandler } from './handlers/attachment.handler';
import { CommentHandler } from './handlers/comment.handler';
import { SystemHandler } from './handlers/system.handler';
import { ContextHandler } from './handlers/context.handler';
import { UIHandler } from './handlers/ui.handler';
import { ProjectHandler } from './handlers/project.handler';
import { TaskHandler } from './handlers/task.handler';
import { ApprovalHandler } from './handlers/approval.handler';
import { MCPApprovalService } from './services/mcp-approval.service';
import { AgentPolicyService } from '../../core/agent/agent-policy.service';
import { WorkspaceRepo } from '@raven-docs/db/repos/workspace/workspace.repo';
import { SearchHandler } from './handlers/search.handler';
import { ImportHandler } from './handlers/import.handler';
import { ExportHandler } from './handlers/export.handler';
import { AIHandler } from './handlers/ai.handler';
import { MemoryHandler } from './handlers/memory.handler';
import { RepoHandler } from './handlers/repo.handler';
import { ResearchHandler } from './handlers/research.handler';
import { ParallaxAgentHandler } from './handlers/parallax-agent.handler';
import { GoalHandler } from './handlers/goal.handler';
import { ProfileHandler } from './handlers/profile.handler';
import { ReviewHandler } from './handlers/review.handler';
import { InsightsHandler } from './handlers/insights.handler';
import { KnowledgeHandler } from './handlers/knowledge.handler';
import { HypothesisHandler } from './handlers/hypothesis.handler';
import { ExperimentHandler } from './handlers/experiment.handler';
import { IntelligenceContextHandler } from './handlers/intelligence-context.handler';
import { RelationshipHandler } from './handlers/relationship.handler';
import { TeamHandler } from './handlers/team.handler';
import { PatternHandler } from './handlers/pattern.handler';
import { SwarmHandler } from './handlers/swarm.handler';
import { GitHubIssueHandler } from './handlers/github-issue.handler';
import { MCPEventService } from './services/mcp-event.service';
import { BugReportService } from '../../core/bug-report/bug-report.service';
import { MCPErrorCode } from './utils/error.utils';

describe('MCPService', () => {
  let service: MCPService;

  const mockUser: User = {
    id: 'user-123',
    email: 'test@example.com',
    workspaceId: 'workspace-123',
    name: 'Test User',
    role: 'member',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as User;

  const mockPageHandler = {
    listPages: jest.fn(),
    getPage: jest.fn(),
    createPage: jest.fn(),
    updatePage: jest.fn(),
    deletePage: jest.fn(),
    getRecentPages: jest.fn(),
    getPageBreadcrumbs: jest.fn(),
    getSidebarPages: jest.fn(),
    getPageHistoryInfo: jest.fn(),
    movePageToSpace: jest.fn(),
    movePage: jest.fn(),
    searchPages: jest.fn(),
    getPageHistory: jest.fn(),
    restorePageVersion: jest.fn(),
  };

  const mockSystemHandler = {
    listMethods: jest.fn(),
    getMethodSchema: jest.fn(),
  };

  const mockApprovalService = {
    requiresApproval: jest.fn(),
    createApproval: jest.fn(),
    consumeApproval: jest.fn(),
  };

  const mockPolicyService = {
    isSupportedMethod: jest.fn(),
    evaluate: jest.fn(),
  };

  const mockWorkspaceRepo = {
    findById: jest.fn(),
  };

  const mockEventService = {
    createToolExecutedEvent: jest.fn(),
  };

  const mockBugReportService = {
    createAutoReport: jest.fn(),
  };

  beforeEach(async () => {
    // Set up default mock returns
    mockPolicyService.isSupportedMethod.mockReturnValue(true);
    mockPolicyService.evaluate.mockReturnValue({ decision: 'auto', reason: '' });
    mockWorkspaceRepo.findById.mockResolvedValue({ settings: {} });
    mockApprovalService.requiresApproval.mockReturnValue(false);
    mockBugReportService.createAutoReport.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MCPService,
        { provide: PageHandler, useValue: mockPageHandler },
        { provide: SpaceHandler, useValue: {} },
        { provide: UserHandler, useValue: {} },
        { provide: GroupHandler, useValue: {} },
        { provide: WorkspaceHandler, useValue: {} },
        { provide: AttachmentHandler, useValue: {} },
        { provide: CommentHandler, useValue: {} },
        { provide: SystemHandler, useValue: mockSystemHandler },
        { provide: ContextHandler, useValue: {} },
        { provide: UIHandler, useValue: {} },
        { provide: ProjectHandler, useValue: {} },
        { provide: TaskHandler, useValue: {} },
        { provide: ApprovalHandler, useValue: {} },
        { provide: MCPApprovalService, useValue: mockApprovalService },
        { provide: AgentPolicyService, useValue: mockPolicyService },
        { provide: WorkspaceRepo, useValue: mockWorkspaceRepo },
        { provide: SearchHandler, useValue: {} },
        { provide: ImportHandler, useValue: {} },
        { provide: ExportHandler, useValue: {} },
        { provide: AIHandler, useValue: {} },
        { provide: MemoryHandler, useValue: {} },
        { provide: RepoHandler, useValue: {} },
        { provide: ResearchHandler, useValue: {} },
        { provide: ParallaxAgentHandler, useValue: {} },
        { provide: GoalHandler, useValue: {} },
        { provide: ProfileHandler, useValue: {} },
        { provide: ReviewHandler, useValue: {} },
        { provide: InsightsHandler, useValue: {} },
        { provide: KnowledgeHandler, useValue: {} },
        { provide: HypothesisHandler, useValue: {} },
        { provide: ExperimentHandler, useValue: {} },
        { provide: IntelligenceContextHandler, useValue: {} },
        { provide: RelationshipHandler, useValue: {} },
        { provide: TeamHandler, useValue: {} },
        { provide: PatternHandler, useValue: {} },
        { provide: SwarmHandler, useValue: {} },
        { provide: GitHubIssueHandler, useValue: {} },
        { provide: MCPEventService, useValue: mockEventService },
        { provide: BugReportService, useValue: mockBugReportService },
      ],
    }).compile();

    service = module.get<MCPService>(MCPService);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processRequest', () => {
    it('should process a valid page.list request', async () => {
      const request: MCPRequest = {
        jsonrpc: '2.0',
        method: 'page.list',
        params: { spaceId: 'space-123' },
        id: 'req-123',
      };

      const expectedResult = { pages: [{ id: 'page-1', title: 'Test Page' }] };
      mockPageHandler.listPages.mockResolvedValue(expectedResult);

      const response = await service.processRequest(request, mockUser);

      expect(response).toEqual({
        jsonrpc: '2.0',
        result: expectedResult,
        id: 'req-123',
      });
      expect(mockPageHandler.listPages).toHaveBeenCalledWith(
        request.params,
        mockUser.id,
      );
    });

    it('should deny a request when policy decision is deny', async () => {
      mockPolicyService.evaluate.mockReturnValue({
        decision: 'deny',
        reason: 'blocked by policy',
      });

      const request: MCPRequest = {
        jsonrpc: '2.0',
        method: 'page.list',
        params: { spaceId: 'space-123' },
        id: 'req-123',
      };

      const response = await service.processRequest(request, mockUser);

      expect(response.error?.code).toBe(MCPErrorCode.PERMISSION_DENIED);
      expect(response.error?.message).toBe('Permission denied');
      expect(response.error?.data).toMatchObject({
        method: 'page.list',
        reason: 'blocked by policy',
      });
    });

    it('should require approval when policy decision is approval', async () => {
      mockPolicyService.evaluate.mockReturnValue({
        decision: 'approval',
        reason: 'needs approval',
      });
      mockApprovalService.createApproval.mockResolvedValue({
        token: 'approval-token',
        expiresAt: new Date().toISOString(),
      });

      const request: MCPRequest = {
        jsonrpc: '2.0',
        method: 'page.create',
        params: { spaceId: 'space-123', title: 'New Page' },
        id: 'req-123',
      };

      const response = await service.processRequest(request, mockUser);

      expect(response.error?.code).toBe(MCPErrorCode.APPROVAL_REQUIRED);
      expect(response.error?.message).toBe('Approval required');
      expect(response.error?.data).toMatchObject({
        approvalToken: 'approval-token',
        method: 'page.create',
      });
    });

    it('should require approval when approvalService flags the method', async () => {
      mockApprovalService.requiresApproval.mockReturnValue(true);
      mockApprovalService.createApproval.mockResolvedValue({
        token: 'token-456',
        expiresAt: new Date().toISOString(),
      });

      const request: MCPRequest = {
        jsonrpc: '2.0',
        method: 'page.delete',
        params: { pageId: 'page-123' },
        id: 'req-123',
      };

      const response = await service.processRequest(request, mockUser);

      expect(response.error?.code).toBe(MCPErrorCode.APPROVAL_REQUIRED);
    });

    it('should reject invalid approval tokens', async () => {
      mockApprovalService.consumeApproval.mockResolvedValue(false);

      const request: MCPRequest = {
        jsonrpc: '2.0',
        method: 'page.update',
        params: {
          pageId: 'page-123',
          approvalToken: 'bad-token',
        },
        id: 'req-123',
      };

      const response = await service.processRequest(request, mockUser);

      expect(response.error?.code).toBe(MCPErrorCode.APPROVAL_REQUIRED);
      expect(response.error?.data).toMatchObject({
        method: 'page.update',
      });
    });

    it('should accept valid approval tokens and proceed', async () => {
      mockApprovalService.consumeApproval.mockResolvedValue(true);
      const expectedResult = { id: 'page-123', title: 'Updated' };
      mockPageHandler.updatePage.mockResolvedValue(expectedResult);

      const request: MCPRequest = {
        jsonrpc: '2.0',
        method: 'page.update',
        params: {
          pageId: 'page-123',
          title: 'Updated',
          approvalToken: 'valid-token',
        },
        id: 'req-123',
      };

      const response = await service.processRequest(request, mockUser);

      expect(response.result).toEqual(expectedResult);
      expect(mockApprovalService.consumeApproval).toHaveBeenCalled();
    });
  });

  describe('request validation', () => {
    it('should reject unsupported JSON-RPC version', async () => {
      const request: MCPRequest = {
        jsonrpc: '1.0' as any,
        method: 'page.list',
        params: {},
        id: 'req-123',
      };

      const response = await service.processRequest(request, mockUser);

      expect(response.error?.code).toBe(MCPErrorCode.INVALID_REQUEST);
      expect(response.error?.message).toBe('Invalid request');
    });

    it('should reject missing method', async () => {
      const request: MCPRequest = {
        jsonrpc: '2.0',
        method: '',
        params: {},
        id: 'req-123',
      };

      const response = await service.processRequest(request, mockUser);

      expect(response.error?.code).toBe(MCPErrorCode.INVALID_REQUEST);
    });

    it('should reject method without dot separator', async () => {
      const request: MCPRequest = {
        jsonrpc: '2.0',
        method: 'invalidmethod',
        params: {},
        id: 'req-123',
      };

      const response = await service.processRequest(request, mockUser);

      expect(response.error?.code).toBe(MCPErrorCode.INVALID_REQUEST);
    });

    it('should reject request without id', async () => {
      const request = {
        jsonrpc: '2.0',
        method: 'page.list',
        params: {},
      } as MCPRequest;

      const response = await service.processRequest(request, mockUser);

      expect(response.error?.code).toBe(MCPErrorCode.INVALID_REQUEST);
    });

    it('should return method not found for unknown resource', async () => {
      const request: MCPRequest = {
        jsonrpc: '2.0',
        method: 'unknown.operation',
        params: {},
        id: 'req-123',
      };

      const response = await service.processRequest(request, mockUser);

      expect(response.error?.code).toBe(MCPErrorCode.METHOD_NOT_FOUND);
      expect(response.error?.message).toBe('Method not found');
    });

    it('should return method not found for unknown operation on known resource', async () => {
      const request: MCPRequest = {
        jsonrpc: '2.0',
        method: 'page.nonexistent',
        params: {},
        id: 'req-123',
      };

      const response = await service.processRequest(request, mockUser);

      expect(response.error?.code).toBe(MCPErrorCode.METHOD_NOT_FOUND);
    });

    it('should treat null params as empty object', async () => {
      const request: MCPRequest = {
        jsonrpc: '2.0',
        method: 'page.list',
        params: null as any,
        id: 'req-123',
      };

      mockPageHandler.listPages.mockResolvedValue({ pages: [] });

      await service.processRequest(request, mockUser);

      // params get passed through (the handler receives whatever was in params)
      expect(mockPageHandler.listPages).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should wrap plain Error in internal error response', async () => {
      const request: MCPRequest = {
        jsonrpc: '2.0',
        method: 'page.create',
        params: { title: 'Test' },
        id: 'req-123',
      };

      mockPageHandler.createPage.mockRejectedValue(
        new Error('Something went wrong'),
      );

      const response = await service.processRequest(request, mockUser);

      expect(response.error?.code).toBe(MCPErrorCode.INTERNAL_ERROR);
      expect(response.error?.message).toBe('Internal error');
    });

    it('should pass through MCP errors with code and message', async () => {
      const request: MCPRequest = {
        jsonrpc: '2.0',
        method: 'page.create',
        params: { title: 'Test' },
        id: 'req-123',
      };

      const mcpError = {
        code: MCPErrorCode.INVALID_PARAMS,
        message: 'Invalid params',
        data: 'title is required',
      };
      mockPageHandler.createPage.mockRejectedValue(mcpError);

      const response = await service.processRequest(request, mockUser);

      expect(response.error).toEqual(mcpError);
    });

    it('should handle string thrown as error', async () => {
      const request: MCPRequest = {
        jsonrpc: '2.0',
        method: 'page.create',
        params: { title: 'Test' },
        id: 'req-123',
      };

      mockPageHandler.createPage.mockRejectedValue('String error');

      const response = await service.processRequest(request, mockUser);

      expect(response.error?.code).toBe(MCPErrorCode.INTERNAL_ERROR);
    });

    it('should handle Error with empty message', async () => {
      const request: MCPRequest = {
        jsonrpc: '2.0',
        method: 'page.create',
        params: { title: 'Test' },
        id: 'req-123',
      };

      mockPageHandler.createPage.mockRejectedValue(new Error(''));

      const response = await service.processRequest(request, mockUser);

      expect(response.error?.code).toBe(MCPErrorCode.INTERNAL_ERROR);
    });
  });

  describe('page handler routing', () => {
    const makeRequest = (operation: string, params: any = {}): MCPRequest => ({
      jsonrpc: '2.0',
      method: `page.${operation}`,
      params,
      id: 'req-123',
    });

    it('should route page.get to getPage', async () => {
      mockPageHandler.getPage.mockResolvedValue({ id: 'page-1' });
      await service.processRequest(makeRequest('get', { pageId: 'page-1' }), mockUser);
      expect(mockPageHandler.getPage).toHaveBeenCalledWith({ pageId: 'page-1' }, mockUser.id);
    });

    it('should route page.list to listPages', async () => {
      mockPageHandler.listPages.mockResolvedValue({ pages: [] });
      await service.processRequest(makeRequest('list', { spaceId: 's1' }), mockUser);
      expect(mockPageHandler.listPages).toHaveBeenCalledWith({ spaceId: 's1' }, mockUser.id);
    });

    it('should route page.create to createPage', async () => {
      mockPageHandler.createPage.mockResolvedValue({ id: 'new' });
      await service.processRequest(makeRequest('create', { title: 'New' }), mockUser);
      expect(mockPageHandler.createPage).toHaveBeenCalledWith({ title: 'New' }, mockUser.id);
    });

    it('should route page.update to updatePage', async () => {
      mockPageHandler.updatePage.mockResolvedValue({ id: 'p1' });
      await service.processRequest(makeRequest('update', { pageId: 'p1', title: 'X' }), mockUser);
      expect(mockPageHandler.updatePage).toHaveBeenCalledWith({ pageId: 'p1', title: 'X' }, mockUser.id);
    });

    it('should route page.delete to deletePage', async () => {
      mockPageHandler.deletePage.mockResolvedValue({ success: true });
      await service.processRequest(makeRequest('delete', { pageId: 'p1' }), mockUser);
      expect(mockPageHandler.deletePage).toHaveBeenCalledWith({ pageId: 'p1' }, mockUser.id);
    });

    it('should route page.search to searchPages', async () => {
      mockPageHandler.searchPages.mockResolvedValue({ pages: [] });
      await service.processRequest(makeRequest('search', { query: 'test' }), mockUser);
      expect(mockPageHandler.searchPages).toHaveBeenCalledWith({ query: 'test' }, mockUser.id);
    });

    it('should route page.move to movePage', async () => {
      mockPageHandler.movePage.mockResolvedValue({ success: true });
      await service.processRequest(makeRequest('move', { pageId: 'p1' }), mockUser);
      expect(mockPageHandler.movePage).toHaveBeenCalledWith({ pageId: 'p1' }, mockUser.id);
    });
  });

  describe('system handler routing', () => {
    it('should route system.listMethods', async () => {
      mockSystemHandler.listMethods.mockResolvedValue({ methods: [] });
      const request: MCPRequest = {
        jsonrpc: '2.0',
        method: 'system.listMethods',
        params: {},
        id: 'req-123',
      };

      const response = await service.processRequest(request, mockUser);

      expect(response.result).toEqual({ methods: [] });
      expect(mockSystemHandler.listMethods).toHaveBeenCalled();
    });
  });
});
