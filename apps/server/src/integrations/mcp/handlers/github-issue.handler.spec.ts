import { Test, TestingModule } from '@nestjs/testing';
import { GitHubIssueHandler } from './github-issue.handler';
import { GitWorkspaceService } from '../../../core/git-workspace/git-workspace.service';

describe('GitHubIssueHandler', () => {
  let handler: GitHubIssueHandler;

  const mockGitWorkspaceService = {
    createIssue: jest.fn(),
    getIssue: jest.fn(),
    listIssues: jest.fn(),
    updateIssue: jest.fn(),
    addIssueComment: jest.fn(),
    listIssueComments: jest.fn(),
    closeIssue: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GitHubIssueHandler,
        { provide: GitWorkspaceService, useValue: mockGitWorkspaceService },
      ],
    }).compile();

    handler = module.get<GitHubIssueHandler>(GitHubIssueHandler);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(handler).toBeDefined();
  });

  describe('create', () => {
    it('should create a GitHub issue', async () => {
      const mockIssue = {
        number: 42,
        title: 'Bug report',
        state: 'open',
        url: 'https://github.com/org/repo/issues/42',
      };
      mockGitWorkspaceService.createIssue.mockResolvedValue(mockIssue);

      const result = await handler.create(
        {
          workspaceId: 'ws-1',
          repoUrl: 'https://github.com/org/repo',
          title: 'Bug report',
          body: 'Something is broken',
          labels: ['bug'],
        },
        'user-1',
      );

      expect(result).toEqual(mockIssue);
      expect(mockGitWorkspaceService.createIssue).toHaveBeenCalledWith(
        'ws-1',
        'https://github.com/org/repo',
        expect.objectContaining({
          title: 'Bug report',
          body: 'Something is broken',
          labels: ['bug'],
        }),
      );
    });

    it('should throw when workspaceId is missing', async () => {
      await expect(
        handler.create({ repoUrl: 'x', title: 'test' }, 'user-1'),
      ).rejects.toMatchObject({
        code: expect.any(Number),
      });
    });

    it('should throw when repoUrl is missing', async () => {
      await expect(
        handler.create({ workspaceId: 'ws-1', title: 'test' }, 'user-1'),
      ).rejects.toMatchObject({
        code: expect.any(Number),
      });
    });

    it('should throw when title is missing', async () => {
      await expect(
        handler.create(
          { workspaceId: 'ws-1', repoUrl: 'https://github.com/org/repo' },
          'user-1',
        ),
      ).rejects.toMatchObject({
        code: expect.any(Number),
      });
    });
  });

  describe('get', () => {
    it('should get an issue by number', async () => {
      const mockIssue = { number: 10, title: 'Feature request', state: 'open' };
      mockGitWorkspaceService.getIssue.mockResolvedValue(mockIssue);

      const result = await handler.get(
        {
          workspaceId: 'ws-1',
          repoUrl: 'https://github.com/org/repo',
          issueNumber: 10,
        },
        'user-1',
      );

      expect(result).toEqual(mockIssue);
      expect(mockGitWorkspaceService.getIssue).toHaveBeenCalledWith(
        'ws-1',
        'https://github.com/org/repo',
        10,
      );
    });

    it('should throw when issueNumber is missing', async () => {
      await expect(
        handler.get(
          { workspaceId: 'ws-1', repoUrl: 'https://github.com/org/repo' },
          'user-1',
        ),
      ).rejects.toMatchObject({
        code: expect.any(Number),
      });
    });
  });

  describe('list', () => {
    it('should list issues with filters', async () => {
      const mockIssues = [
        { number: 1, title: 'Issue 1' },
        { number: 2, title: 'Issue 2' },
      ];
      mockGitWorkspaceService.listIssues.mockResolvedValue(mockIssues);

      const result = await handler.list(
        {
          workspaceId: 'ws-1',
          repoUrl: 'https://github.com/org/repo',
          state: 'open',
          labels: ['bug'],
        },
        'user-1',
      );

      expect(result).toEqual({ issues: mockIssues, total: 2 });
      expect(mockGitWorkspaceService.listIssues).toHaveBeenCalledWith(
        'ws-1',
        'https://github.com/org/repo',
        expect.objectContaining({ state: 'open', labels: ['bug'] }),
      );
    });
  });

  describe('update', () => {
    it('should update an issue', async () => {
      const updated = { number: 5, title: 'Updated title', state: 'open' };
      mockGitWorkspaceService.updateIssue.mockResolvedValue(updated);

      const result = await handler.update(
        {
          workspaceId: 'ws-1',
          repoUrl: 'https://github.com/org/repo',
          issueNumber: 5,
          title: 'Updated title',
          labels: ['enhancement'],
        },
        'user-1',
      );

      expect(result).toEqual(updated);
      expect(mockGitWorkspaceService.updateIssue).toHaveBeenCalledWith(
        'ws-1',
        'https://github.com/org/repo',
        5,
        expect.objectContaining({
          title: 'Updated title',
          labels: ['enhancement'],
        }),
      );
    });
  });

  describe('comment', () => {
    it('should add a comment to an issue', async () => {
      const mockComment = { id: 'comment-1', body: 'LGTM' };
      mockGitWorkspaceService.addIssueComment.mockResolvedValue(mockComment);

      const result = await handler.comment(
        {
          workspaceId: 'ws-1',
          repoUrl: 'https://github.com/org/repo',
          issueNumber: 5,
          body: 'LGTM',
        },
        'user-1',
      );

      expect(result).toEqual(mockComment);
      expect(mockGitWorkspaceService.addIssueComment).toHaveBeenCalledWith(
        'ws-1',
        'https://github.com/org/repo',
        5,
        'LGTM',
      );
    });

    it('should throw when body is missing', async () => {
      await expect(
        handler.comment(
          {
            workspaceId: 'ws-1',
            repoUrl: 'https://github.com/org/repo',
            issueNumber: 5,
          },
          'user-1',
        ),
      ).rejects.toMatchObject({
        code: expect.any(Number),
      });
    });
  });

  describe('close', () => {
    it('should close an issue', async () => {
      const closed = { number: 5, state: 'closed' };
      mockGitWorkspaceService.closeIssue.mockResolvedValue(closed);

      const result = await handler.close(
        {
          workspaceId: 'ws-1',
          repoUrl: 'https://github.com/org/repo',
          issueNumber: 5,
        },
        'user-1',
      );

      expect(result).toEqual(closed);
      expect(mockGitWorkspaceService.closeIssue).toHaveBeenCalledWith(
        'ws-1',
        'https://github.com/org/repo',
        5,
      );
    });
  });
});
