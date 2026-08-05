import { Test, TestingModule } from '@nestjs/testing';
import { GroupService } from './group.service';
import { autoMocker } from '../../../common/testing/auto-mock';

describe('GroupService', () => {
  let service: GroupService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GroupService],
    })
      .useMocker(autoMocker)
      .compile();

    service = module.get<GroupService>(GroupService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
