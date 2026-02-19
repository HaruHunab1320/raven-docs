import { Module } from '@nestjs/common';
import { GitWorkspaceService } from './git-workspace.service';
import { DatabaseModule } from '../../database/database.module';
import { GitHubModule } from '../../integrations/github/github.module';

@Module({
  imports: [DatabaseModule, GitHubModule],
  providers: [GitWorkspaceService],
  exports: [GitWorkspaceService],
})
export class GitWorkspaceModule {}
