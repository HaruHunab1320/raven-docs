import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';
import { CodingSwarmProcessor } from './coding-swarm.processor';
import { CodingSwarmService } from './coding-swarm.service';
import { QueueJob } from '../../integrations/queue/constants';

describe('CodingSwarmProcessor', () => {
  let processor: CodingSwarmProcessor;

  const mockCodingSwarmService = {
    processExecution: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CodingSwarmProcessor,
        { provide: CodingSwarmService, useValue: mockCodingSwarmService },
      ],
    }).compile();

    processor = module.get<CodingSwarmProcessor>(CodingSwarmProcessor);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('process', () => {
    it('should process coding swarm jobs', async () => {
      const job = {
        name: QueueJob.CODING_SWARM,
        data: { executionId: 'exec-001' },
      } as Job;

      mockCodingSwarmService.processExecution.mockResolvedValue(undefined);

      await processor.process(job);

      expect(mockCodingSwarmService.processExecution).toHaveBeenCalledWith(
        'exec-001',
      );
    });

    it('should ignore non-swarm jobs', async () => {
      const job = {
        name: 'some-other-job',
        data: { someId: 'abc' },
      } as Job;

      await processor.process(job);

      expect(mockCodingSwarmService.processExecution).not.toHaveBeenCalled();
    });

    it('should propagate errors from processExecution', async () => {
      const job = {
        name: QueueJob.CODING_SWARM,
        data: { executionId: 'exec-fail' },
      } as Job;

      mockCodingSwarmService.processExecution.mockRejectedValue(
        new Error('Provisioning failed'),
      );

      await expect(processor.process(job)).rejects.toThrow(
        'Provisioning failed',
      );
    });
  });
});
