import { Global, Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { TerminusModule } from '@nestjs/terminus';
import { PostgresHealthIndicator } from './postgres.health';
import { RedisHealthIndicator } from './redis.health';
import { DatabaseModule } from '../../database/database.module';

@Global()
@Module({
  controllers: [HealthController],
  providers: [PostgresHealthIndicator, RedisHealthIndicator],
  imports: [TerminusModule, DatabaseModule],
})
export class HealthModule {}
