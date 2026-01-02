import { Module } from '@nestjs/common';
import { TelemetryService } from './telemetry.service';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from '../../database/database.module';
import { EnvironmentModule } from '../environment/environment.module';

@Module({
  providers: [TelemetryService],
  imports: [ScheduleModule.forRoot(), DatabaseModule, EnvironmentModule],
})
export class TelemetryModule {}
