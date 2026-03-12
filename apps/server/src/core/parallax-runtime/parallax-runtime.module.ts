import { Module, Global } from '@nestjs/common';
import { ParallaxClientService } from './parallax-client.service';

/**
 * Global module providing Parallax runtime integration.
 *
 * When PARALLAX_CONTROL_PLANE_URL is set, enables:
 *   - OrgPattern upload (YAML serialization → Parallax pattern registry)
 *   - Pattern execution (team deployments run on Parallax K8s runtime)
 *   - Execution monitoring (status polling, event streaming)
 *   - Remote agent management (logs, output, keys, pause/resume)
 *
 * When not configured, the service reports isAvailable() = false
 * and callers fall back to local PTY-based agent execution.
 */
@Global()
@Module({
  providers: [ParallaxClientService],
  exports: [ParallaxClientService],
})
export class ParallaxRuntimeModule {}
