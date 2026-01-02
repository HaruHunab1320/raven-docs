import { Module } from '@nestjs/common';
import { WsGateway } from './ws.gateway';
import { TokenModule } from '../core/auth/token.module';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [TokenModule, DatabaseModule],
  providers: [WsGateway],
})
export class WsModule {}
