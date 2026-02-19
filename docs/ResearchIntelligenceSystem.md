# Research Intelligence System — Development Plan

**Status:** Active Development
**Date:** 2026-02-18
**Based on:** Research Intelligence System UX Design Document (Parzival + Claude, 2026-02-09)

---

## Overview

Build a workspace intelligence system into Raven Docs that enables multi-agent research swarms. The system uses typed pages, graph relationships, context assembly, and role-aware agent teams to allow a PI (or any user) to run autonomous research programs at scale.

**Key architectural decision:** The infrastructure is baked into core. Domain-specific configurations (research, engineering, product) are workspace-level "intelligence profiles" — configuration, not code.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    RAVEN DOCS CORE                           │
│                                                              │
│  Typed Pages ─── Graph Relationships ─── Context Assembly    │
│  Multi-Agent Framework ─── Pattern Detection Engine          │
│  Team Templates ─── Intelligence Profiles                    │
│                                                              │
└──────────────────────┬───────────────────────────────────────┘
                       │
          ┌────────────┼────────────────┐
          ▼            ▼                ▼
   ┌─────────────┐ ┌──────────┐ ┌───────────────┐
   │  Research    │ │Engineering│ │   Product     │
   │  Profile    │ │  Profile  │ │   Profile     │
   │             │ │ (future)  │ │  (future)     │
   │ hypotheses  │ │ RFCs/ADRs │ │ feature specs │
   │ experiments │ │ tech debt │ │ user stories  │
   │ validates/  │ │ implements│ │ enables/      │
   │ contradicts │ │ depends-on│ │ blocks        │
   └─────────────┘ └──────────┘ └───────────────┘
```

---

## Existing Systems (What We're Extending)

### Pages
- JSONB `content` column, `text_content` plain text, `tsv` full-text search vector
- No page type system — **need to add `page_type` + `metadata` columns**
- Hierarchical via `parent_page_id`
- Agent accessible via `agent_accessible` boolean
- Page history tracked in `page_history` table

### Memgraph (Graph Database)
- Neo4j driver over Bolt protocol
- Current nodes: `MemoryNode`, `Entity`
- Current relationships: `REFERS_TO` only
- Used exclusively by `AgentMemoryService` — no generic graph service
- **Need to add: page-level nodes, typed research relationships, generic graph service**

### Knowledge / Embeddings (pgvector)
- `knowledge_chunks` table with `vector(3072)` embeddings (gemini-embedding-001)
- `memory_embeddings` table for agent memory vectors
- Cosine distance search: `1 - (embedding <=> query::vector)`
- Sequential scan (3072 dims exceed pgvector HNSW index limit of 2000)
- Context builder: tag-based filtering + semantic vector search

### Workspace Settings
- Single JSONB `settings` column on workspaces table
- Top-level keys: `agent`, `integrations`
- JSONB merge updates via `COALESCE(settings, '{}'::jsonb) || jsonb_build_object(...)`
- **Add new `intelligence` key for profile configuration**

### Agent Loop
- `AgentLoopService` — scheduled autonomy loop per space
- Gemini plans actions → executes via MCP (max 3 actions/run)
- 5 supported methods: `task.create`, `task.update`, `page.create`, `project.create`, `research.create`
- `AgentPolicyService` — auto/approval/deny per method
- Currently single-agent, sequential execution
- **Need: multi-agent concurrent loops, role-aware prompts**

### Task/Kanban System
- Statuses: `todo`, `in_progress`, `in_review`, `done`, `blocked`
- Priorities: `low`, `medium`, `high`, `urgent`
- Labels system (workspace-scoped, colored)
- Task dependencies
- Agent access via `agent_accessible` + `agent_live` fields
- MCP tools: `task.get`, `task.list`, `task.create`, `task.update`

---

## Implementation Phases

### Phase 1: Core Infrastructure (~2 weeks)

The foundation everything else builds on.

#### 1.1 Typed Page Metadata
**Migration:** Add `page_type` and `metadata` columns to pages table.

```sql
ALTER TABLE pages ADD COLUMN page_type VARCHAR(50) DEFAULT NULL;
ALTER TABLE pages ADD COLUMN metadata JSONB DEFAULT NULL;
CREATE INDEX idx_pages_page_type ON pages(page_type) WHERE page_type IS NOT NULL;
CREATE INDEX idx_pages_metadata ON pages USING GIN (metadata) WHERE metadata IS NOT NULL;
```

- `page_type`: nullable string — `null` for regular pages, `'hypothesis'`, `'experiment'`, `'paper'`, etc. for typed pages
- `metadata`: JSONB for type-specific structured data (status, predictions, results, domain tags, etc.)
- Regular pages are unaffected (both columns nullable, default null)

**Page type metadata schemas** (validated at application level, not DB):
```typescript
// Hypothesis
{ status: 'proposed'|'testing'|'validated'|'refuted'|'inconclusive'|'superseded',
  formalStatement: string,                      // Required. The testable claim.
  claimLabel: 'hypothesis'|'conjecture'|'empirically_supported'|'proved'|'axiom',  // Required. Canon classification.
  predictions: string[], prerequisites: string[],
  assumptions: string[],                        // Explicit assumptions the claim depends on
  theoremIds: string[],                         // Links to formal theorem identifiers
  canonVersion: string,                         // Version of the canon this belongs to
  priority: 'low'|'medium'|'high'|'critical', domainTags: string[],
  successCriteria: string,
  statusDecision: string,                       // Rationale for the current status (who decided, why)
  evidenceQualityScore: number,                 // Computed: based on replication, ablations, independent impl
  replicationCount: number,                     // How many independent replications
  independentImplementations: number,           // Distinct implementations that validate
  ablationsConducted: boolean,                  // Whether ablation studies were done
  intakeGateCompleted: boolean,                 // Required true before promotion to 'proved'
  intakeGateChecklist: Record<string, any>,     // Structured checklist + decision record
  registeredBy: string, approvedBy: string|null }

// Experiment
{ status: 'planned'|'running'|'completed'|'failed',
  hypothesisId: string|null, method: string,
  metrics: Record<string, any>, results: Record<string, any>,
  passedPredictions: boolean|null, unexpectedObservations: string[],
  suggestedFollowUps: string[], codeRef: string|null,
  // Reproducibility fields
  exactCommand: string,                         // Exact command used to run the experiment
  seedPolicy: string,                           // How random seeds are managed
  configHash: string,                           // Hash of the configuration used
  artifactPaths: string[],                      // Paths to output artifacts
  artifactChecksum: string,                     // Checksum of artifacts for integrity verification
  runtime: { duration: number, compute: string } }

// Paper
{ status: 'outline'|'draft'|'review'|'submitted'|'published',
  domainTags: string[], coauthors: string[],
  claimCount: number, evidenceGaps: number }

// Open Question (alternative to task-based tracking)
{ status: 'open'|'investigating'|'answered'|'deferred',
  source: string, domainTags: string[], estimatedEffort: string,
  relatedEntityIds: string[] }
```

**Files to modify:**
- New migration in `apps/server/src/database/migrations/`
- Update `db.d.ts` types
- Update `entity.types.ts`
- Update `page.repo.ts` — add metadata to base fields, add `findByType()` query
- Update `page.service.ts` — validate metadata on create/update
- Update page DTOs — add `pageType` and `metadata` fields

#### 1.2 Graph Relationship Types (Memgraph)
**Create a `ResearchGraphService`** that extends Memgraph usage beyond agent memory.

New node label:
- `PageNode` — `{ id, workspaceId, spaceId, pageType, title, domainTags[], createdAt }`

New relationship types:
- `VALIDATES` — experiment → hypothesis
- `CONTRADICTS` — experiment → hypothesis (or experiment → experiment). Carries `contradictionType` metadata: `direct_theorem` | `scope_mismatch` | `metric_disagreement`
- `EXTENDS` — hypothesis → hypothesis
- `INSPIRED_BY` — any → any
- `USES_DATA_FROM` — experiment → experiment
- `FORMALIZES` — paper → hypothesis
- `TESTS_HYPOTHESIS` — experiment → hypothesis
- `SPAWNED_FROM` — hypothesis → experiment result
- `SUPERSEDES` — hypothesis → hypothesis
- `CITES` — paper → experiment/paper
- `REPLICATES` — experiment → experiment
- `REPRODUCES` — experiment → experiment (independent successful reproduction)
- `FAILS_TO_REPRODUCE` — experiment → experiment (failed reproduction attempt)
- `USES_ASSUMPTION` — any → hypothesis (declares dependency on an assumption)

All edges carry: `{ createdAt, createdBy, workspaceId, metadata? }`

**Files to create:**
- `apps/server/src/core/research-graph/research-graph.service.ts`
- `apps/server/src/core/research-graph/research-graph.module.ts`
- `apps/server/src/core/research-graph/research-graph.controller.ts`
- `apps/server/src/core/research-graph/dto/` — DTOs for edge creation, queries

**Key methods:**
```typescript
// Node management
syncPageNode(pageId, workspaceId, pageType, title, domainTags)
removePageNode(pageId)

// Edge management
createRelationship(fromPageId, toPageId, type, metadata?)
removeRelationship(fromPageId, toPageId, type)
getRelationships(pageId, direction?, types?)

// Queries
getRelatedPages(pageId, maxDepth, edgeTypes?)
findContradictions(workspaceId, domainTags?)
getEvidenceChain(hypothesisPageId)
getDomainGraph(workspaceId, domainTags)
```

#### 1.3 Context Assembly Service
The "what do we know about X?" capability. Combines vector search + graph traversal into structured context bundles.

**File to create:** `apps/server/src/core/context-assembly/context-assembly.service.ts`

```typescript
interface ContextBundle {
  query: string;
  directHits: TypedPage[];           // Pages semantically matching the query
  relatedWork: TypedPage[];          // 1-2 hop graph connections from direct hits
  timeline: TimelineEntry[];         // Chronological evolution of understanding
  currentState: {
    validated: TypedPage[];          // Hypotheses with status 'validated'
    refuted: TypedPage[];
    testing: TypedPage[];
    open: TypedPage[];
  };
  openQuestions: Task[];             // Tasks labeled 'open-question' related to query
  contradictions: GraphEdge[];       // CONTRADICTS edges in the subgraph
  experiments: TypedPage[];          // Experiment pages in the subgraph
  papers: TypedPage[];               // Paper pages in the subgraph
}

async assembleContext(query: string, workspaceId: string, spaceId?: string): Promise<ContextBundle>
```

**Assembly algorithm:**
1. Embed query via `vectorSearch.embedText(query)`
2. Search `knowledge_chunks` + `memory_embeddings` for semantic matches
3. Match results to pages via source linkage
4. From matched page IDs, traverse Memgraph 1-2 hops for related work
5. Filter graph results by workspace scope
6. Query tasks with `open-question` label matching domain tags
7. Extract contradictions from CONTRADICTS edges in the subgraph
8. Structure into ContextBundle

**MCP tool:** `context.query` — agents can call this to get structured context.

#### 1.4 Intelligence Profile (Workspace Settings)
Add `intelligence` key to workspace settings JSON.

```typescript
interface IntelligenceProfile {
  enabled: boolean;
  profileType: string;  // 'research' | 'engineering' | 'product' | 'custom'

  pageTypes: Array<{
    type: string;              // e.g. 'hypothesis'
    label: string;             // Display name
    icon: string;              // Emoji or icon
    statusFlow: string[];      // Ordered statuses
    metadataSchema: Record<string, {
      type: 'text' | 'text[]' | 'enum' | 'tag[]' | 'page_ref' | 'json' | 'boolean' | 'number';
      required?: boolean;
      values?: string[];       // For enum type
      pageType?: string;       // For page_ref type
    }>;
  }>;

  edgeTypes: Array<{
    name: string;              // e.g. 'validates'
    label: string;             // Display name
    from: string | 'any';     // Page type constraint
    to: string | 'any';
    color: string;
  }>;

  teamTemplates: Array<{
    name: string;
    description: string;
    roles: Array<{
      role: string;
      systemPrompt: string;
      capabilities: string[];
      count: number;
    }>;
  }>;

  patternRules: Array<{
    type: string;              // e.g. 'convergence', 'contradiction', 'staleness'
    condition: string;         // Human-readable description
    params: Record<string, any>;  // e.g. { threshold: 3, maxAge: 14 }
    action: 'notify' | 'flag' | 'surface' | 'create_task';
  }>;

  dashboardWidgets: string[];   // Widget IDs to show
}
```

**Research profile (default):**
Pre-built profile with hypothesis/experiment/paper page types, research edge types, and research team templates.

**Files to modify:**
- New DTO: `apps/server/src/core/workspace/dto/intelligence-settings.dto.ts`
- Update workspace repo: add `updateIntelligenceSettings()` method
- Update workspace controller: add `GET/POST /workspace/intelligence` endpoints
- Add settings resolver with defaults

---

### Phase 2: Research Profile & MCP Tools (~2 weeks)

#### 2.1 Research MCP Handlers
New MCP tools for agents:

- `hypothesis.create` — Create hypothesis page with typed metadata
- `hypothesis.update` — Update hypothesis status, link evidence
- `experiment.register` — Create experiment page linked to hypothesis
- `experiment.complete` — Record results, update hypothesis, spawn follow-ups
- `context.query` — "What do we know about X?" → returns ContextBundle
- `relationship.create` — Add typed edge between pages
- `openquestion.create` — Create open question task with domain tags
- `openquestion.route` — Find best open question for an agent's capabilities

#### 2.2 Graph Auto-Population
When pages with metadata are created/updated:
- Auto-sync `PageNode` to Memgraph
- Auto-create edges from metadata references (e.g. experiment's `hypothesisId` → TESTS_HYPOTHESIS edge)
- Auto-extract entities from page content → Entity nodes + REFERS_TO edges

#### 2.3 Research Dashboard (Client)
New UI section in workspace:
- Hypothesis scoreboard (validated / testing / refuted / proposed counts)
- Active experiments
- Open questions queue (prioritized, filterable by domain)
- Recent findings timeline
- Domain graph visualization (using existing Memgraph graph UI patterns)
- Stale thread alerts

---

### Phase 3: Multi-Agent Research Teams (~2 weeks)

#### 3.1 Team Templates
- CRUD for team templates (stored in intelligence profile)
- "Deploy Team" action on projects
- Auto-spawns N agent loops per team role
- Each agent gets role-specific system prompt + capability constraints

#### 3.2 Role-Aware Agent Loop
Extend `AgentLoopService.runLoop()`:
- Accept `role` parameter that injects role-specific system prompt
- Lead: decompose goals → create tasks → assign to team
- Worker: query for unassigned tasks matching capabilities → execute → update
- Synthesizer: monitor for completed experiments → generate synthesis pages
- Reviewer: pick up `in_review` tasks → evaluate → approve or return

#### 3.3 Task Claiming
- Agent self-assigns unassigned tasks matching their role/capabilities
- Moves to `in_progress` atomically (prevent double-claim)
- Updates kanban in real-time

#### 3.4 Concurrent Execution
- Run agent loops via BullMQ jobs (already have queue infrastructure)
- One job per agent per scheduled interval
- Shared state via kanban + knowledge graph (no custom message bus)

---

### Phase 4: Pattern Detection (~1 week)

#### 4.1 Scheduled Graph Analysis
BullMQ job running on configurable interval:
- **Convergence:** 3+ experiments with VALIDATES edges → same hypothesis
- **Contradiction:** CONTRADICTS edges between experiments/hypotheses. Subtypes: `direct_theorem` (formal logical contradiction), `scope_mismatch` (different experimental conditions), `metric_disagreement` (same setup, different measurements)
- **Staleness:** Open question tasks with no activity in N days
- **Cross-domain:** Similar embeddings across different domain tags
- **Untested implications:** Validated hypothesis A EXTENDS to untested B
- **Evidence gaps:** Paper claims without experimental backing (CITES/FORMALIZES targets with < N experiments)
- **Intake gate violations:** Hypotheses promoted to `claimLabel=proved` without `intakeGateCompleted=true` + decision record
- **Reproduction failures:** Experiments with FAILS_TO_REPRODUCE edges flagged for review

#### 4.2 Evidence Quality Scoring
Automated scoring based on:
- Replication count (VALIDATES + REPRODUCES edge count)
- Ablation studies conducted
- Independent implementations (distinct research agents/teams)
- Absence of FAILS_TO_REPRODUCE edges
Score stored as `evidenceQualityScore` on hypothesis metadata.

#### 4.3 Notifications & Surfacing
- Pattern results → notification system
- Dashboard widget showing detected patterns
- PI can dismiss, prioritize, or spawn tasks from patterns

---

### Phase 5: Coding Swarms (Future)

Integrate `pty-manager` + `coding-agent-adapters` + `git-workspace-service` for agents that need to write and execute code.

- Research agent gets experiment task requiring code
- Spawn PTY session with Claude Code or Aider
- `git-workspace-service` provisions isolated worktree
- Agent writes code, runs it, captures output
- Results flow back into experiment page metadata

---

## Key Design Decisions

### 1. Kanban as Coordination Protocol
No custom agent message bus. The task board IS the shared state:
- Lead creates tasks → agents see new `todo` items
- Agent self-assigns → moves to `in_progress`
- Agent completes → moves to `in_review` or `done`
- Agent blocked → moves to `blocked`, lead re-evaluates

### 2. Pages as Knowledge Substrate
Research artifacts are pages with typed metadata, not separate tables:
- Leverage existing page infrastructure (history, search, permissions, collaboration)
- Same editor, same API, same permissions model
- Metadata adds structure without changing the page paradigm
- Graph edges connect pages into a knowledge graph

### 3. Configuration Over Code
Intelligence profiles are workspace settings JSON, not hardcoded logic:
- Page types, edge types, team templates, pattern rules — all configuration
- First profile is "Research" — future profiles (Engineering, Product) are just new configs
- Core engine is generic: typed pages + graph + context assembly + multi-agent

### 4. Incremental Adoption
Each phase delivers standalone value:
- Phase 1: Typed pages + graph + context queries (useful even without agents)
- Phase 2: Research MCP tools + dashboard (useful with single agent)
- Phase 3: Multi-agent teams (full swarm capability)
- Phase 4: Passive intelligence (system gets smarter automatically)

### 5. Strict Ontology Governance
Prevent ontology drift from day one:
- **Claim labels are required** on hypotheses — no unclassified claims allowed
- **Intake gate** enforced: no promotion to `proved` without checklist completion + decision record
- **Contradiction subtypes** are typed: `direct_theorem`, `scope_mismatch`, `metric_disagreement` — forces precise classification
- **Reproducibility fields** required on experiments: exact command, seed policy, config hash, artifact paths/checksums
- **Evidence quality scores** computed automatically from replication count, ablations, and independent implementations
- **Schema validation at creation time** — page metadata validated against the intelligence profile's `metadataSchema` definitions
- Pattern detection flags violations automatically (intake gate, evidence gaps, reproduction failures)

---

## File Structure (New)

```
apps/server/src/
  core/
    research-graph/
      research-graph.service.ts      # Memgraph operations for typed pages/edges
      research-graph.module.ts
      research-graph.controller.ts
      dto/
        create-relationship.dto.ts
        query-graph.dto.ts
    context-assembly/
      context-assembly.service.ts    # "What do we know about X?"
      context-assembly.module.ts
      types.ts                       # ContextBundle, TypedPage, etc.
  integrations/
    mcp/
      handlers/
        hypothesis.handler.ts        # hypothesis.create, hypothesis.update
        experiment.handler.ts        # experiment.register, experiment.complete
        context.handler.ts           # context.query
        relationship.handler.ts      # relationship.create
  database/
    migrations/
      YYYYMMDDTHHMMSS-page-type-metadata.ts  # Phase 1 migration
```

---

## References

- **UX Design Doc:** Research Intelligence System UX Design Document (Parzival + Claude)
- **Parallax Integration:** `docs/ParallaxIntegration.md`
- **Agent Runtime:** `apps/docs/docs/guides/agent-runtime.md`
- **Memgraph Refactor:** `docs/memgraph-vector-search-refactor.md`
