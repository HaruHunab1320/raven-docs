import { Module } from '@nestjs/common';
import { AttachmentService } from './services/attachment.service';
import { AttachmentController } from './attachment.controller';
import { StorageModule } from '../../integrations/storage/storage.module';
import { UserModule } from '../user/user.module';
import { WorkspaceModule } from '../workspace/workspace.module';
import { AttachmentProcessor } from './processors/attachment.processor';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [StorageModule, UserModule, WorkspaceModule, DatabaseModule],
  controllers: [AttachmentController],
  providers: [AttachmentService, AttachmentProcessor],
  exports: [AttachmentService],
})
export class AttachmentModule {}
