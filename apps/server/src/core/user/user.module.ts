import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { UserRepo } from '@raven-docs/db/repos/user/user.repo';
import { DatabaseModule } from '../../database/database.module';
import { SubscriptionController } from './subscription.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [UserController, SubscriptionController],
  providers: [UserService, UserRepo],
  exports: [UserService, UserRepo],
})
export class UserModule {}
