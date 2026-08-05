import { Test, TestingModule } from '@nestjs/testing';
import { StorageService } from './storage.service';
import { autoMocker } from '../../common/testing/auto-mock';

describe('StorageService', () => {
  let service: StorageService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StorageService],
    })
      .useMocker(autoMocker)
      .compile();

    service = module.get<StorageService>(StorageService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
