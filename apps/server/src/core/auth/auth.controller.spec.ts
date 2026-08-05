import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './services/auth.service';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { autoMocker } from '../../common/testing/auto-mock';

describe('AuthController', () => {
  let controller: AuthController;

  const mockAuthService = {
    login: jest.fn(),
    changePassword: jest.fn(),
    forgotPassword: jest.fn(),
    passwordReset: jest.fn(),
    verifyUserToken: jest.fn(),
    getCollabToken: jest.fn(),
  };
  const mockEnvironmentService = { isHttps: jest.fn() };

  const res: any = { setCookie: jest.fn(), clearCookie: jest.fn() };
  const workspace: any = { id: 'workspace-1', hostname: 'acme' };
  const user: any = { id: 'user-1' };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockAuthService.login.mockResolvedValue('auth-token');
    mockAuthService.passwordReset.mockResolvedValue('auth-token');
    mockEnvironmentService.isHttps.mockReturnValue(true);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: EnvironmentService, useValue: mockEnvironmentService },
      ],
    })
      .useMocker(autoMocker)
      .compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('login', () => {
    it('authenticates against the request’s workspace', async () => {
      const dto: any = { email: 'ada@example.com', password: 'pw' };

      await controller.login(workspace, res, dto);

      expect(mockAuthService.login).toHaveBeenCalledWith(dto, workspace.id);
    });

    it('returns the token only as an httpOnly cookie', async () => {
      // httpOnly is what stops page scripts from reading the session token,
      // and the body must not carry it either.
      const result = await controller.login(workspace, res, {} as any);

      const [name, token, options] = res.setCookie.mock.calls[0];
      expect(name).toBe('authToken');
      expect(token).toBe('auth-token');
      expect(options.httpOnly).toBe(true);
      expect(options.path).toBe('/');
      expect(result).toBeUndefined();
    });

    it('marks the cookie secure when the app is served over https', async () => {
      await controller.login(workspace, res, {} as any);

      expect(res.setCookie.mock.calls[0][2].secure).toBe(true);
    });

    it('leaves the cookie insecure over plain http, so local dev still works', async () => {
      mockEnvironmentService.isHttps.mockReturnValue(false);

      await controller.login(workspace, res, {} as any);

      expect(res.setCookie.mock.calls[0][2].secure).toBe(false);
    });

    it('expires the session about 30 days out', async () => {
      const before = Date.now();

      await controller.login(workspace, res, {} as any);

      const { expires } = res.setCookie.mock.calls[0][2];
      const days = (expires.getTime() - before) / (24 * 60 * 60 * 1000);
      expect(days).toBeGreaterThan(29.9);
      expect(days).toBeLessThanOrEqual(30);
    });

    it('does not set a cookie when authentication fails', async () => {
      mockAuthService.login.mockRejectedValue(new Error('bad credentials'));

      await expect(
        controller.login(workspace, res, {} as any),
      ).rejects.toThrow();
      expect(res.setCookie).not.toHaveBeenCalled();
    });
  });

  describe('passwordReset', () => {
    it('signs the user in through the same cookie path', async () => {
      await controller.passwordReset(res, { token: 't' } as any, workspace);

      expect(mockAuthService.passwordReset).toHaveBeenCalledWith(
        { token: 't' },
        workspace.id,
      );
      expect(res.setCookie.mock.calls[0][2].httpOnly).toBe(true);
    });
  });

  describe('logout', () => {
    it('clears the session cookie', async () => {
      await controller.logout(res);

      expect(res.clearCookie).toHaveBeenCalledWith('authToken');
    });
  });

  describe('delegation', () => {
    it('scopes changePassword to the caller and their workspace', async () => {
      const dto: any = { oldPassword: 'a', newPassword: 'b' };

      await controller.changePassword(dto, user, workspace);

      expect(mockAuthService.changePassword).toHaveBeenCalledWith(
        dto,
        user.id,
        workspace.id,
      );
    });

    it('passes the whole workspace to forgotPassword, which needs its hostname', async () => {
      const dto: any = { email: 'ada@example.com' };

      await controller.forgotPassword(dto, workspace);

      expect(mockAuthService.forgotPassword).toHaveBeenCalledWith(
        dto,
        workspace,
      );
    });

    it('scopes token verification to the workspace', async () => {
      const dto: any = { token: 't' };

      await controller.verifyResetToken(dto, workspace);

      expect(mockAuthService.verifyUserToken).toHaveBeenCalledWith(
        dto,
        workspace.id,
      );
    });

    it('scopes the collab token to the caller and their workspace', async () => {
      await controller.collabToken(user, workspace);

      expect(mockAuthService.getCollabToken).toHaveBeenCalledWith(
        user.id,
        workspace.id,
      );
    });
  });
});
