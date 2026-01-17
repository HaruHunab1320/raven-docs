import {
  STORAGE_CONFIG_TOKEN,
  STORAGE_DRIVER_TOKEN,
} from '../constants/storage.constants';
import { EnvironmentService } from '../../environment/environment.service';
import {
  LocalStorageConfig,
  S3StorageConfig,
  StorageConfig,
  StorageDriver,
  StorageOption,
} from '../interfaces';
import { GcsDriver, LocalDriver, S3Driver } from '../drivers';
import * as process from 'node:process';
import { LOCAL_STORAGE_PATH } from '../../../common/helpers';
import path from 'path';

function createStorageDriver(disk: StorageConfig): StorageDriver {
  switch (disk.driver) {
    case StorageOption.LOCAL:
      return new LocalDriver(disk.config as LocalStorageConfig);
    case StorageOption.S3:
      return new S3Driver(disk.config as S3StorageConfig);
    case StorageOption.GCS:
      return new GcsDriver(disk.config);
    default:
      throw new Error(`Unknown storage driver`);
  }
}

export const storageDriverConfigProvider = {
  provide: STORAGE_CONFIG_TOKEN,
  useFactory: async (environmentService: EnvironmentService) => {
    const driver = environmentService.getStorageDriver().toLowerCase();

    switch (driver) {
      case StorageOption.LOCAL:
        return {
          driver,
          config: {
            storagePath: LOCAL_STORAGE_PATH,
          },
        };

      case StorageOption.S3:
        { const s3Config = {
          driver,
          config: {
            region: environmentService.getAwsS3Region(),
            endpoint: environmentService.getAwsS3Endpoint(),
            bucket: environmentService.getAwsS3Bucket(),
            baseUrl: environmentService.getAwsS3Url(),
            forcePathStyle: environmentService.getAwsS3ForcePathStyle(),
            credentials: undefined,
          },
        };

        /**
         * This makes use of AWS_S3_ACCESS_KEY_ID and AWS_S3_SECRET_ACCESS_KEY if present,
         * If not present, it makes it lenient for the AWS SDK to use
         * AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY if they are present in the environment
         */
        if (
          environmentService.getAwsS3AccessKeyId() ||
          environmentService.getAwsS3SecretAccessKey()
        ) {
          s3Config.config.credentials = {
            accessKeyId: environmentService.getAwsS3AccessKeyId(),
            secretAccessKey: environmentService.getAwsS3SecretAccessKey(),
          };
        }

        return s3Config; }

      case StorageOption.GCS: {
        const keyFilename = environmentService.getGcsKeyFile();
        const clientEmail = environmentService.getGcsClientEmail();
        const rawPrivateKey = environmentService.getGcsPrivateKey();
        const privateKey = rawPrivateKey?.replace(/\\n/g, '\n');

        const gcsConfig = {
          driver,
          config: {
            projectId: environmentService.getGcsProjectId(),
            bucket: environmentService.getGcsBucket(),
            baseUrl: environmentService.getGcsBaseUrl(),
            keyFilename: keyFilename || undefined,
            credentials:
              !keyFilename && clientEmail && privateKey
                ? {
                    client_email: clientEmail,
                    private_key: privateKey,
                  }
                : undefined,
          },
        };

        return gcsConfig;
      }

      default:
        throw new Error(`Unknown storage driver: ${driver}`);
    }
  },

  inject: [EnvironmentService],
};

export const storageDriverProvider = {
  provide: STORAGE_DRIVER_TOKEN,
  useFactory: (config: StorageConfig) => createStorageDriver(config),
  inject: [STORAGE_CONFIG_TOKEN],
};
