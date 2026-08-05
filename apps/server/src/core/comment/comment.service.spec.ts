import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { CommentService } from './comment.service';
import { CommentRepo } from '../../database/repos/comment/comment.repo';
import { PageRepo } from '../../database/repos/page/page.repo';
import { AgentMemoryService } from '../agent-memory/agent-memory.service';
import { autoMocker } from '../../common/testing/auto-mock';

describe('CommentService', () => {
  let service: CommentService;

  const mockCommentRepo = {
    findById: jest.fn(),
    insertComment: jest.fn(),
    updateComment: jest.fn(),
    deleteComment: jest.fn(),
    findPageComments: jest.fn(),
  };
  const mockPageRepo = {
    findById: jest.fn(),
  };
  const mockAgentMemoryService = {
    ingestMemory: jest.fn(),
  };

  const workspaceId = 'workspace-1';
  const author: any = { id: 'user-1', workspaceId };
  const otherUser: any = { id: 'user-2', workspaceId };
  const page: any = { id: 'page-1', spaceId: 'space-1' };
  const comment: any = {
    id: 'comment-1',
    pageId: page.id,
    creatorId: author.id,
    parentCommentId: null,
    workspaceId,
    content: {},
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPageRepo.findById.mockResolvedValue(page);
    mockCommentRepo.insertComment.mockResolvedValue({ ...comment });
    mockAgentMemoryService.ingestMemory.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentService,
        { provide: CommentRepo, useValue: mockCommentRepo },
        { provide: PageRepo, useValue: mockPageRepo },
        { provide: AgentMemoryService, useValue: mockAgentMemoryService },
      ],
    })
      .useMocker(autoMocker)
      .compile();

    service = module.get<CommentService>(CommentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findById', () => {
    it('404s for a missing comment', async () => {
      mockCommentRepo.findById.mockResolvedValue(null);

      await expect(service.findById('nope')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('stores the parsed content against the page and author', async () => {
      await service.create(author.id, page.id, workspaceId, {
        content: JSON.stringify({ text: 'hello' }),
      } as any);

      expect(mockCommentRepo.insertComment).toHaveBeenCalledWith(
        expect.objectContaining({
          pageId: page.id,
          creatorId: author.id,
          workspaceId,
          content: { text: 'hello' },
        }),
      );
    });

    it('truncates an overlong selection to 250 characters', async () => {
      await service.create(author.id, page.id, workspaceId, {
        content: JSON.stringify({}),
        selection: 'x'.repeat(400),
      } as any);

      const [inserted] = mockCommentRepo.insertComment.mock.calls[0];
      expect(inserted.selection).toHaveLength(250);
    });

    it('rejects a parent comment that belongs to a different page', async () => {
      // Otherwise a reply could be smuggled onto a page the parent is not on.
      mockCommentRepo.findById.mockResolvedValue({
        ...comment,
        pageId: 'some-other-page',
      });

      await expect(
        service.create(author.id, page.id, workspaceId, {
          content: JSON.stringify({}),
          parentCommentId: 'comment-9',
        } as any),
      ).rejects.toThrow(BadRequestException);
      expect(mockCommentRepo.insertComment).not.toHaveBeenCalled();
    });

    it('rejects a missing parent comment', async () => {
      mockCommentRepo.findById.mockResolvedValue(null);

      await expect(
        service.create(author.id, page.id, workspaceId, {
          content: JSON.stringify({}),
          parentCommentId: 'comment-9',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses to reply to a reply, keeping threads one level deep', async () => {
      mockCommentRepo.findById.mockResolvedValue({
        ...comment,
        parentCommentId: 'comment-0',
      });

      await expect(
        service.create(author.id, page.id, workspaceId, {
          content: JSON.stringify({}),
          parentCommentId: 'comment-1',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('still returns the comment when memory ingestion fails', async () => {
      // Ingestion is best-effort telemetry; a failure there must never cost
      // the user their comment.
      mockAgentMemoryService.ingestMemory.mockRejectedValue(
        new Error('memory down'),
      );

      const result = await service.create(author.id, page.id, workspaceId, {
        content: JSON.stringify({}),
      } as any);

      expect(result).toMatchObject({ id: 'comment-1' });
    });
  });

  describe('update', () => {
    it('lets an author edit their own comment and stamps editedAt', async () => {
      mockCommentRepo.findById.mockResolvedValue({ ...comment });

      const result = await service.update(
        comment.id,
        { content: JSON.stringify({ text: 'edited' }) } as any,
        author,
      );

      expect(mockCommentRepo.updateComment).toHaveBeenCalledWith(
        expect.objectContaining({ content: { text: 'edited' } }),
        comment.id,
      );
      expect(result.editedAt).toBeInstanceOf(Date);
    });

    it('refuses to let someone edit another user’s comment', async () => {
      mockCommentRepo.findById.mockResolvedValue({ ...comment });

      await expect(
        service.update(
          comment.id,
          { content: JSON.stringify({}) } as any,
          otherUser,
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(mockCommentRepo.updateComment).not.toHaveBeenCalled();
    });

    it('404s for a missing comment', async () => {
      mockCommentRepo.findById.mockResolvedValue(null);

      await expect(
        service.update(comment.id, { content: '{}' } as any, author),
      ).rejects.toThrow(NotFoundException);
    });

    it('still succeeds when memory ingestion fails', async () => {
      mockCommentRepo.findById.mockResolvedValue({ ...comment });
      mockAgentMemoryService.ingestMemory.mockRejectedValue(
        new Error('memory down'),
      );

      await expect(
        service.update(comment.id, { content: '{}' } as any, author),
      ).resolves.toBeDefined();
    });
  });

  describe('remove', () => {
    it('lets an author delete their own comment', async () => {
      mockCommentRepo.findById.mockResolvedValue({ ...comment });

      await service.remove(comment.id, author);

      expect(mockCommentRepo.deleteComment).toHaveBeenCalledWith(comment.id);
    });

    it('refuses to let someone delete another user’s comment', async () => {
      mockCommentRepo.findById.mockResolvedValue({ ...comment });

      await expect(service.remove(comment.id, otherUser)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockCommentRepo.deleteComment).not.toHaveBeenCalled();
    });

    it('404s for a missing comment', async () => {
      mockCommentRepo.findById.mockResolvedValue(null);

      await expect(service.remove('nope', author)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('resolve', () => {
    it('stamps resolvedAt when resolving', async () => {
      mockCommentRepo.findById.mockResolvedValue({ ...comment });

      await service.resolve(comment.id, true, author.id);

      const [patch] = mockCommentRepo.updateComment.mock.calls[0];
      expect(patch.resolvedAt).toBeInstanceOf(Date);
    });

    it('clears resolvedAt when reopening', async () => {
      mockCommentRepo.findById.mockResolvedValue({ ...comment });

      await service.resolve(comment.id, false, author.id);

      expect(mockCommentRepo.updateComment).toHaveBeenCalledWith(
        { resolvedAt: null },
        comment.id,
      );
    });

    it('can be resolved by someone other than the author', async () => {
      // Deliberately unlike edit/delete — anyone on the page may close a
      // thread, so this must not inherit the ownership check.
      mockCommentRepo.findById.mockResolvedValue({ ...comment });

      await expect(
        service.resolve(comment.id, true, otherUser.id),
      ).resolves.toBeDefined();
    });

    it('404s for a missing comment', async () => {
      mockCommentRepo.findById.mockResolvedValue(null);

      await expect(service.resolve('nope', true, author.id)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
