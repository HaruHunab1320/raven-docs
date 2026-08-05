import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EnvironmentService } from './environment.service';
import { autoMocker } from '../../common/testing/auto-mock';

/**
 * Most of this service is a straight config read. The tests below cover the
 * handful of methods that actually transform a value — defaults, string-to-
 * boolean coercion, and URL parsing — because those are where a wrong answer
 * silently changes runtime behaviour (cookies not marked secure, TLS off,
 * uploads capped at the wrong size).
 */
describe('EnvironmentService', () => {
  let service: EnvironmentService;
  let env: Record<string, string | undefined>;

  const mockConfigService = {
    get: jest.fn((key: string, fallback?: string) => {
      const value = env[key];
      return value === undefined ? fallback : value;
    }),
  };

  beforeEach(async () => {
    env = {};
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EnvironmentService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    })
      .useMocker(autoMocker)
      .compile();

    service = module.get<EnvironmentService>(EnvironmentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getNodeEnv', () => {
    it('defaults to development', () => {
      expect(service.getNodeEnv()).toBe('development');
    });

    it('returns the configured environment', () => {
      env.NODE_ENV = 'production';
      expect(service.getNodeEnv()).toBe('production');
    });
  });

  describe('getPort', () => {
    it('defaults to 3000 as a number, not a string', () => {
      expect(service.getPort()).toBe(3000);
    });

    it('parses a configured port', () => {
      env.PORT = '8080';
      expect(service.getPort()).toBe(8080);
    });
  });

  describe('getAppUrl', () => {
    it('falls back to localhost on the configured port', () => {
      env.PORT = '4000';
      expect(service.getAppUrl()).toBe('http://localhost:4000');
    });

    it('reduces a configured url to its origin', () => {
      // Anything appended to APP_URL (path, query, trailing slash) must be
      // dropped, since this value gets concatenated to build links.
      env.APP_URL = 'https://docs.example.com/some/path?x=1';
      expect(service.getAppUrl()).toBe('https://docs.example.com');
    });
  });

  describe('isHttps', () => {
    it('is true for an https app url', () => {
      env.APP_URL = 'https://docs.example.com';
      expect(service.isHttps()).toBe(true);
    });

    it('is false for an http app url', () => {
      env.APP_URL = 'http://localhost:3000';
      expect(service.isHttps()).toBe(false);
    });

    it('is false rather than throwing when the url is unparseable', () => {
      // Failing closed matters: this decides whether cookies are marked
      // secure, and an exception here would take down startup.
      env.APP_URL = 'not-a-url';
      expect(service.isHttps()).toBe(false);
    });

    it('is false when no app url is configured', () => {
      expect(service.isHttps()).toBe(false);
    });
  });

  describe('boolean flags', () => {
    it('treats a missing value as false', () => {
      expect(service.getSmtpSecure()).toBe(false);
      expect(service.getSmtpIgnoreTLS()).toBe(false);
      expect(service.isCloud()).toBe(false);
    });

    it('accepts "true" in any casing', () => {
      env.SMTP_SECURE = 'TRUE';
      env.CLOUD = 'True';
      expect(service.getSmtpSecure()).toBe(true);
      expect(service.isCloud()).toBe(true);
    });

    it('treats any other value as false rather than truthy', () => {
      // A bare non-empty string like "yes" or "1" must not silently enable
      // a flag the operator did not turn on.
      env.SMTP_SECURE = 'yes';
      env.CLOUD = '1';
      expect(service.getSmtpSecure()).toBe(false);
      expect(service.isCloud()).toBe(false);
    });
  });

  describe('isSelfHosted', () => {
    it('is the inverse of isCloud', () => {
      expect(service.isSelfHosted()).toBe(true);

      env.CLOUD = 'true';
      expect(service.isSelfHosted()).toBe(false);
    });
  });

  describe('getFileUploadSizeLimit', () => {
    it('defaults to 50mb when unset', () => {
      expect(service.getFileUploadSizeLimit()).toBe('50mb');
    });

    it('defaults to 50mb when set to blank whitespace', () => {
      env.FILE_UPLOAD_SIZE_LIMIT = '   ';
      expect(service.getFileUploadSizeLimit()).toBe('50mb');
    });

    it('honours a configured limit', () => {
      env.FILE_UPLOAD_SIZE_LIMIT = '200mb';
      expect(service.getFileUploadSizeLimit()).toBe('200mb');
    });
  });

  describe('getRedisUrl', () => {
    it('defaults to a local redis', () => {
      expect(service.getRedisUrl()).toBe('redis://localhost:6379');
    });

    it('honours a configured url', () => {
      env.REDIS_URL = 'redis://cache:6380';
      expect(service.getRedisUrl()).toBe('redis://cache:6380');
    });
  });
});
