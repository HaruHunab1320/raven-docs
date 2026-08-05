import { Test, TestingModule } from '@nestjs/testing';
import { SearchService } from './search.service';
import { autoMocker } from '../../common/testing/auto-mock';

describe('SearchService', () => {
  let service: SearchService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SearchService],
    })
      .useMocker(autoMocker)
      .compile();

    service = module.get<SearchService>(SearchService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
