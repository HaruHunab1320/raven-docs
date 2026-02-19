import { Module } from '@nestjs/common';
import { GitWorkspaceService } from './git-workspace.service';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [GitWorkspaceService],
  exports: [GitWorkspaceService],
})
export class GitWorkspaceModule {}
