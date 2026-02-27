import { Module } from '@nestjs/common';
import { LocalSyncController } from './local-sync.controller';
import { LocalSyncService } from './local-sync.service';
import { DatabaseModule } from '../../database/database.module';
import { LocalSyncRepo } from '../../database/repos/local-sync/local-sync.repo';

@Module({
  imports: [DatabaseModule],
  controllers: [LocalSyncController],
  providers: [LocalSyncService, LocalSyncRepo],
  exports: [LocalSyncService],
})
export class LocalSyncModule {}
