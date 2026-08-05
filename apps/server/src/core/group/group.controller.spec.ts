import { Test, TestingModule } from '@nestjs/testing';
import { GroupController } from './group.controller';
import { GroupService } from './services/group.service';
import { autoMocker } from '../../common/testing/auto-mock';

describe('GroupController', () => {
  let controller: GroupController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GroupController],
      providers: [GroupService],
    })
      .useMocker(autoMocker)
      .compile();

    controller = module.get<GroupController>(GroupController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
