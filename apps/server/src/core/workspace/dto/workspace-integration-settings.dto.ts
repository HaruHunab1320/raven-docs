import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, ValidateNested } from 'class-validator';

export class RepoTokensDto {
  @IsOptional()
  @IsString()
  githubToken?: string;

  @IsOptional()
  @IsString()
  gitlabToken?: string;

  @IsOptional()
  @IsString()
  bitbucketToken?: string;
}

export class SlackIntegrationDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  teamId?: string;

  @IsOptional()
  @IsString()
  botToken?: string;

  @IsOptional()
  @IsString()
  signingSecret?: string;

  @IsOptional()
  @IsString()
  defaultChannelId?: string;

  @IsOptional()
  @IsString()
  defaultUserId?: string;
}

export class DiscordIntegrationDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  guildId?: string;

  @IsOptional()
  @IsString()
  botToken?: string;

  @IsOptional()
  @IsString()
  publicKey?: string;

  @IsOptional()
  @IsString()
  applicationId?: string;

  @IsOptional()
  @IsString()
  defaultChannelId?: string;

  @IsOptional()
  @IsString()
  defaultUserId?: string;
}

export class WorkspaceIntegrationSettingsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => RepoTokensDto)
  repoTokens?: RepoTokensDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => SlackIntegrationDto)
  slack?: SlackIntegrationDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => DiscordIntegrationDto)
  discord?: DiscordIntegrationDto;
}
