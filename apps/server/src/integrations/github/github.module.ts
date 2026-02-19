import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { CaslModule } from '../../core/casl/casl.module';
import { GitHubOAuthService } from './github-oauth.service';
import { GitHubOAuthController } from './github-oauth.controller';

@Module({
  imports: [DatabaseModule, CaslModule],
  providers: [GitHubOAuthService],
  controllers: [GitHubOAuthController],
  exports: [GitHubOAuthService],
})
export class GitHubModule {}
