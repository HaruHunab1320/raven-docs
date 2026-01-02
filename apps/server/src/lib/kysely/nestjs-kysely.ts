import { Inject } from '@nestjs/common';

// Matching the token name from the nestjs-kysely package
export const KYSELY = 'KyselyModuleConnectionToken';

// Create a decorator to inject the Kysely instance
export const InjectKysely = () => Inject(KYSELY);
