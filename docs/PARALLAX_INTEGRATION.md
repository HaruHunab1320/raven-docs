# Parallax Integration — Raven Docs Remote Agent Runtime

## Status: In Progress

**Goal:** Replace local-only agent spawning with Parallax runtime orchestration so Raven Docs works fully deployed in production.

**Parallax Repo:** `/Workspaces/parallax`
**Raven Repo:** `/Workspaces/raven-docs`

---

## Required Parallax Packages (npm publish needed)

| Package | Version | Purpose | Published? |
|---------|---------|---------|------------|
| `@parallaxai/sdk-typescript` | 0.1.0 | PatternClient, ExecutionClient, RegistryServiceClient | ✅ Published |
| `@parallaxai/org-chart-compiler` | 1.0.0 | Shared OrgPattern/OrgRole types | ✅ Published & installed |
| `@parallaxai/runtime-interface` | 0.1.0 | AgentStatus, AgentLogEntry, AgentHandle, RuntimeEvent types | ✅ Published & installed |
| `@parallaxai/pattern-sdk` | 0.1.0 | `compileYamlToPrism()` YAML→Prism compiler | ✅ Published (not yet installed — blocked on `@parallax/primitives` dep) |

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│ RAVEN DOCS SERVER                                                │
│                                                                  │
│  ┌─────────────────────┐    ┌──────────────────────────────┐   │
│  │ Intelligence UI      │───▶│ TeamDeploymentService         │   │
│  │ (Launch/Deploy)      │    │ CodingSwarmService            │   │
│  └─────────────────────┘    └──────────┬───────────────────┘   │
│                                         │                        │
│                              ┌──────────▼───────────────────┐   │
│                              │ ParallaxClientService         │   │
│                              │ • OrgPattern → YAML → Prism  │   │
│                              │ • PatternClient.upload()      │   │
│                              │ • PatternClient.execute()     │   │
│                              │ • ExecutionClient.stream()    │   │
│                              └──────────┬───────────────────┘   │
│                                         │                        │
│                              ┌──────────▼───────────────────┐   │
│                              │ RuntimeConnectionService      │   │
│                              │ (WebSocket event bridge)      │   │
│                              │ Parallax → parallax.* events  │   │
│                              └──────────────────────────────┘   │
│                                                                  │
│  Existing listeners (unchanged):                                 │
│  • CodingSwarmListener → parallax.agent_ready/stopped/error     │
│  • TeamRuntimeSessionListener → parallax.* → team.* events     │
│  • WsGateway → WebSocket broadcast to UI                        │
└──────────────────────────┬───────────────────────────────────────┘
                           │ gRPC / HTTP / WebSocket
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│ PARALLAX CONTROL PLANE                                           │
│                                                                  │
│  PatternEngine ─▶ AgentRuntimeService ─▶ K8s Runtime            │
│  WorkflowExecutor ─▶ MessageRouter                              │
│                                                                  │
│  Pods: agent-claude, agent-codex, agent-gemini, agent-aider     │
│  Each pod: CLI agent + HTTP /send /stream /health endpoints     │
│  Each pod: MCP connection back to Raven via MCP_SERVER_URL      │
└──────────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 0: Foundation ✅ DONE

#### 0.1 — Add Parallax SDK dependencies ✅
**File:** `apps/server/package.json`
Added: `@parallaxai/sdk-typescript`, `@parallaxai/org-chart-compiler`, `@parallax/pattern-sdk`, `@parallax/runtime-interface`

#### 0.2 — ParallaxClientService (SDK wrapper) ✅
**File:** `apps/server/src/core/parallax-runtime/parallax-client.service.ts`
Implemented: pattern upload, execution management, agent management, health checking.

#### 0.3 — Replace org-chart type shim ✅
**File:** `apps/server/src/core/team/org-chart.types.ts`
Re-exports from `@parallaxai/org-chart-compiler` with Raven-specific `OrgRole` extension (`agentType`, `workdir`).

---

### Phase 1: OrgPattern → YAML → Prism Pipeline ✅ DONE

#### 1.1 — OrgPattern to YAML serializer ✅
**File:** `apps/server/src/core/parallax-runtime/org-pattern-serializer.ts`

#### 1.2 — Pattern upload via HTTP REST API ✅
**In:** `ParallaxClientService.uploadOrgPattern()`

#### 1.3 — Auto-register on template create/update ✅
**File:** `apps/server/src/core/team/team.controller.ts`
Best-effort registration on both create and update paths.

---

### Phase 2: Remote Single-Agent Spawning (Coding Swarm) ✅ DONE

#### 2.1 — Remote workspace preparation ✅
- `workspace-preparation.service.ts`: `prepareRemoteWorkspace()` returns context files as JSON payload
- `coding-swarm.service.ts`: branches on `isRemoteMode` — calls `prepareRemoteWorkspace()` for remote, `prepareWorkspace()` for local
- `agent-execution.service.ts`: `AgentSpawnConfig.remoteContext` passes contextFiles/repoUrl/branch to spawn request

#### 2.2 — Remote log streaming ✅
`getLogs()` calls `parallaxClient.getAgentLogs()` in remote mode.

#### 2.3 — Remote output buffer for stall classification ✅
`getOutputBufferAsync()` calls `parallaxClient.getAgentOutput()` in remote mode.
`forceClassifySession()` uses async output buffer for remote agents.

---

### Phase 3: Remote Team Deployment ✅ DONE

#### 3.1 — Team deployment via Parallax pattern execution ✅
**File:** `team-deployment.service.ts`
`triggerTeamRun()` branches: if Parallax available → uploads OrgPattern, executes pattern, stores executionId.
`teardownTeam()` cancels Parallax execution before stopping local agents.

#### 3.2 — Agent-to-Raven mapping ✅
**File:** `team-runtime-session.listener.ts`
`handleRemoteAgentStarted()` maps Parallax agent IDs to `team_agents` records by role on `parallax.agent_started` events.

#### 3.3 — Message delivery for teams
**Status:** Works via existing MCP connection. Agents use MCP tools to write back to Raven.

#### 3.4 — User takeover bridge ✅
`takeoverAgent()` pauses remote agent via `parallaxClient.pauseAgent()`.
`releaseAgent()` resumes via `parallaxClient.resumeAgent()`.

---

### Phase 4: Production Hardening

#### 4.1 — MCP connectivity from pods
Each pod needs: `MCP_SERVER_URL` and `MCP_API_KEY` env vars.
- Raven's MCP bridge must be reachable from K8s cluster
- Options: public URL, K8s Service endpoint, or ingress

#### 4.2 — Credential injection
Agent provider API keys (Anthropic, OpenAI, Google) must reach pods:
- Via K8s Secrets mounted as env vars
- Or via workspace settings passed in spawn payload

#### 4.3 — Git workspace provisioning
For coding tasks with `repoUrl`:
- Option A: Raven pre-clones, mounts as volume (slow, complex)
- Option B: Pod init container clones repo (simpler, preferred)
- Parallax `WorkspaceService` already supports this

#### 4.4 — Cleanup lifecycle
- Pod termination on teardown: `DELETE /api/agents/{id}` per agent
- MCP API key revocation: stays in Raven (already in listeners)
- Git workspace finalization: Parallax pod creates PR before terminating

---

## Environment Variables

### Existing (already used)
```bash
AGENT_RUNTIME_ENDPOINT=https://parallax-runtime.infra.com  # HTTP endpoint for spawn/send/stop
```

### New
```bash
PARALLAX_CONTROL_PLANE_URL=parallax.infra.com:50052  # gRPC endpoint for PatternClient/ExecutionClient
PARALLAX_USE_TLS=true                                  # TLS for gRPC
PARALLAX_WEBHOOK_SECRET=...                            # Already exists, for Parallax→Raven callbacks
```

---

## Key Files Modified

| File | Change |
|------|--------|
| `apps/server/package.json` | Add 4 Parallax SDK dependencies |
| `apps/server/src/core/parallax-runtime/parallax-client.service.ts` | **NEW** — SDK wrapper (pattern upload, execution, agent mgmt) |
| `apps/server/src/core/parallax-runtime/org-pattern-serializer.ts` | **NEW** — OrgPattern→YAML serializer |
| `apps/server/src/core/parallax-runtime/parallax-runtime.module.ts` | **NEW** — Global NestJS module |
| `apps/server/src/core/core.module.ts` | Import ParallaxRuntimeModule |
| `apps/server/src/core/team/org-chart.types.ts` | Pending — re-export from `@parallaxai/org-chart-compiler` |
| `apps/server/src/core/team/team-deployment.service.ts` | Remote team deployment, teardown, takeover/release |
| `apps/server/src/core/team/team.controller.ts` | Auto-register patterns on template create/update |
| `apps/server/src/core/team/team-runtime-session.listener.ts` | Map Parallax agent IDs to team_agents |
| `apps/server/src/core/coding-swarm/workspace-preparation.service.ts` | `prepareRemoteWorkspace()` for pod init payload |
| `apps/server/src/core/coding-swarm/agent-execution.service.ts` | `remoteContext` in spawn, remote logs + output buffer |
| `apps/server/src/core/coding-swarm/coding-swarm.service.ts` | Remote/local branching in `processExecution()` |

---

## Testing Strategy

1. **Phase 0-1:** Unit test OrgPattern→YAML→Prism pipeline with system templates
2. **Phase 2:** Integration test: set `AGENT_RUNTIME_ENDPOINT`, launch single agent from UI, verify MCP connection
3. **Phase 3:** Integration test: deploy Research Team template, verify 5 agents spawn, coordinator delegates, results written back
4. **Phase 4:** E2E in staging: full Intelligence Dashboard workflow with Parallax K8s runtime
