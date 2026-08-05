import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { TokenService } from './token.service';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import { JwtType } from '../dto/jwt-payload';
import { autoMocker } from '../../../common/testing/auto-mock';

describe('TokenService', () => {
  let service: TokenService;

  const mockJwtService = {
    sign: jest.fn(),
    verifyAsync: jest.fn(),
  };

  const mockEnvironmentService = {
    getAppSecret: jest.fn(),
  };

  const activeUser: any = {
    id: 'user-1',
    email: 'agent@agents.internal',
    workspaceId: 'workspace-1',
    deletedAt: null,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockJwtService.sign.mockReturnValue('signed-token');
    mockEnvironmentService.getAppSecret.mockReturnValue('app-secret');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenService,
        { provide: JwtService, useValue: mockJwtService },
        { provide: EnvironmentService, useValue: mockEnvironmentService },
      ],
    })
      .useMocker(autoMocker)
      .compile();

    service = module.get<TokenService>(TokenService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateAccessToken', () => {
    it('scopes the token to the user and their workspace', async () => {
      const token = await service.generateAccessToken(activeUser);

      expect(token).toBe('signed-token');
      expect(mockJwtService.sign).toHaveBeenCalledWith({
        sub: 'user-1',
        email: 'agent@agents.internal',
        workspaceId: 'workspace-1',
        type: JwtType.ACCESS,
      });
    });

    it('refuses to mint a token for a soft-deleted user', async () => {
      // A deleted user must not keep authenticating — this check is the only
      // thing between a removed account and a live session.
      const deleted = { ...activeUser, deletedAt: new Date() };

      await expect(service.generateAccessToken(deleted)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockJwtService.sign).not.toHaveBeenCalled();
    });
  });

  describe('generateCollabToken', () => {
    it('issues a workspace-scoped collab token that expires in 24h', async () => {
      await service.generateCollabToken('user-1', 'workspace-1');

      expect(mockJwtService.sign).toHaveBeenCalledWith(
        { sub: 'user-1', workspaceId: 'workspace-1', type: JwtType.COLLAB },
        { expiresIn: '24h' },
      );
    });
  });

  describe('generateExchangeToken', () => {
    it('issues a short-lived exchange token', async () => {
      await service.generateExchangeToken('user-1', 'workspace-1');

      const [payload, options] = mockJwtService.sign.mock.calls[0];
      expect(payload).toEqual({
        sub: 'user-1',
        workspaceId: 'workspace-1',
        type: JwtType.EXCHANGE,
      });
      // Exchange tokens get passed around to bootstrap a session, so the
      // window for replaying one has to stay tiny.
      expect(options).toEqual({ expiresIn: '10s' });
    });
  });

  describe('verifyJwt', () => {
    it('verifies against the app secret and returns the payload', async () => {
      const payload = { sub: 'user-1', type: JwtType.ACCESS };
      mockJwtService.verifyAsync.mockResolvedValue(payload);

      const result = await service.verifyJwt('a-token', JwtType.ACCESS);

      expect(result).toBe(payload);
      expect(mockJwtService.verifyAsync).toHaveBeenCalledWith('a-token', {
        secret: 'app-secret',
      });
    });

    it('rejects a token whose type does not match the expected one', async () => {
      // Guards against token confusion — e.g. presenting a 24h collab token
      // where a short-lived access token is required.
      mockJwtService.verifyAsync.mockResolvedValue({
        sub: 'user-1',
        type: JwtType.COLLAB,
      });

      await expect(
        service.verifyJwt('a-token', JwtType.ACCESS),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('propagates a failed signature check', async () => {
      mockJwtService.verifyAsync.mockRejectedValue(
        new Error('invalid signature'),
      );

      await expect(
        service.verifyJwt('tampered', JwtType.ACCESS),
      ).rejects.toThrow('invalid signature');
    });
  });
});
