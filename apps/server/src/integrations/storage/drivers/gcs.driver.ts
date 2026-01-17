import { Storage } from '@google-cloud/storage';
import { getMimeType } from '../../../common/helpers';
import {
  GcsStorageConfig,
  StorageDriver,
  StorageOption,
} from '../interfaces';

export class GcsDriver implements StorageDriver {
  private readonly client: Storage;
  private readonly config: GcsStorageConfig;

  constructor(config: GcsStorageConfig) {
    this.config = config;
    this.client = new Storage({
      projectId: config.projectId,
      keyFilename: config.keyFilename,
      credentials: config.credentials,
    });
  }

  async upload(filePath: string, file: Buffer): Promise<void> {
    try {
      const contentType = getMimeType(filePath);
      await this.client
        .bucket(this.config.bucket)
        .file(filePath)
        .save(file, { contentType });
    } catch (err) {
      throw new Error(`Failed to upload file: ${(err as Error).message}`);
    }
  }

  async read(filePath: string): Promise<Buffer> {
    try {
      const [contents] = await this.client
        .bucket(this.config.bucket)
        .file(filePath)
        .download();
      return contents;
    } catch (err) {
      throw new Error(`Failed to read file from GCS: ${(err as Error).message}`);
    }
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      const [exists] = await this.client
        .bucket(this.config.bucket)
        .file(filePath)
        .exists();
      return exists;
    } catch (err) {
      throw new Error(`Failed to check file existence: ${(err as Error).message}`);
    }
  }

  getUrl(filePath: string): string {
    const baseUrl = this.config.baseUrl?.replace(/\/$/, '');
    if (baseUrl) {
      return `${baseUrl}/${filePath}`;
    }
    return `https://storage.googleapis.com/${this.config.bucket}/${filePath}`;
  }

  async getSignedUrl(filePath: string, expiresIn: number): Promise<string> {
    const [url] = await this.client
      .bucket(this.config.bucket)
      .file(filePath)
      .getSignedUrl({
        action: 'read',
        expires: Date.now() + expiresIn * 1000,
        version: 'v4',
      });
    return url;
  }

  async getUploadSignedUrl(
    filePath: string,
    expiresIn: number,
    contentType?: string,
  ): Promise<string> {
    const [url] = await this.client
      .bucket(this.config.bucket)
      .file(filePath)
      .getSignedUrl({
        action: 'write',
        expires: Date.now() + expiresIn * 1000,
        version: 'v4',
        contentType: contentType || getMimeType(filePath),
      });
    return url;
  }

  async delete(filePath: string): Promise<void> {
    try {
      await this.client
        .bucket(this.config.bucket)
        .file(filePath)
        .delete({ ignoreNotFound: true });
    } catch (err) {
      throw new Error(
        `Error deleting file ${filePath} from GCS. ${(err as Error).message}`,
      );
    }
  }

  getDriver(): Storage {
    return this.client;
  }

  getDriverName(): string {
    return StorageOption.GCS;
  }

  getConfig(): Record<string, any> {
    return this.config;
  }
}
