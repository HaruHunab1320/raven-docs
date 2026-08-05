import { Test, TestingModule } from '@nestjs/testing';
import { PageController } from './page.controller';
import { PageService } from './services/page.service';
import { autoMocker } from '../../common/testing/auto-mock';

describe('PageController', () => {
  let controller: PageController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PageController],
      providers: [PageService],
    })
      .useMocker(autoMocker)
      .compile();

    controller = module.get<PageController>(PageController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
