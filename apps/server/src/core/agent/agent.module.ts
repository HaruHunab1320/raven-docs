import { Module, forwardRef } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { AgentPlannerService } from './agent-planner.service';
import { AgentLoopService } from './agent-loop.service';
import { AgentLoopSchedulerService } from './agent-loop-scheduler.service';
import { AgentPolicyService } from './agent-policy.service';
import { AgentHandoffService } from './agent-handoff.service';
import { AgentReviewPromptsService } from './agent-review-prompts.service';
import { AgentMemoryContextService } from './agent-memory-context.service';
import { WeeklyReviewService } from './weekly-review.service';
import { AgentMemoryModule } from '../agent-memory/agent-memory.module';
import { ProjectModule } from '../project/project.module';
import { PageModule } from '../page/page.module';
import { CaslModule } from '../casl/casl.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { DatabaseModule } from '../../database/database.module';
import { AIModule } from '../../integrations/ai/ai.module';
import { MCPModule } from '../../integrations/mcp/mcp.module';

@Module({
  imports: [
    DatabaseModule,
    AgentMemoryModule,
    ProjectModule,
    PageModule,
    CaslModule,
    KnowledgeModule,
    AIModule,
    forwardRef(() => MCPModule),
  ],
  controllers: [AgentController],
  providers: [
    AgentService,
    AgentPlannerService,
    AgentLoopService,
    AgentLoopSchedulerService,
    AgentPolicyService,
    AgentHandoffService,
    AgentReviewPromptsService,
    AgentMemoryContextService,
    WeeklyReviewService,
  ],
  exports: [
    AgentService,
    AgentPlannerService,
    AgentLoopService,
    AgentMemoryContextService,
    WeeklyReviewService,
    AgentReviewPromptsService,
  ],
})
export class AgentModule {}
