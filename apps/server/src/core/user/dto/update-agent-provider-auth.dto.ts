import { IsOptional, IsString } from 'class-validator';

export class UpdateAgentProviderAuthDto {
  @IsOptional()
  @IsString()
  anthropicApiKey?: string;

  @IsOptional()
  @IsString()
  claudeSubscriptionToken?: string;

  @IsOptional()
  @IsString()
  openaiApiKey?: string;

  @IsOptional()
  @IsString()
  openaiSubscriptionToken?: string;

  @IsOptional()
  @IsString()
  googleApiKey?: string;
}
