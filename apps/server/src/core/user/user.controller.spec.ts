import { Test, TestingModule } from '@nestjs/testing';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { WorkspaceRepo } from '../../database/repos/workspace/workspace.repo';
import { autoMocker } from '../../common/testing/auto-mock';

const MASK = '••••••••';

describe('UserController', () => {
  let controller: UserController;

  const mockUserService = { update: jest.fn() };
  const mockWorkspaceRepo = { getActiveUserCount: jest.fn() };

  const workspace: any = { id: 'workspace-1', name: 'Acme' };

  const userWithSecrets = (): any => ({
    id: 'user-1',
    name: 'Ada',
    settings: {
      preferences: { theme: 'dark' },
      integrations: {
        agentProviders: {
          anthropicApiKey: 'sk-ant-real',
          claudeSubscriptionToken: 'claude-access',
          claudeSubscriptionRefreshToken: 'claude-refresh',
          openaiApiKey: 'sk-openai-real',
          openaiSubscriptionToken: 'openai-access',
          openaiSubscriptionRefreshToken: 'openai-refresh',
          googleApiKey: 'google-real',
          preferredProvider: 'anthropic',
        },
      },
    },
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    mockWorkspaceRepo.getActiveUserCount.mockResolvedValue(7);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [
        { provide: UserService, useValue: mockUserService },
        { provide: WorkspaceRepo, useValue: mockWorkspaceRepo },
      ],
    })
      .useMocker(autoMocker)
      .compile();

    controller = module.get<UserController>(UserController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getUserInfo', () => {
    it('masks every provider credential before returning the user', async () => {
      // These are the user's real API keys and OAuth tokens. Returning them
      // to the browser would hand anyone with XSS a working provider key.
      const { user } = await controller.getUserInfo(userWithSecrets(), workspace);

      const providers = (user as any).settings.integrations.agentProviders;
      for (const field of [
        'anthropicApiKey',
        'claudeSubscriptionToken',
        'claudeSubscriptionRefreshToken',
        'openaiApiKey',
        'openaiSubscriptionToken',
        'openaiSubscriptionRefreshToken',
        'googleApiKey',
      ]) {
        expect(providers[field]).toBe(MASK);
      }
    });

    it('leaves non-secret settings intact', async () => {
      const { user } = await controller.getUserInfo(userWithSecrets(), workspace);

      const settings = (user as any).settings;
      expect(settings.preferences).toEqual({ theme: 'dark' });
      expect(settings.integrations.agentProviders.preferredProvider).toBe(
        'anthropic',
      );
    });

    it('does not mutate the caller’s user object', async () => {
      // The authUser instance is shared for the rest of the request; masking
      // it in place would blank out credentials the server still needs.
      const authUser = userWithSecrets();

      await controller.getUserInfo(authUser, workspace);

      expect(authUser.settings.integrations.agentProviders.anthropicApiKey).toBe(
        'sk-ant-real',
      );
    });

    it('does not invent credential fields that were never set', async () => {
      const bare: any = { id: 'user-1', settings: {} };

      const { user } = await controller.getUserInfo(bare, workspace);

      expect(
        (user as any).settings.integrations.agentProviders,
      ).toEqual({});
    });

    it('copes with a user that has no settings at all', async () => {
      const bare: any = { id: 'user-1' };

      await expect(
        controller.getUserInfo(bare, workspace),
      ).resolves.toBeDefined();
    });

    it('returns the workspace with its active member count', async () => {
      const result = await controller.getUserInfo(userWithSecrets(), workspace);

      expect(result.workspace).toMatchObject({
        id: workspace.id,
        memberCount: 7,
      });
      expect(mockWorkspaceRepo.getActiveUserCount).toHaveBeenCalledWith(
        workspace.id,
      );
    });
  });

  describe('updateUser', () => {
    it('updates the caller within their own workspace', async () => {
      const dto: any = { name: 'Ada L' };

      await controller.updateUser(dto, { id: 'user-1' } as any, workspace);

      expect(mockUserService.update).toHaveBeenCalledWith(
        dto,
        'user-1',
        workspace.id,
      );
    });
  });
});
