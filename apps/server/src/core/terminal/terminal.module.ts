import { Module } from '@nestjs/common';
import { TerminalGateway } from './terminal.gateway';
import { TerminalSessionService } from './terminal-session.service';
import { TerminalController } from './terminal.controller';
import { AuthModule } from '../auth/auth.module';
import { TokenModule } from '../auth/token.module';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [AuthModule, TokenModule, DatabaseModule],
  controllers: [TerminalController],
  providers: [TerminalGateway, TerminalSessionService],
  exports: [TerminalSessionService, TerminalGateway],
})
export class TerminalModule {}
