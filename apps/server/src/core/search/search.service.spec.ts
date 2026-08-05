import { Test, TestingModule } from '@nestjs/testing';
import { SearchService } from './search.service';
import { PageRepo } from '../../database/repos/page/page.repo';
import { SpaceMemberRepo } from '../../database/repos/space/space-member.repo';
import { autoMocker } from '../../common/testing/auto-mock';

/**
 * Chainable stand-in for the Kysely query builder that records every
 * `.where(...)` so a test can assert what the query was actually scoped to.
 */
function createQueryBuilder(rows: any[] = []) {
  const whereCalls: any[][] = [];
  const qb: any = {
    whereCalls,
    selectFrom: () => qb,
    select: () => qb,
    where: (...args: any[]) => {
      whereCalls.push(args);
      return qb;
    },
    $if: (condition: boolean, cb: (b: any) => any) =>
      condition ? cb(qb) : qb,
    orderBy: () => qb,
    limit: () => qb,
    offset: () => qb,
    execute: async () => rows,
  };
  return qb;
}

describe('SearchService', () => {
  let service: SearchService;
  let db: any;

  const mockPageRepo = {
    withSpace: jest.fn().mockReturnValue({}),
  };
  const mockSpaceMemberRepo = {
    getUserSpaceIds: jest.fn(),
  };

  const build = async (rows: any[] = []) => {
    db = createQueryBuilder(rows);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        { provide: PageRepo, useValue: mockPageRepo },
        { provide: SpaceMemberRepo, useValue: mockSpaceMemberRepo },
        { provide: 'KyselyModuleConnectionToken', useValue: db },
      ],
    })
      .useMocker(autoMocker)
      .compile();

    return module.get<SearchService>(SearchService);
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPageRepo.withSpace.mockReturnValue({});
    mockSpaceMemberRepo.getUserSpaceIds.mockResolvedValue(['space-1', 'space-2']);
    service = await build();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('searchPage', () => {
    it('returns nothing for an empty query without hitting the database', async () => {
      const result = await service.searchPage('', { spaceId: 'space-1' } as any);

      expect(result).toEqual([]);
      expect(db.whereCalls).toHaveLength(0);
    });

    it('restricts results to the requested space', async () => {
      await service.searchPage('roadmap', { spaceId: 'space-1' } as any);

      expect(db.whereCalls).toContainEqual(['spaceId', '=', 'space-1']);
    });

    it('filters by creator only when one is supplied', async () => {
      await service.searchPage('roadmap', { spaceId: 'space-1' } as any);
      expect(
        db.whereCalls.some((c: any[]) => c[0] === 'creatorId'),
      ).toBe(false);

      service = await build();
      await service.searchPage('roadmap', {
        spaceId: 'space-1',
        creatorId: 'user-1',
      } as any);
      expect(db.whereCalls).toContainEqual(['creatorId', '=', 'user-1']);
    });
  });

  describe('searchPagesForUser', () => {
    it('returns nothing for an empty query', async () => {
      const result = await service.searchPagesForUser('', 'user-1', {} as any);

      expect(result).toEqual([]);
      expect(mockSpaceMemberRepo.getUserSpaceIds).not.toHaveBeenCalled();
    });

    it('limits the search to spaces the user belongs to', async () => {
      // This is the whole permission boundary for search — without it a user
      // (or an agent-user) would match pages in spaces they cannot open.
      await service.searchPagesForUser('roadmap', 'user-1', {} as any);

      expect(mockSpaceMemberRepo.getUserSpaceIds).toHaveBeenCalledWith('user-1');
      expect(db.whereCalls).toContainEqual([
        'spaceId',
        'in',
        ['space-1', 'space-2'],
      ]);
    });

    it('returns nothing when the user belongs to no spaces', async () => {
      // Must short-circuit: an empty `in` list would otherwise be a query
      // with no space restriction at all.
      mockSpaceMemberRepo.getUserSpaceIds.mockResolvedValue([]);

      const result = await service.searchPagesForUser(
        'roadmap',
        'user-1',
        {} as any,
      );

      expect(result).toEqual([]);
      expect(db.whereCalls).toHaveLength(0);
    });

    it('returns nothing when space membership comes back null', async () => {
      mockSpaceMemberRepo.getUserSpaceIds.mockResolvedValue(null);

      await expect(
        service.searchPagesForUser('roadmap', 'user-1', {} as any),
      ).resolves.toEqual([]);
      expect(db.whereCalls).toHaveLength(0);
    });

    it('collapses newlines and runs of whitespace in the highlight', async () => {
      service = await build([
        { id: 'page-1', highlight: 'first line\n\nsecond    line' },
      ]);

      const [result] = await service.searchPagesForUser(
        'roadmap',
        'user-1',
        {} as any,
      );

      expect(result.highlight).toBe('first line second line');
    });

    it('leaves a result without a highlight untouched', async () => {
      service = await build([{ id: 'page-1', highlight: null }]);

      const [result] = await service.searchPagesForUser(
        'roadmap',
        'user-1',
        {} as any,
      );

      expect(result.highlight).toBeNull();
    });
  });
});
