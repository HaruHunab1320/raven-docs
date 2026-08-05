import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { UserRepo } from '../../../database/repos/user/user.repo';
import { UserTokenRepo } from '../../../database/repos/user-token/user-token.repo';
import { MailService } from '../../../integrations/mail/mail.service';
import { UserTokenType } from '../auth.constants';
import { autoMocker } from '../../../common/testing/auto-mock';
import * as helpers from '../../../common/helpers';

jest.mock('../../../common/helpers', () => ({
  ...jest.requireActual('../../../common/helpers'),
  comparePasswordHash: jest.fn(),
  hashPassword: jest.fn(),
  nanoIdGen: jest.fn(),
}));

// Run the callback against a stub transaction instead of touching a database.
jest.mock('@raven-docs/db/utils', () => ({
  ...jest.requireActual('@raven-docs/db/utils'),
  executeTx: jest.fn(async (_db: any, cb: any) => {
    const trx: any = {
      deleteFrom: () => trx,
      where: () => trx,
      execute: async () => undefined,
    };
    return cb(trx);
  }),
}));

const mockedHelpers = helpers as jest.Mocked<typeof helpers>;

describe('AuthService', () => {
  let service: AuthService;

  const mockUserRepo = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    updateLastLogin: jest.fn(),
    updateUser: jest.fn(),
  };
  const mockUserTokenRepo = {
    insertUserToken: jest.fn(),
    findById: jest.fn(),
  };
  const mockTokenService = {
    generateAccessToken: jest.fn(),
  };
  const mockMailService = {
    sendToQueue: jest.fn(),
  };

  const workspaceId = 'workspace-1';
  const user: any = {
    id: 'user-1',
    name: 'Ada',
    email: 'ada@example.com',
    password: 'stored-hash',
    workspaceId,
    deletedAt: null,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockTokenService.generateAccessToken.mockResolvedValue('access-token');
    (mockedHelpers.hashPassword as jest.Mock).mockResolvedValue('new-hash');
    (mockedHelpers.nanoIdGen as jest.Mock).mockReturnValue('reset-token');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UserRepo, useValue: mockUserRepo },
        { provide: UserTokenRepo, useValue: mockUserTokenRepo },
        { provide: TokenService, useValue: mockTokenService },
        { provide: MailService, useValue: mockMailService },
      ],
    })
      .useMocker(autoMocker)
      .compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('login', () => {
    it('returns an access token and records the login', async () => {
      mockUserRepo.findByEmail.mockResolvedValue({ ...user });
      (mockedHelpers.comparePasswordHash as jest.Mock).mockResolvedValue(true);

      const token = await service.login(
        { email: user.email, password: 'correct' } as any,
        workspaceId,
      );

      expect(token).toBe('access-token');
      // The lookup must be workspace-scoped, or credentials from one
      // workspace would authenticate against another.
      expect(mockUserRepo.findByEmail).toHaveBeenCalledWith(
        user.email,
        workspaceId,
        { includePassword: true },
      );
      expect(mockUserRepo.updateLastLogin).toHaveBeenCalledWith(
        user.id,
        workspaceId,
      );
    });

    it('rejects a wrong password', async () => {
      mockUserRepo.findByEmail.mockResolvedValue({ ...user });
      (mockedHelpers.comparePasswordHash as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login(
          { email: user.email, password: 'wrong' } as any,
          workspaceId,
        ),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockTokenService.generateAccessToken).not.toHaveBeenCalled();
    });

    it('reports unknown-user and wrong-password identically, so accounts cannot be enumerated', async () => {
      mockUserRepo.findByEmail.mockResolvedValue(null);
      const unknown = await service
        .login(
          { email: 'nobody@example.com', password: 'x' } as any,
          workspaceId,
        )
        .catch((e) => e.message);

      mockUserRepo.findByEmail.mockResolvedValue({ ...user });
      (mockedHelpers.comparePasswordHash as jest.Mock).mockResolvedValue(false);
      const wrongPassword = await service
        .login({ email: user.email, password: 'x' } as any, workspaceId)
        .catch((e) => e.message);

      expect(unknown).toBe(wrongPassword);
    });

    it('refuses a soft-deleted user', async () => {
      mockUserRepo.findByEmail.mockResolvedValue({
        ...user,
        deletedAt: new Date(),
      });

      await expect(
        service.login(
          { email: user.email, password: 'correct' } as any,
          workspaceId,
        ),
      ).rejects.toThrow(UnauthorizedException);
      // Never even reaches the password comparison.
      expect(mockedHelpers.comparePasswordHash).not.toHaveBeenCalled();
    });
  });

  describe('changePassword', () => {
    it('requires the current password before writing a new one', async () => {
      mockUserRepo.findById.mockResolvedValue({ ...user });
      (mockedHelpers.comparePasswordHash as jest.Mock).mockResolvedValue(false);

      await expect(
        service.changePassword(
          { oldPassword: 'wrong', newPassword: 'new' } as any,
          user.id,
          workspaceId,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(mockUserRepo.updateUser).not.toHaveBeenCalled();
    });

    it('stores a hash, never the raw password, and notifies the user', async () => {
      mockUserRepo.findById.mockResolvedValue({ ...user });
      (mockedHelpers.comparePasswordHash as jest.Mock).mockResolvedValue(true);

      await service.changePassword(
        { oldPassword: 'correct', newPassword: 'plaintext-new' } as any,
        user.id,
        workspaceId,
      );

      expect(mockedHelpers.hashPassword).toHaveBeenCalledWith('plaintext-new');
      expect(mockUserRepo.updateUser).toHaveBeenCalledWith(
        { password: 'new-hash' },
        user.id,
        workspaceId,
      );
      expect(mockMailService.sendToQueue).toHaveBeenCalledWith(
        expect.objectContaining({ to: user.email }),
      );
    });
  });

  describe('forgotPassword', () => {
    const workspace: any = { id: workspaceId, hostname: 'acme' };

    it('issues a reset token that expires within the hour', async () => {
      mockUserRepo.findByEmail.mockResolvedValue({ ...user });
      const before = Date.now();

      await service.forgotPassword({ email: user.email } as any, workspace);

      const after = Date.now();
      const [token] = mockUserTokenRepo.insertUserToken.mock.calls[0];
      expect(token).toMatchObject({
        token: 'reset-token',
        userId: user.id,
        workspaceId,
        type: UserTokenType.FORGOT_PASSWORD,
      });
      // Bound against the window the call actually spanned, so this asserts
      // "about an hour" without being flaky on a slow millisecond.
      const expiresAt = token.expiresAt.getTime();
      expect(expiresAt).toBeGreaterThan(before);
      expect(expiresAt).toBeLessThanOrEqual(after + 60 * 60 * 1000);
    });

    it('stays silent for an unknown address rather than leaking membership', async () => {
      // Returning normally is deliberate: a different response for a known
      // address would turn this endpoint into a membership oracle.
      mockUserRepo.findByEmail.mockResolvedValue(null);

      await expect(
        service.forgotPassword(
          { email: 'nobody@example.com' } as any,
          workspace,
        ),
      ).resolves.toBeUndefined();

      expect(mockUserTokenRepo.insertUserToken).not.toHaveBeenCalled();
      expect(mockMailService.sendToQueue).not.toHaveBeenCalled();
    });

    it('stays silent for a soft-deleted user', async () => {
      mockUserRepo.findByEmail.mockResolvedValue({
        ...user,
        deletedAt: new Date(),
      });

      await service.forgotPassword({ email: user.email } as any, workspace);

      expect(mockUserTokenRepo.insertUserToken).not.toHaveBeenCalled();
    });
  });

  describe('passwordReset', () => {
    const validToken = {
      token: 'reset-token',
      userId: user.id,
      workspaceId,
      type: UserTokenType.FORGOT_PASSWORD,
      expiresAt: new Date(Date.now() + 60_000),
    };

    it('resets the password and returns a fresh access token', async () => {
      mockUserTokenRepo.findById.mockResolvedValue({ ...validToken });
      mockUserRepo.findById.mockResolvedValue({ ...user });

      const result = await service.passwordReset(
        { token: 'reset-token', newPassword: 'brand-new' } as any,
        workspaceId,
      );

      expect(mockUserRepo.updateUser).toHaveBeenCalledWith(
        { password: 'new-hash' },
        user.id,
        workspaceId,
        expect.anything(),
      );
      expect(result).toBe('access-token');
    });

    it('rejects an expired token', async () => {
      mockUserTokenRepo.findById.mockResolvedValue({
        ...validToken,
        expiresAt: new Date(Date.now() - 1),
      });

      await expect(
        service.passwordReset(
          { token: 'reset-token', newPassword: 'x' } as any,
          workspaceId,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(mockUserRepo.updateUser).not.toHaveBeenCalled();
    });

    it('rejects a token issued for a different purpose', async () => {
      // A token minted for some other flow must not be redeemable here.
      mockUserTokenRepo.findById.mockResolvedValue({
        ...validToken,
        type: 'some-other-type',
      });

      await expect(
        service.passwordReset(
          { token: 'reset-token', newPassword: 'x' } as any,
          workspaceId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an unknown token', async () => {
      mockUserTokenRepo.findById.mockResolvedValue(null);

      await expect(
        service.passwordReset(
          { token: 'nope', newPassword: 'x' } as any,
          workspaceId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when the token points at a deleted user', async () => {
      mockUserTokenRepo.findById.mockResolvedValue({ ...validToken });
      mockUserRepo.findById.mockResolvedValue({
        ...user,
        deletedAt: new Date(),
      });

      await expect(
        service.passwordReset(
          { token: 'reset-token', newPassword: 'x' } as any,
          workspaceId,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
