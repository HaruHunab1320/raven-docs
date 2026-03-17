import { Module, Global } from '@nestjs/common';
import { ParallaxClientService } from './parallax-client.service';
import { ParallaxThreadPollerService } from './parallax-thread-poller.service';

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
  providers: [ParallaxClientService, ParallaxThreadPollerService],
  exports: [ParallaxClientService, ParallaxThreadPollerService],
})
export class ParallaxRuntimeModule {}
