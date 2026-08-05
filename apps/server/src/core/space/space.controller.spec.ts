import { Test, TestingModule } from '@nestjs/testing';
import { SpaceController } from './space.controller';
import { SpaceService } from './services/space.service';
import { autoMocker } from '../../common/testing/auto-mock';

describe('SpaceController', () => {
  let controller: SpaceController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SpaceController],
      providers: [SpaceService],
    })
      .useMocker(autoMocker)
      .compile();

    controller = module.get<SpaceController>(SpaceController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
