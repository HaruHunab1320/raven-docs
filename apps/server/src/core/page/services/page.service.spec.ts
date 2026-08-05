import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PageService } from './page.service';
import { PageRepo } from '../../../database/repos/page/page.repo';
import { AttachmentRepo } from '../../../database/repos/attachment/attachment.repo';
import { AgentMemoryService } from '../../agent-memory/agent-memory.service';
import { TaskService } from '../../project/services/task.service';
import { ResearchGraphService } from '../../research-graph/research-graph.service';
import { autoMocker } from '../../../common/testing/auto-mock';

// Run transaction callbacks inline against a stub trx.
jest.mock('@raven-docs/db/utils', () => ({
  ...jest.requireActual('@raven-docs/db/utils'),
  executeTx: jest.fn(async (_db: any, cb: any) => cb({} as any)),
}));

describe('PageService', () => {
  let service: PageService;

  const mockPageRepo = {
    findById: jest.fn(),
    insertPage: jest.fn(),
    updatePage: jest.fn(),
    updatePages: jest.fn(),
    deletePage: jest.fn(),
    softDeletePage: jest.fn(),
    getPageAndDescendants: jest.fn(),
  };
  const mockAttachmentRepo = {
    updateAttachmentsByPageId: jest.fn(),
  };
  const mockAgentMemoryService = { ingestMemory: jest.fn() };
  const mockTaskService = { syncTasksFromPageContent: jest.fn() };
  const mockResearchGraph = { syncPageNode: jest.fn() };

  const workspaceId = 'workspace-1';
  const spaceId = 'space-1';
  const userId = 'user-1';
  const page: any = {
    id: 'page-1',
    title: 'Roadmap',
    spaceId,
    workspaceId,
    contributorIds: ['user-9'],
  };

  // nextPagePosition() walks a Kysely chain; a self-returning stub is enough.
  const dbStub: any = new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === 'then') return undefined;
        if (prop === 'execute') return async () => [];
        if (prop === 'executeTakeFirst') return async () => undefined;
        return () => dbStub;
      },
    },
  );

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPageRepo.insertPage.mockResolvedValue({ ...page });
    mockPageRepo.findById.mockResolvedValue({ ...page });
    mockPageRepo.getPageAndDescendants.mockResolvedValue([{ id: 'page-1' }]);
    mockAgentMemoryService.ingestMemory.mockResolvedValue(undefined);
    mockResearchGraph.syncPageNode.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PageService,
        { provide: PageRepo, useValue: mockPageRepo },
        { provide: AttachmentRepo, useValue: mockAttachmentRepo },
        { provide: AgentMemoryService, useValue: mockAgentMemoryService },
        { provide: TaskService, useValue: mockTaskService },
        { provide: ResearchGraphService, useValue: mockResearchGraph },
        { provide: 'KyselyModuleConnectionToken', useValue: dbStub },
      ],
    })
      .useMocker(autoMocker)
      .compile();

    service = module.get<PageService>(PageService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('creates a page owned by the caller in the target space', async () => {
      await service.create(userId, workspaceId, {
        spaceId,
        title: 'New',
      } as any);

      expect(mockPageRepo.insertPage).toHaveBeenCalledWith(
        expect.objectContaining({
          spaceId,
          workspaceId,
          creatorId: userId,
          lastUpdatedById: userId,
          title: 'New',
        }),
        undefined,
      );
    });

    it('rejects a parent page from a different space', async () => {
      // Nesting under a parent in another space would pull the child out of
      // the space whose permissions are supposed to govern it.
      mockPageRepo.findById.mockResolvedValue({
        ...page,
        spaceId: 'some-other-space',
      });

      await expect(
        service.create(userId, workspaceId, {
          spaceId,
          parentPageId: 'page-9',
        } as any),
      ).rejects.toThrow(NotFoundException);
      expect(mockPageRepo.insertPage).not.toHaveBeenCalled();
    });

    it('rejects a parent page that does not exist', async () => {
      mockPageRepo.findById.mockResolvedValue(null);

      await expect(
        service.create(userId, workspaceId, {
          spaceId,
          parentPageId: 'page-9',
        } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('serialises metadata, and leaves it null when absent', async () => {
      await service.create(userId, workspaceId, {
        spaceId,
        metadata: { domainTags: ['bio'] },
      } as any);
      expect(mockPageRepo.insertPage.mock.calls[0][0].metadata).toBe(
        JSON.stringify({ domainTags: ['bio'] }),
      );

      mockPageRepo.insertPage.mockClear();
      await service.create(userId, workspaceId, { spaceId } as any);
      expect(mockPageRepo.insertPage.mock.calls[0][0].metadata).toBeNull();
    });

    it('syncs a typed page to the research graph', async () => {
      await service.create(userId, workspaceId, {
        spaceId,
        pageType: 'hypothesis',
        metadata: { domainTags: ['bio'] },
      } as any);

      expect(mockResearchGraph.syncPageNode).toHaveBeenCalledWith(
        expect.objectContaining({
          id: page.id,
          pageType: 'hypothesis',
          domainTags: ['bio'],
        }),
      );
    });

    it('does not touch the research graph for an untyped page', async () => {
      await service.create(userId, workspaceId, { spaceId } as any);

      expect(mockResearchGraph.syncPageNode).not.toHaveBeenCalled();
    });

    it('still returns the page when memory ingestion fails', async () => {
      mockAgentMemoryService.ingestMemory.mockRejectedValue(new Error('down'));

      await expect(
        service.create(userId, workspaceId, { spaceId } as any),
      ).resolves.toMatchObject({ id: page.id });
    });

    it('still returns the page when the research graph sync fails', async () => {
      mockResearchGraph.syncPageNode.mockRejectedValue(new Error('graph down'));

      await expect(
        service.create(userId, workspaceId, {
          spaceId,
          pageType: 'hypothesis',
        } as any),
      ).resolves.toMatchObject({ id: page.id });
    });

    it('syncs tasks only when the page has content', async () => {
      await service.create(userId, workspaceId, { spaceId } as any);
      expect(mockTaskService.syncTasksFromPageContent).not.toHaveBeenCalled();

      await service.create(userId, workspaceId, {
        spaceId,
        content: '{"doc":1}',
      } as any);
      expect(mockTaskService.syncTasksFromPageContent).toHaveBeenCalledWith(
        expect.objectContaining({ pageId: page.id, userId }),
      );
    });
  });

  describe('update', () => {
    it('adds the editor to the contributors without dropping existing ones', async () => {
      await service.update(page, { title: 'Renamed' } as any, userId);

      const [payload] = mockPageRepo.updatePage.mock.calls[0];
      expect(payload.contributorIds).toEqual(
        expect.arrayContaining(['user-9', userId]),
      );
      expect(payload.lastUpdatedById).toBe(userId);
    });

    it('does not duplicate a contributor who edits twice', async () => {
      await service.update(
        { ...page, contributorIds: [userId] },
        { title: 'Renamed' } as any,
        userId,
      );

      const [payload] = mockPageRepo.updatePage.mock.calls[0];
      expect(payload.contributorIds).toEqual([userId]);
    });

    it('leaves content untouched when the update omits it', async () => {
      await service.update(page, { title: 'Renamed' } as any, userId);

      const [payload] = mockPageRepo.updatePage.mock.calls[0];
      expect('content' in payload).toBe(false);
      expect(mockTaskService.syncTasksFromPageContent).not.toHaveBeenCalled();
    });

    it('writes content and resyncs tasks when content is supplied', async () => {
      await service.update(page, { content: '{"doc":1}' } as any, userId);

      const [payload] = mockPageRepo.updatePage.mock.calls[0];
      expect(payload.content).toBe('{"doc":1}');
      expect(mockTaskService.syncTasksFromPageContent).toHaveBeenCalled();
    });

    it('still resolves when memory ingestion fails', async () => {
      mockAgentMemoryService.ingestMemory.mockRejectedValue(new Error('down'));

      await expect(
        service.update(page, { title: 'Renamed' } as any, userId),
      ).resolves.toBeDefined();
    });
  });

  describe('deletion guards', () => {
    it('refuses to delete a user profile page', async () => {
      // These back a user's identity in the workspace; deleting one orphans
      // the account's presence rather than just removing a document.
      mockPageRepo.findById.mockResolvedValue({
        ...page,
        title: 'User Profile — Ada',
      });

      await expect(service.softDelete(page.id, userId)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.forceDelete(page.id)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockPageRepo.softDeletePage).not.toHaveBeenCalled();
      expect(mockPageRepo.deletePage).not.toHaveBeenCalled();
    });

    it('matches the protected title case-insensitively', async () => {
      mockPageRepo.findById.mockResolvedValue({
        ...page,
        title: 'user profile page',
      });

      await expect(service.softDelete(page.id, userId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('allows deleting an ordinary page', async () => {
      await service.softDelete(page.id, userId);

      expect(mockPageRepo.softDeletePage).toHaveBeenCalledWith(page.id, userId);
    });

    it('refuses to soft-delete a protected tree', async () => {
      mockPageRepo.findById.mockResolvedValue({
        ...page,
        title: 'User Profile — Ada',
      });

      await expect(service.softDeleteTree(page.id, userId)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockPageRepo.updatePages).not.toHaveBeenCalled();
    });
  });

  describe('softDeleteTree', () => {
    it('marks the whole subtree deleted in one go', async () => {
      mockPageRepo.getPageAndDescendants.mockResolvedValue([
        { id: 'page-1' },
        { id: 'page-2' },
        { id: 'page-3' },
      ]);

      await service.softDeleteTree(page.id, userId);

      const [patch, ids] = mockPageRepo.updatePages.mock.calls[0];
      expect(ids).toEqual(['page-1', 'page-2', 'page-3']);
      expect(patch.deletedAt).toBeInstanceOf(Date);
      expect(patch.deletedById).toBe(userId);
    });

    it('does nothing when the subtree is empty', async () => {
      mockPageRepo.getPageAndDescendants.mockResolvedValue([]);

      await service.softDeleteTree(page.id, userId);

      expect(mockPageRepo.updatePages).not.toHaveBeenCalled();
    });
  });

  describe('forceDeleteTree', () => {
    it('deletes children before their parent', async () => {
      // Reverse order matters — removing a parent first would strand its
      // descendants behind a foreign key.
      mockPageRepo.getPageAndDescendants.mockResolvedValue([
        { id: 'page-1' },
        { id: 'page-2' },
        { id: 'page-3' },
      ]);

      await service.forceDeleteTree(page.id);

      const deleted = mockPageRepo.deletePage.mock.calls.map((c) => c[0]);
      expect(deleted).toEqual(['page-3', 'page-2', 'page-1']);
    });
  });

  describe('movePageToSpace', () => {
    it('re-parents the root, moves descendants, and follows attachments', async () => {
      mockPageRepo.getPageAndDescendants.mockResolvedValue([
        { id: 'page-1' },
        { id: 'page-2' },
      ]);

      await service.movePageToSpace(page, 'space-2');

      // Root becomes a top-level page in the destination space.
      expect(mockPageRepo.updatePage).toHaveBeenCalledWith(
        expect.objectContaining({ spaceId: 'space-2', parentPageId: null }),
        page.id,
        expect.anything(),
      );
      // Descendants follow, but the root is not moved twice.
      expect(mockPageRepo.updatePages).toHaveBeenCalledWith(
        { spaceId: 'space-2' },
        ['page-2'],
        expect.anything(),
      );
      // Attachments must move too, or they stay reachable via the old space.
      expect(mockAttachmentRepo.updateAttachmentsByPageId).toHaveBeenCalledWith(
        { spaceId: 'space-2' },
        ['page-1', 'page-2'],
        expect.anything(),
      );
    });

    it('skips the descendant update for a lone page', async () => {
      mockPageRepo.getPageAndDescendants.mockResolvedValue([{ id: 'page-1' }]);

      await service.movePageToSpace(page, 'space-2');

      expect(mockPageRepo.updatePages).not.toHaveBeenCalled();
    });
  });

  describe('updateContent', () => {
    it('records who last touched the page', async () => {
      await service.updateContent(page.id, '{"doc":1}', userId);

      expect(mockPageRepo.updatePage).toHaveBeenCalledWith(
        { content: '{"doc":1}', lastUpdatedById: userId },
        page.id,
      );
    });
  });
});
