import { Injectable, NestMiddleware } from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { WorkspaceRepo } from '../../database/repos/workspace/workspace.repo';

@Injectable()
export class DomainMiddleware implements NestMiddleware {
  constructor(
    private workspaceRepo: WorkspaceRepo,
    private environmentService: EnvironmentService,
  ) {}
  async use(
    req: FastifyRequest['raw'],
    res: FastifyReply['raw'],
    next: () => void,
  ) {
    const attachWorkspace = (workspace: any | null) => {
      if (!workspace) {
        (req as any).workspaceId = null;
        return false;
      }

      (req as any).workspaceId = workspace.id;
      (req as any).workspace = workspace;
      return true;
    };

    if (this.environmentService.isSelfHosted()) {
      const workspace = await this.workspaceRepo.findFirst();
      if (!attachWorkspace(workspace)) {
        return next();
      }
    } else if (this.environmentService.isCloud()) {
      const header = req.headers.host;
      const subdomain = header.split('.')[0];

      const workspace = await this.workspaceRepo.findByHostname(subdomain);

      if (!attachWorkspace(workspace)) {
        return next();
      }
    }

    next();
  }
}
