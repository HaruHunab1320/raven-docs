import { Test, TestingModule } from '@nestjs/testing';
import { StorageService } from './storage.service';
import { STORAGE_DRIVER_TOKEN } from './constants/storage.constants';
import { autoMocker } from '../../common/testing/auto-mock';

/**
 * StorageService is a thin pass-through to whichever driver is configured
 * (local disk vs S3). What is worth pinning is that it delegates faithfully
 * — arguments in the right order, results returned untouched, and failures
 * propagated rather than swallowed — because a caller has no other way to
 * tell one driver from another.
 */
describe('StorageService', () => {
  let service: StorageService;

  const mockDriver = {
    upload: jest.fn(),
    read: jest.fn(),
    exists: jest.fn(),
    getSignedUrl: jest.fn(),
    getUploadSignedUrl: jest.fn(),
    getUrl: jest.fn(),
    delete: jest.fn(),
    getDriverName: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageService,
        { provide: STORAGE_DRIVER_TOKEN, useValue: mockDriver },
      ],
    })
      .useMocker(autoMocker)
      .compile();

    service = module.get<StorageService>(StorageService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('uploads content to the driver at the given path', async () => {
    const content = Buffer.from('hello');

    await service.upload('space/file.png', content);

    expect(mockDriver.upload).toHaveBeenCalledWith('space/file.png', content);
  });

  it('returns the buffer the driver read', async () => {
    const content = Buffer.from('hello');
    mockDriver.read.mockResolvedValue(content);

    await expect(service.read('space/file.png')).resolves.toBe(content);
    expect(mockDriver.read).toHaveBeenCalledWith('space/file.png');
  });

  it('reports existence from the driver', async () => {
    mockDriver.exists.mockResolvedValue(false);

    await expect(service.exists('missing.png')).resolves.toBe(false);
  });

  it('passes the expiry through when signing a read url', async () => {
    mockDriver.getSignedUrl.mockResolvedValue('https://signed');

    await expect(service.getSignedUrl('file.png', 900)).resolves.toBe(
      'https://signed',
    );
    expect(mockDriver.getSignedUrl).toHaveBeenCalledWith('file.png', 900);
  });

  it('passes expiry and content type through when signing an upload url', async () => {
    mockDriver.getUploadSignedUrl.mockResolvedValue('https://upload');

    await service.getUploadSignedUrl('file.png', 300, 'image/png');

    expect(mockDriver.getUploadSignedUrl).toHaveBeenCalledWith(
      'file.png',
      300,
      'image/png',
    );
  });

  it('omits the content type when none is given', async () => {
    await service.getUploadSignedUrl('file.png', 300);

    expect(mockDriver.getUploadSignedUrl).toHaveBeenCalledWith(
      'file.png',
      300,
      undefined,
    );
  });

  it('returns the driver public url unchanged', () => {
    mockDriver.getUrl.mockReturnValue('https://cdn/file.png');

    expect(service.getUrl('file.png')).toBe('https://cdn/file.png');
  });

  it('deletes through the driver', async () => {
    await service.delete('file.png');

    expect(mockDriver.delete).toHaveBeenCalledWith('file.png');
  });

  it('reports which driver is configured', () => {
    mockDriver.getDriverName.mockReturnValue('s3');

    expect(service.getDriverName()).toBe('s3');
  });

  it('propagates a driver failure instead of swallowing it', async () => {
    // A silently-succeeding upload would lose the caller's file.
    mockDriver.upload.mockRejectedValue(new Error('disk full'));

    await expect(service.upload('file.png', Buffer.from(''))).rejects.toThrow(
      'disk full',
    );
  });
});
