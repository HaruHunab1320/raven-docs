# Raven Docs + Parallax: Multi-Agent Knowledge Work

## The Vision

Raven Docs is an intelligent document and memory system. Parallax is a multi-agent orchestration platform. Together, they create something unprecedented: **a knowledge workspace where AI agents work alongside humans as true collaborators**.

This isn't just about automation. It's about creating an environment where:
- Knowledge compounds over time
- AI agents have persistent memory and context
- Multiple specialized agents collaborate on complex work
- Human oversight is maintained without bottlenecks
- The workspace gets smarter the more it's used

---

## What This Unlocks

### 1. Agents as Team Members

With Parallax integration, AI agents become first-class citizens in your workspace:

```
Traditional AI                    Raven + Parallax
─────────────────                 ─────────────────
Stateless chat                →   Persistent memory across sessions
Single-turn tasks             →   Multi-step autonomous projects
Generic assistant             →   Specialized agents with capabilities
Manual orchestration          →   Coordinated multi-agent workflows
No accountability             →   Full activity audit trail
```

**Example**: Assign a research agent to a project. It remembers past research, builds on previous findings, coordinates with a writing agent, and produces documentation - all while logging its work for human review.

### 2. Compound Knowledge

Raven Docs' memory system + Parallax agents = knowledge that grows:

```
Week 1: Agent researches competitor landscape
        → Memory: Key competitors, their features, market positioning

Week 2: Agent updates research with new developments
        → Memory: Trends, changes, new entrants (builds on Week 1)

Week 3: Agent drafts strategy document
        → Uses accumulated knowledge, cites specific memories

Week 4: Human reviews, agent incorporates feedback
        → Memory: Preferences, corrections, approved approaches
```

The agent doesn't start from scratch each time. It builds institutional knowledge.

### 3. Specialized Agent Teams

Different agents for different capabilities:

| Agent Type | Capabilities | Use Cases |
|------------|--------------|-----------|
| **Research Agent** | `web_search`, `document_analysis`, `citation` | Market research, literature reviews, competitive analysis |
| **Writing Agent** | `content_generation`, `editing`, `formatting` | Documentation, reports, proposals |
| **Code Agent** | `code_analysis`, `code_generation`, `testing` | Technical docs, API references, code reviews |
| **Planning Agent** | `task_decomposition`, `scheduling`, `prioritization` | Project planning, roadmaps, sprint planning |
| **Review Agent** | `quality_check`, `consistency`, `compliance` | Document review, style guides, approval workflows |

Agents can be assigned to projects based on required capabilities. A complex initiative might have multiple agents collaborating.

### 4. Human-in-the-Loop at Scale

The approval system means humans stay in control without becoming bottlenecks:

```
┌─────────────────────────────────────────────────────────────┐
│                    AUTONOMY SPECTRUM                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Full Manual ◄──────────────────────────────────► Full Auto │
│                                                              │
│  ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐     │
│  │  Read   │   │ Create  │   │ Modify  │   │ Delete  │     │
│  │  Only   │   │  Draft  │   │ Content │   │ Content │     │
│  └─────────┘   └─────────┘   └─────────┘   └─────────┘     │
│       │             │             │             │           │
│    Always        Usually       Sometimes      Rarely        │
│   Approved      Approved       Approved      Approved       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

Configure per-agent, per-capability approval policies. Research agents might auto-execute reads but require approval for writes. High-trust agents might have more autonomy.

### 5. Observable AI Work

Every agent action is logged:

```
Agent: research-agent-alpha
Project: Q1 Competitive Analysis
─────────────────────────────────────────
10:32 AM  Started task "Analyze competitor pricing"
10:33 AM  Queried memory for previous pricing research
10:35 AM  Fetched competitor website data
10:41 AM  Created draft page "Pricing Comparison 2024"
10:42 AM  Requested approval for page publish
11:15 AM  Approval granted by @sarah
11:15 AM  Published page to project space
11:16 AM  Updated task status to "completed"
11:16 AM  Stored findings in workspace memory
```

Full transparency. Full audit trail. Debug issues, understand decisions, build trust.

### 6. Cross-Agent Collaboration

Agents can discover and delegate to each other:

```typescript
// Research agent finds it needs code analysis
const codeAgents = await agent.tools.agent_list_workspace({
  capabilities: ['code_analysis'],
  status: 'idle'
});

// Requests delegation (requires approval)
await agent.tools.agent_delegate_task({
  taskId: 'analyze-api-endpoints',
  targetAgentId: codeAgents[0].id,
  reason: 'Task requires code analysis capabilities I lack'
});
```

Specialized agents handle what they're good at. The system orchestrates.

---

## Real-World Scenarios

### Scenario 1: Autonomous Documentation

**Setup**: Writing agent assigned to Engineering space

**Workflow**:
1. Agent monitors for new code merges (via webhook)
2. Analyzes code changes using code capabilities
3. Drafts documentation updates
4. Submits for review via approval system
5. Incorporates feedback, remembers style preferences
6. Publishes approved documentation
7. Updates memory with new technical knowledge

**Result**: Documentation stays current with minimal human effort

### Scenario 2: Research Project

**Setup**: Research agent + Writing agent assigned to Strategy project

**Workflow**:
1. Human creates task: "Research AI trends in healthcare"
2. Research agent decomposes into subtasks
3. Research agent gathers data, stores in memory
4. Research agent hands off to Writing agent
5. Writing agent drafts report using research memories
6. Human reviews, provides feedback
7. Writing agent revises, learns preferences
8. Final report published

**Result**: Complex research project completed with human oversight at key points

### Scenario 3: Onboarding Assistant

**Setup**: Planning agent with access to company knowledge base

**Workflow**:
1. New employee joins workspace
2. Agent creates personalized onboarding plan
3. Agent answers questions using institutional memory
4. Agent creates relevant task lists
5. Agent connects new employee with key documents
6. Agent tracks onboarding progress
7. Agent learns what information is most useful

**Result**: Consistent, personalized onboarding that improves over time

### Scenario 4: Continuous Intelligence

**Setup**: Research agent running on schedule

**Workflow**:
1. Daily: Agent scans industry news
2. Filters for relevance using workspace context
3. Summarizes into daily digest page
4. Weekly: Synthesizes daily findings into trends
5. Monthly: Updates strategic analysis documents
6. Flags significant changes for human attention
7. All findings stored in searchable memory

**Result**: Organization always has current market intelligence

---

## Architecture Overview

```
┌────────────────────────────────────────────────────────────────────┐
│                         RAVEN DOCS                                  │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │                    PARALLAX INTEGRATION                        │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │ │
│  │  │   Agent     │  │   Agent     │  │    Agent Activity   │   │ │
│  │  │  Registry   │  │ Assignments │  │    & Audit Log      │   │ │
│  │  │             │  │             │  │                     │   │ │
│  │  │ • Access    │  │ • Project   │  │ • All actions logged│   │ │
│  │  │ • Approval  │  │ • Task      │  │ • Searchable        │   │ │
│  │  │ • Revoke    │  │ • Role      │  │ • Exportable        │   │ │
│  │  └─────────────┘  └─────────────┘  └─────────────────────┘   │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                              │                                      │
│  ┌───────────────────────────┼───────────────────────────────────┐ │
│  │                    EXISTING SYSTEMS                            │ │
│  │                           │                                    │ │
│  │  ┌─────────────┐  ┌──────┴──────┐  ┌─────────────────────┐   │ │
│  │  │   Memory    │  │    MCP      │  │     Approval        │   │ │
│  │  │   System    │  │   Server    │  │     System          │   │ │
│  │  │             │  │             │  │                     │   │ │
│  │  │ • 7 Traits  │  │ • 140+ tools│  │ • Policy-based      │   │ │
│  │  │ • Signals   │  │ • WebSocket │  │ • Human-in-loop     │   │ │
│  │  │ • Profiles  │  │ • Events    │  │ • Configurable      │   │ │
│  │  └─────────────┘  └─────────────┘  └─────────────────────┘   │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                              │                                      │
│                         MCP Protocol                                │
│                              │                                      │
└──────────────────────────────┼──────────────────────────────────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
       ┌────────────┐   ┌────────────┐   ┌────────────┐
       │  Research  │   │  Writing   │   │   Code     │
       │   Agent    │   │   Agent    │   │   Agent    │
       └────────────┘   └────────────┘   └────────────┘
                               │
                    ┌──────────┴──────────┐
                    │   PARALLAX CONTROL   │
                    │       PLANE          │
                    │                      │
                    │  • Agent Lifecycle   │
                    │  • Pattern Engine    │
                    │  • Orchestration     │
                    └─────────────────────┘
```

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1)
Database schema and core infrastructure

```sql
-- Three new tables
parallax_agents           -- Agent registry with access control
parallax_agent_assignments -- Project/task assignments
parallax_agent_activity   -- Full audit trail
```

**Deliverables**:
- [ ] Database migration
- [ ] Repository layer
- [ ] Type definitions

### Phase 2: Service Layer (Week 2)
Core business logic

```typescript
ParallaxAgentsService
├── Access Management (request, approve, deny, revoke)
├── Assignments (projects, tasks, roles)
├── Activity Logging (full audit trail)
└── Parallax Communication (webhooks, callbacks)
```

**Deliverables**:
- [ ] ParallaxAgentsModule
- [ ] ParallaxAgentsService
- [ ] REST API endpoints
- [ ] Unit tests

### Phase 3: MCP Integration (Week 3)
Agent-facing tools

```typescript
// New MCP tools for agents
agent_my_assignments    // Get assigned work
agent_update_status     // Report status
agent_log_activity      // Log actions
agent_list_workspace    // Discover other agents
agent_delegate_task     // Cross-agent delegation
```

**Deliverables**:
- [ ] ParallaxAgentHandler
- [ ] Tool schema definitions
- [ ] API key extensions for agents
- [ ] Permission enforcement

### Phase 4: Real-time Events (Week 3-4)
WebSocket integration for live updates

```typescript
// Event types
agent.access_requested   // New agent wants access
agent.access_approved    // Admin approved agent
agent.task_assigned      // Agent got new work
agent.task_completed     // Agent finished task
agent.status_changed     // Agent status update
```

**Deliverables**:
- [ ] Event type definitions
- [ ] Gateway subscriptions
- [ ] Event publishing from service

### Phase 5: User Interface (Week 4)
Admin and user-facing components

```
Agent Settings Page
├── Pending Requests (approve/deny)
├── Active Agents (manage, revoke)
├── Agent Activity Feed
└── Permission Configuration

Task/Project UI Extensions
├── Agent Assignment Picker
├── Agent Activity Panel
└── Capability Badges
```

**Deliverables**:
- [ ] Agent settings page
- [ ] Request approval flow
- [ ] Assignment UI components
- [ ] Activity visualization

### Phase 6: Polish & Launch (Week 5)
Integration testing and documentation

**Deliverables**:
- [ ] E2E tests with Parallax
- [ ] User documentation
- [ ] API documentation
- [ ] Performance testing

---

## Technical Specifications

### Database Schema

```sql
-- Agents registered from Parallax
CREATE TABLE parallax_agents (
  id VARCHAR PRIMARY KEY,              -- Parallax agent ID
  workspace_id UUID NOT NULL,
  name VARCHAR NOT NULL,
  description TEXT,
  capabilities TEXT[] NOT NULL,
  status VARCHAR DEFAULT 'pending',    -- pending|approved|denied|revoked
  requested_permissions TEXT[],
  granted_permissions TEXT[],
  mcp_api_key_id VARCHAR,              -- Links to MCP key
  metadata JSONB,
  requested_at TIMESTAMP,
  resolved_at TIMESTAMP,
  resolved_by UUID
);

-- Agent assignments to projects/tasks
CREATE TABLE parallax_agent_assignments (
  id UUID PRIMARY KEY,
  agent_id VARCHAR NOT NULL,
  workspace_id UUID NOT NULL,
  assignment_type VARCHAR,             -- 'project' or 'task'
  project_id UUID,
  task_id UUID,
  role VARCHAR DEFAULT 'member',       -- 'member' or 'lead'
  assigned_at TIMESTAMP,
  assigned_by UUID
);

-- Complete activity audit log
CREATE TABLE parallax_agent_activity (
  id UUID PRIMARY KEY,
  agent_id VARCHAR NOT NULL,
  workspace_id UUID NOT NULL,
  activity_type VARCHAR NOT NULL,
  description TEXT,
  metadata JSONB,
  project_id UUID,
  task_id UUID,
  page_id UUID,
  created_at TIMESTAMP
);
```

### API Endpoints

```
POST   /api/parallax-agents/access-request    # Parallax requests access
GET    /api/parallax-agents/pending           # Get pending requests
GET    /api/parallax-agents                   # List workspace agents
GET    /api/parallax-agents/:id               # Get agent details
POST   /api/parallax-agents/:id/approve       # Approve access
POST   /api/parallax-agents/:id/deny          # Deny access
POST   /api/parallax-agents/:id/revoke        # Revoke access
POST   /api/parallax-agents/:id/permissions   # Update permissions
POST   /api/parallax-agents/:id/assign/project
POST   /api/parallax-agents/:id/assign/task
DELETE /api/parallax-agents/assignments/:id   # Unassign
GET    /api/parallax-agents/:id/activity      # Activity log
GET    /api/parallax-agents/available         # Agents by capability
```

### MCP Tools

| Tool | Description | Approval |
|------|-------------|----------|
| `agent_my_assignments` | Get current agent's assigned work | No |
| `agent_update_status` | Update working status | No |
| `agent_log_activity` | Log an action for audit | No |
| `agent_list_workspace` | List other agents | No |
| `agent_delegate_task` | Delegate to another agent | Yes |

### Environment Configuration

```bash
# Parallax Integration
PARALLAX_CONTROL_PLANE_URL=https://parallax.example.com
PARALLAX_WEBHOOK_SECRET=secret-for-signature-verification
PARALLAX_MAX_AGENTS_PER_WORKSPACE=20
```

---

## Security Model

### Access Control

1. **Request Phase**: Agent must explicitly request access
2. **Approval Phase**: Human admin must approve
3. **Permission Scoping**: Only granted permissions work
4. **Audit Trail**: Every action logged
5. **Revocation**: Instant access removal

### API Key Security

- Agent keys use `mcp_agent_` prefix
- SHA256 hashed in database
- Scoped to specific permissions
- Tracked with `last_used_at`
- Immediately revocable

### Permission Model

```typescript
const AGENT_PERMISSIONS = {
  // Read operations
  'read:pages': 'Read page content',
  'read:tasks': 'Read task details',
  'read:projects': 'Read project information',
  'read:memory': 'Query workspace memory',

  // Write operations (higher trust)
  'write:pages': 'Create and edit pages',
  'write:tasks': 'Create and update tasks',
  'write:memory': 'Store memories',

  // Advanced operations (highest trust)
  'delete:pages': 'Delete pages',
  'assign:tasks': 'Assign tasks to others',
  'delegate:agents': 'Delegate to other agents',
};
```

---

## Success Metrics

### Adoption
- Agents registered per workspace
- Active agents (used in last 7 days)
- Tasks completed by agents

### Efficiency
- Average task completion time
- Human review time for agent work
- Approval queue wait time

### Quality
- Agent work acceptance rate
- Revisions requested per task
- User satisfaction scores

### Safety
- Denied access requests
- Revoked agents
- Policy violations caught

---

## The Live Workspace Experience

The ultimate experience is **hands-free observation** - create a project, assign agents, and watch it unfold:

### The "Ant Farm" View

```
┌─────────────────────────────────────────────────────────────────────┐
│  Project: Q1 Competitive Analysis                        Live ●    │
│  Agents: research-alpha ● | writing-beta ○ | review-gamma ○        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ● research-alpha is working...                                     │
│    └─ Querying web for competitor pricing updates                   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  TASKS                                            ◉ Live    │   │
│  │  ───────────────────────────────────────────────────────────│   │
│  │  ✓ Identify top 5 competitors         research-alpha   Done │   │
│  │  ✓ Gather pricing information         research-alpha   Done │   │
│  │  ◐ Analyze market positioning         research-alpha    75% │   │
│  │  ○ Draft competitive analysis         writing-beta   Queued │   │
│  │  ○ Review and fact-check              review-gamma  Waiting │   │
│  │  ───────────────────────────────────────────────────────────│   │
│  │  + research-alpha created 3 new subtasks                    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  ACTIVITY STREAM                                            │   │
│  │  ───────────────────────────────────────────────────────────│   │
│  │  2:34 PM  research-alpha created task "Deep dive: Acme Co"  │   │
│  │  2:33 PM  research-alpha stored 8 findings in memory        │   │
│  │  2:32 PM  research-alpha completed "Gather pricing info"    │   │
│  │  2:28 PM  research-alpha started "Analyze positioning"      │   │
│  │  2:15 PM  You assigned research-alpha to project            │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  PAGES CREATED                                              │   │
│  │  📄 Competitor Overview (draft) ............... 2:31 PM     │   │
│  │  📄 Pricing Comparison Table (draft) .......... 2:29 PM     │   │
│  │  📄 Market Positioning Notes (draft) .......... 2:25 PM     │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  PENDING APPROVALS                              1 waiting   │   │
│  │  ───────────────────────────────────────────────────────────│   │
│  │  research-alpha wants to delegate "Technical Analysis"      │   │
│  │  to code-analyzer (requires code_analysis capability)       │   │
│  │                                    [ Approve ] [ Deny ]     │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  [ Pause Agents ] [ Add Agent ] [ View Memory Graph ]              │
└─────────────────────────────────────────────────────────────────────┘
```

### What You're Watching

1. **Real-time task creation** - Agents decompose work into subtasks as they discover complexity
2. **Live progress updates** - Watch completion percentages tick up via WebSocket
3. **Memory accumulation** - See knowledge being stored as agents work
4. **Cross-agent handoffs** - writing-beta activates when research-alpha finishes
5. **Approval requests** - Agents ask permission for sensitive operations
6. **Document drafts appearing** - Pages materialize as agents write

### The Flow

```
You: "Create project, assign research + writing agents"
     ↓
System: Agents receive assignments via WebSocket
     ↓
research-alpha: Decomposes goal into tasks
     ↓
research-alpha: Executes tasks, stores findings in memory
     ↓
research-alpha: Creates draft pages with research
     ↓
research-alpha: Marks research tasks complete, triggers writing-beta
     ↓
writing-beta: Queries memory for research findings
     ↓
writing-beta: Drafts report, requests approval to publish
     ↓
You: Review draft, approve (or request changes)
     ↓
writing-beta: Publishes, stores feedback in memory for next time
```

**You set direction. Agents execute. The UI updates live. You approve when needed.**

### Implementation: Real-Time UI

The WebSocket events make this possible:

```typescript
// Client subscribes to project events
socket.emit('agent:subscribe', { projectId: 'proj_123' });

// Events stream in real-time
socket.on('agent:event', (event) => {
  switch (event.type) {
    case 'agent.task_created':
      addTaskToUI(event.data.task);
      break;
    case 'agent.task_progress':
      updateTaskProgress(event.data.taskId, event.data.progress);
      break;
    case 'agent.task_completed':
      markTaskComplete(event.data.taskId);
      triggerCelebration(); // 🎉
      break;
    case 'agent.page_created':
      addPageToSidebar(event.data.page);
      break;
    case 'agent.memory_stored':
      incrementMemoryCount(event.data.count);
      break;
    case 'agent.approval_requested':
      showApprovalDialog(event.data);
      break;
    case 'agent.status_changed':
      updateAgentStatus(event.data.agentId, event.data.status);
      break;
  }
});
```

### Project Dashboard Concept

```typescript
// New component: ProjectAgentDashboard
function ProjectAgentDashboard({ projectId }) {
  const { agents, tasks, activity, approvals } = useProjectAgents(projectId);

  return (
    <div>
      {/* Agent status bar */}
      <AgentStatusBar agents={agents} />

      {/* Live task board */}
      <TaskBoard tasks={tasks} showAgentBadges />

      {/* Activity stream */}
      <ActivityStream events={activity} live />

      {/* Approval queue */}
      {approvals.length > 0 && (
        <ApprovalQueue items={approvals} />
      )}

      {/* Memory insights */}
      <MemoryInsightsPanel projectId={projectId} />
    </div>
  );
}
```

This is the future of project management: **observable, autonomous, human-guided AI work**.

---

## The Bigger Picture

Raven Docs + Parallax isn't just a feature integration. It's a glimpse of how knowledge work evolves:

**Today**: Humans do most work, AI assists occasionally
**With This**: AI agents do routine work, humans guide and review
**Future**: Collaborative intelligence where human creativity and AI capability compound

The memory system means agents get better over time. The approval system means humans stay in control. The audit trail means full transparency.

This is the foundation for truly intelligent workspaces.

---

## Storage & Retention Strategy

### Growth Projections

The Parallax integration adds three tables to PostgreSQL and increases vector DB usage through agent memories.

| Usage Level | Agents | Activities/Day | Monthly Growth | Yearly Growth |
|-------------|--------|----------------|----------------|---------------|
| **Light** | 5 | ~200 | ~35 MB | ~400 MB |
| **Medium** | 15 | ~1,000 | ~180 MB | ~2 GB |
| **Heavy** | 30 | ~5,000 | ~750 MB | ~9 GB |
| **Enterprise** | 50+ | ~20,000 | ~3.5 GB | ~42 GB |

**Verdict**: Very manageable. A busy workspace generates ~2-10 GB/year combined.

### Retention Policies

```typescript
// apps/server/src/core/parallax-agents/constants/retention.constants.ts

export const ACTIVITY_RETENTION = {
  // Full detailed records with all metadata
  detailed: 30,  // days

  // Aggregated daily summaries (counts, samples)
  summarized: 90,  // days

  // Permanently deleted
  purged: 365,  // days
};

export const MEMORY_RETENTION = {
  // Full content + embeddings, actively queryable
  active: 90,  // days

  // Text only, embeddings removed (saves ~60% space)
  archived: 365,  // days

  // Permanently deleted
  purged: 730,  // days (2 years)
};
```

### Activity Aggregation Job

Run daily to compress old activity records:

```typescript
// apps/server/src/core/parallax-agents/jobs/activity-aggregation.job.ts

@Injectable()
export class ActivityAggregationJob {
  @Cron('0 3 * * *') // 3 AM daily
  async aggregateOldActivity() {
    const cutoffDate = subDays(new Date(), ACTIVITY_RETENTION.detailed);

    // Aggregate into daily summaries
    await this.db
      .insertInto('parallax_agent_activity_daily')
      .columns(['agent_id', 'workspace_id', 'activity_date', 'activity_type', 'count', 'sample_metadata'])
      .expression(
        this.db
          .selectFrom('parallax_agent_activity')
          .select([
            'agent_id',
            'workspace_id',
            sql`DATE(created_at)`.as('activity_date'),
            'activity_type',
            sql`COUNT(*)`.as('count'),
            sql`jsonb_agg(metadata ORDER BY created_at DESC) FILTER (WHERE row_number <= 3)`.as('sample_metadata'),
          ])
          .where('created_at', '<', cutoffDate)
          .groupBy(['agent_id', 'workspace_id', sql`DATE(created_at)`, 'activity_type'])
      )
      .onConflict((oc) => oc.doUpdateSet({ count: sql`EXCLUDED.count` }))
      .execute();

    // Delete detailed records
    await this.db
      .deleteFrom('parallax_agent_activity')
      .where('created_at', '<', cutoffDate)
      .execute();

    this.logger.log(`Aggregated activity older than ${cutoffDate.toISOString()}`);
  }
}
```

### Memory Compaction Job

Periodically merge similar memories and archive old ones:

```typescript
// apps/server/src/core/agent-memory/jobs/memory-compaction.job.ts

@Injectable()
export class MemoryCompactionJob {
  @Cron('0 4 * * 0') // 4 AM every Sunday
  async compactMemories() {
    // 1. Find and merge highly similar memories (>95% similarity)
    const clusters = await this.findSimilarMemories({ threshold: 0.95 });
    for (const cluster of clusters) {
      await this.mergeMemoryCluster(cluster);
    }

    // 2. Archive old memories (remove embeddings, keep text)
    const archiveCutoff = subDays(new Date(), MEMORY_RETENTION.active);
    await this.archiveMemories(archiveCutoff);

    // 3. Purge very old memories
    const purgeCutoff = subDays(new Date(), MEMORY_RETENTION.purged);
    await this.purgeMemories(purgeCutoff);
  }
}
```

### Monitoring Alerts

```typescript
// Storage monitoring thresholds
export const STORAGE_ALERTS = {
  activityTable: {
    warning: 1_000_000,   // 1M rows
    critical: 5_000_000,  // 5M rows
  },
  memoryTable: {
    warning: 500_000,     // 500K memories
    critical: 2_000_000,  // 2M memories
  },
  vectorDbSize: {
    warning: 10_000_000_000,   // 10 GB
    critical: 50_000_000_000,  // 50 GB
  },
};
```

---

## Agent Work Control: Live Toggle

Projects and tasks have a `agentLive` flag that controls whether agents can pick up work.

### Use Cases

1. **Bulk task creation** - Create 20 tasks, refine them, then flip `agentLive: true`
2. **Human review first** - Stage work for approval before agents start
3. **Pause agent work** - Temporarily stop agents on a project
4. **Controlled rollout** - Enable agents on specific tasks only

### Schema Addition

```sql
-- Add to projects table
ALTER TABLE projects ADD COLUMN agent_live BOOLEAN DEFAULT false;
ALTER TABLE projects ADD COLUMN agent_live_changed_at TIMESTAMP;
ALTER TABLE projects ADD COLUMN agent_live_changed_by UUID REFERENCES users(id);

-- Add to tasks table
ALTER TABLE tasks ADD COLUMN agent_live BOOLEAN DEFAULT NULL;
-- NULL = inherit from project, true/false = override
```

### Inheritance Logic

```typescript
function isTaskAvailableForAgents(task: Task, project: Project): boolean {
  // Task-level override takes precedence
  if (task.agentLive !== null) {
    return task.agentLive;
  }
  // Otherwise inherit from project
  return project.agentLive;
}
```

### UI Controls

```
┌─────────────────────────────────────────────────────────────┐
│  Project: Q1 Analysis                                        │
│                                                              │
│  Agent Access: [====○----] Live                             │
│                OFF      ON                                   │
│                                                              │
│  When live, assigned agents can pick up and work on tasks.  │
│  Currently: 3 agents assigned, 12 tasks available           │
│                                                              │
│  [ Make All Tasks Live ] [ Pause All Agent Work ]           │
└─────────────────────────────────────────────────────────────┘
```

### Events

```typescript
// When toggled, emit event so agents know
this.mcpEventService.emit({
  type: 'project.agent_live_changed',
  projectId,
  agentLive: true,
  availableTasks: 12,
});
```

---

## Getting Started

1. Review this document and `ParallaxIntegration.md`
2. Start with Phase 1 (database migration)
3. Build incrementally, test continuously
4. Ship when core flow works end-to-end
5. Iterate based on real usage

---

*Last updated: January 2026*
