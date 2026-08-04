import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TeamDeploymentService } from './team-deployment.service';
import { TeamDeploymentRepo } from '../../database/repos/team/team-deployment.repo';
import { TeamTemplateRepo } from '../../database/repos/team/team-template.repo';
import { UserRepo } from '@raven-docs/db/repos/user/user.repo';
import { WorkspaceRepo } from '@raven-docs/db/repos/workspace/workspace.repo';
import { WorkspaceService } from '../workspace/services/workspace.service';
import { SpaceMemberService } from '../space/services/space-member.service';
import { TerminalSessionService } from '../terminal/terminal-session.service';
import { AgentExecutionService } from '../coding-swarm/agent-execution.service';
import { TeamMessagingService } from './team-messaging.service';
import { ParallaxClientService } from '../parallax-runtime/parallax-client.service';

/**
 * Regression cover for the spawn-on-trigger fallback (`triggerThreadedTeamRun`),
 * used when a deployment has no pre-spawned threads.
 *
 * Parallax consumes the spawn objective as a *priming* turn, so the task must
 * never ride in on the objective — it goes out via sendToThread afterwards.
 * The fallback also has to persist runtimeSessionId, or every later trigger
 * spawns a duplicate set of threads and leaks the old ones.
 */
describe('TeamDeploymentService — threaded trigger fallback', () => {
  const TASK_MESSAGE = 'TASK: investigate the flaky retry logic';

  let service: TeamDeploymentService;

  const coordinator = {
    id: 'agent-coordinator',
    role: 'lead',
    reportsToAgentId: null,
    systemPrompt: 'You are the lead. Coordinate the team.',
    agentType: 'claude',
    instanceNumber: 1,
  };
  const worker = {
    id: 'agent-worker',
    role: 'researcher',
    reportsToAgentId: 'agent-coordinator',
    systemPrompt: 'You are a researcher.',
    agentType: 'claude',
    instanceNumber: 1,
  };
  const agents = [coordinator, worker];
  const deployment = { id: 'deployment-1', config: '{}' };

  const mockTeamRepo = {
    updateAgentRuntimeSession: jest.fn(),
    updateConfig: jest.fn(),
    getWorkflowState: jest.fn(),
    updateWorkflowState: jest.fn(),
  };

  const mockParallaxClient = {
    spawnThread: jest.fn(),
    sendToThread: jest.fn(),
  };

  const mockTeamMessaging = {
    buildInitialTaskMessage: jest.fn(),
  };

  const noop = {};

  beforeEach(async () => {
    jest.clearAllMocks();

    mockTeamRepo.getWorkflowState.mockResolvedValue({ workflowState: {} });
    mockTeamRepo.updateAgentRuntimeSession.mockResolvedValue(undefined);
    mockTeamRepo.updateConfig.mockResolvedValue(undefined);
    mockTeamRepo.updateWorkflowState.mockResolvedValue(undefined);
    mockTeamMessaging.buildInitialTaskMessage.mockReturnValue(TASK_MESSAGE);
    mockParallaxClient.spawnThread.mockImplementation((opts: any) =>
      Promise.resolve({ id: `thread-for-${opts.role}` }),
    );
    mockParallaxClient.sendToThread.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeamDeploymentService,
        { provide: TeamDeploymentRepo, useValue: mockTeamRepo },
        { provide: TeamTemplateRepo, useValue: noop },
        { provide: UserRepo, useValue: noop },
        { provide: WorkspaceRepo, useValue: noop },
        { provide: WorkspaceService, useValue: noop },
        { provide: SpaceMemberService, useValue: noop },
        { provide: TerminalSessionService, useValue: noop },
        { provide: AgentExecutionService, useValue: noop },
        { provide: TeamMessagingService, useValue: mockTeamMessaging },
        { provide: ParallaxClientService, useValue: mockParallaxClient },
        { provide: 'KyselyModuleConnectionToken', useValue: noop },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get<TeamDeploymentService>(TeamDeploymentService);
  });

  const trigger = () =>
    (service as any).triggerThreadedTeamRun(
      'workspace-1',
      deployment,
      agents,
      coordinator,
    );

  it('primes every thread without leaking the task into the objective', async () => {
    await trigger();

    expect(mockParallaxClient.spawnThread).toHaveBeenCalledTimes(2);
    for (const [opts] of mockParallaxClient.spawnThread.mock.calls) {
      expect(opts.objective).not.toContain(TASK_MESSAGE);
    }

    const byRole = Object.fromEntries(
      mockParallaxClient.spawnThread.mock.calls.map(([o]: any[]) => [
        o.role,
        o.objective,
      ]),
    );
    expect(byRole.lead).toBe(coordinator.systemPrompt);
    expect(byRole.researcher).toBe(worker.systemPrompt);
  });

  it('delivers the task to the coordinator thread via sendToThread', async () => {
    await trigger();

    expect(mockParallaxClient.sendToThread).toHaveBeenCalledTimes(1);
    expect(mockParallaxClient.sendToThread).toHaveBeenCalledWith(
      'thread-for-lead',
      TASK_MESSAGE,
    );
  });

  it('persists runtimeSessionId so the next trigger reuses the threads', async () => {
    await trigger();

    expect(mockTeamRepo.updateAgentRuntimeSession).toHaveBeenCalledWith(
      coordinator.id,
      { runtimeSessionId: 'thread-for-lead', terminalSessionId: null },
    );
    expect(mockTeamRepo.updateAgentRuntimeSession).toHaveBeenCalledWith(
      worker.id,
      { runtimeSessionId: 'thread-for-researcher', terminalSessionId: null },
    );
  });

  it('falls back to a wait-for-instructions objective when no systemPrompt is set', async () => {
    const bare = { ...worker, systemPrompt: null };
    await (service as any).triggerThreadedTeamRun(
      'workspace-1',
      deployment,
      [coordinator, bare],
      coordinator,
    );

    const call = mockParallaxClient.spawnThread.mock.calls.find(
      ([o]: any[]) => o.role === 'researcher',
    );
    expect(call?.[0].objective).toContain('wait for instructions');
    expect(call?.[0].objective).not.toContain(TASK_MESSAGE);
  });
});
