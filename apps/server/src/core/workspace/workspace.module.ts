import { Module } from '@nestjs/common';
import { WorkspaceService } from './services/workspace.service';
import { WorkspaceController } from './controllers/workspace.controller';
import { SpaceModule } from '../space/space.module';
import { WorkspaceInvitationService } from './services/workspace-invitation.service';
import { TokenModule } from '../auth/token.module';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [SpaceModule, TokenModule, DatabaseModule],
  controllers: [WorkspaceController],
  providers: [WorkspaceService, WorkspaceInvitationService],
  exports: [WorkspaceService, WorkspaceInvitationService],
})
export class WorkspaceModule {}
