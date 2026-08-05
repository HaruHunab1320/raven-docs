import { Test, TestingModule } from '@nestjs/testing';
import { CommentService } from './comment.service';
import { autoMocker } from '../../common/testing/auto-mock';

describe('CommentService', () => {
  let service: CommentService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CommentService],
    })
      .useMocker(autoMocker)
      .compile();

    service = module.get<CommentService>(CommentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
