import { Test, TestingModule } from '@nestjs/testing';
import { EnvironmentService } from './environment.service';
import { autoMocker } from '../../common/testing/auto-mock';

describe('EnvironmentService', () => {
  let service: EnvironmentService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EnvironmentService],
    })
      .useMocker(autoMocker)
      .compile();

    service = module.get<EnvironmentService>(EnvironmentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
