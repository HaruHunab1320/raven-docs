import { Global, Module } from '@nestjs/common';
import SpaceAbilityFactory from './abilities/space-ability.factory';
import WorkspaceAbilityFactory from './abilities/workspace-ability.factory';
import { DatabaseModule } from '../../database/database.module';

@Global()
@Module({
  imports: [DatabaseModule],
  providers: [WorkspaceAbilityFactory, SpaceAbilityFactory],
  exports: [WorkspaceAbilityFactory, SpaceAbilityFactory],
})
export class CaslModule {}
