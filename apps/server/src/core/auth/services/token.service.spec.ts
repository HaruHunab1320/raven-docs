import { Test, TestingModule } from '@nestjs/testing';
import { TokenService } from './token.service';
import { autoMocker } from '../../../common/testing/auto-mock';

describe('TokenService', () => {
  let service: TokenService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TokenService],
    })
      .useMocker(autoMocker)
      .compile();

    service = module.get<TokenService>(TokenService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
