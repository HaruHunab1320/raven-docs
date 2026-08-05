import { Test, TestingModule } from '@nestjs/testing';
import { PageService } from './page.service';
import { autoMocker } from '../../../common/testing/auto-mock';

describe('PageService', () => {
  let service: PageService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PageService],
    })
      .useMocker(autoMocker)
      .compile();

    service = module.get<PageService>(PageService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
