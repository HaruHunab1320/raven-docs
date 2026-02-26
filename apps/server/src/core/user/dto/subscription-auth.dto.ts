import { IsIn, IsOptional, IsString } from 'class-validator';

export const SUBSCRIPTION_PROVIDERS = [
  'anthropic-subscription',
  'openai-codex',
] as const;

export type SubscriptionProvider = (typeof SUBSCRIPTION_PROVIDERS)[number];

export class StartSubscriptionDto {
  @IsIn(SUBSCRIPTION_PROVIDERS)
  provider!: SubscriptionProvider;
}

export class ExchangeSubscriptionDto {
  @IsIn(SUBSCRIPTION_PROVIDERS)
  provider!: SubscriptionProvider;

  @IsString()
  code!: string;

  @IsOptional()
  @IsString()
  state?: string;
}

export class SetupSubscriptionTokenDto {
  @IsIn(SUBSCRIPTION_PROVIDERS)
  provider!: SubscriptionProvider;

  @IsString()
  token!: string;
}

export class DeleteSubscriptionDto {
  @IsIn(SUBSCRIPTION_PROVIDERS)
  provider!: SubscriptionProvider;
}

