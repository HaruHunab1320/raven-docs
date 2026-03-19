import { Module, Global } from '@nestjs/common';
import { ParallaxClientService } from './parallax-client.service';
import { ParallaxThreadPollerService } from './parallax-thread-poller.service';
import { TeamDeploymentRepo } from '../../database/repos/team/team-deployment.repo';
import { DatabaseModule } from '../../database/database.module';

/**
 * Global module providing Parallax runtime integration.
 *
 * When PARALLAX_API_KEY + PARALLAX_CONTROL_PLANE_URL are set (deployed mode):
 *   - Uses @parallaxai/client SDK for all API calls
 *   - Spawns long-running agent threads (instead of ephemeral PTY processes)
 *   - Polls thread events and translates them to parallax.* events
 *   - All existing team event handlers work unchanged
 *
 * When not configured, isAvailable() returns false and callers fall back
 * to local PTY-based agent execution.
 */
@Global()
@Module({
  imports: [DatabaseModule],
  providers: [ParallaxClientService, ParallaxThreadPollerService, TeamDeploymentRepo],
  exports: [ParallaxClientService, ParallaxThreadPollerService],
})
export class ParallaxRuntimeModule {}
