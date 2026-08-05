import { Test, TestingModule } from '@nestjs/testing';
import { SpaceService } from './space.service';
import { autoMocker } from '../../../common/testing/auto-mock';

describe('SpaceService', () => {
  let service: SpaceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SpaceService],
    })
      .useMocker(autoMocker)
      .compile();

    service = module.get<SpaceService>(SpaceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
