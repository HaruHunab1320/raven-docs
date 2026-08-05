import { Test, TestingModule } from '@nestjs/testing';
import { SearchController } from './search.controller';
import { autoMocker } from '../../common/testing/auto-mock';

describe('SearchController', () => {
  let controller: SearchController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SearchController],
    })
      .useMocker(autoMocker)
      .compile();

    controller = module.get<SearchController>(SearchController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
