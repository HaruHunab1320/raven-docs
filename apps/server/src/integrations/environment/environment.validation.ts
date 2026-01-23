import {
  IsIn,
  IsNotEmpty,
  IsNotIn,
  IsOptional,
  IsUrl,
  MinLength,
  ValidateIf,
  validateSync,
} from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { Logger } from '@nestjs/common';

export class EnvironmentVariables {
  // DATABASE_URL is optional if individual DB_* vars are provided
  @ValidateIf((obj) => !obj.DB_HOST || !obj.DB_NAME || !obj.DB_USER || !obj.DB_PASSWORD)
  @IsNotEmpty()
  @IsUrl(
    {
      protocols: ['postgres', 'postgresql'],
      require_tld: false,
      allow_underscores: true,
    },
    { message: 'DATABASE_URL must be a valid postgres connection string' },
  )
  DATABASE_URL: string;

  @IsOptional()
  DB_HOST: string;

  @IsOptional()
  DB_PORT: string;

  @IsOptional()
  DB_NAME: string;

  @IsOptional()
  DB_USER: string;

  @IsOptional()
  DB_PASSWORD: string;

  @IsNotEmpty()
  @IsUrl(
    {
      protocols: ['redis', 'rediss'],
      require_tld: false,
      allow_underscores: true,
    },
    { message: 'REDIS_URL must be a valid redis connection string' },
  )
  REDIS_URL: string;

  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_tld: false })
  APP_URL: string;

  @IsNotEmpty()
  @MinLength(32)
  @IsNotIn(['REPLACE_WITH_LONG_SECRET'])
  APP_SECRET: string;

  @IsOptional()
  @IsIn(['smtp', 'postmark', 'resend', 'log'])
  MAIL_DRIVER: string;

  @IsOptional()
  @ValidateIf((obj) => obj.MAIL_DRIVER === 'resend')
  @IsNotEmpty()
  RESEND_API_KEY: string;

  @IsOptional()
  @IsIn(['local', 's3', 'gcs'])
  STORAGE_DRIVER: string;

  @ValidateIf((obj) => obj.STORAGE_DRIVER === 'gcs')
  @IsNotEmpty()
  GCS_BUCKET: string;

  @IsOptional()
  GCS_PROJECT_ID: string;

  @IsOptional()
  GCS_CLIENT_EMAIL: string;

  @IsOptional()
  GCS_PRIVATE_KEY: string;

  @IsOptional()
  GCS_KEY_FILE: string;

  @IsOptional()
  GCS_BASE_URL: string;

  @IsOptional()
  @ValidateIf((obj) => obj.COLLAB_URL != '' && obj.COLLAB_URL != null)
  @IsUrl({ protocols: ['http', 'https'], require_tld: false })
  COLLAB_URL: string;

  @IsOptional()
  CLOUD: boolean;

  @IsOptional()
  @IsUrl(
    { protocols: [], require_tld: true },
    {
      message:
        'SUBDOMAIN_HOST must be a valid FQDN domain without the http protocol. e.g example.com',
    },
  )
  @ValidateIf((obj) => obj.CLOUD === 'true'.toLowerCase())
  SUBDOMAIN_HOST: string;
}

export function validate(config: Record<string, any>) {
  const logger = new Logger('EnvironmentValidation');
  const validatedConfig = plainToInstance(EnvironmentVariables, config);

  const errors = validateSync(validatedConfig);

  if (errors.length > 0) {
    logger.error(
      'The Environment variables has failed the following validations:',
    );

    errors.map((error) => {
      logger.error(JSON.stringify(error.constraints));
    });

    logger.error(
      'Please fix the environment variables and try again. Exiting program...',
    );
    process.exit(1);
  }

  return validatedConfig;
}
