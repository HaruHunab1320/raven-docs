import { Test, TestingModule } from '@nestjs/testing';
import { WorkspaceService } from './workspace.service';
import { autoMocker } from '../../../common/testing/auto-mock';

describe('WorkspaceService', () => {
  let service: WorkspaceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WorkspaceService],
    })
      .useMocker(autoMocker)
      .compile();

    service = module.get<WorkspaceService>(WorkspaceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
