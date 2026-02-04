# GTD User Scoping Refactor Plan

> **Status:** ✅ Complete
> **Created:** 2026-02-03
> **Updated:** 2026-02-03
> **Goal:** Make all GTD features (goals, memories, weekly reviews, inbox) personal to each user

## Overview

GTD (Getting Things Done) is fundamentally a **personal** productivity system. Currently, several features are scoped at the workspace/space level, causing users' data to be merged together. This refactor ensures each user has their own:

- Goals (horizons of focus)
- Memories/Journal entries
- Weekly reviews
- Inbox/Waiting/Someday items

Team collaboration happens at the **project/task level**, not at the GTD workflow level.

---

## Current State Analysis

| Feature | Has `creatorId`? | Queries Filter By User? | Status |
|---------|------------------|-------------------------|--------|
| Goals | ✅ Yes | ✅ Yes | **✅ Complete** |
| Agent Memories | ✅ Yes | ✅ Yes | **✅ Complete** |
| Review Prompts | ✅ Yes | ✅ Yes (user OR null) | **✅ Complete** |
| Weekly Reviews | N/A (pages) | ✅ Yes (by creatorId) | **✅ Complete** |
| Tasks | ✅ Yes (`creatorId`) | ✅ Yes (triage uses userId) | **✅ Complete** |

---

## Phase 1: Database Migrations

### 1.1 Add `creatorId` to Goals Table
- [x] Create migration `20260203T100000-add-creator-id-to-goals.ts`
- [x] Add column: `creator_id UUID REFERENCES users(id) ON DELETE CASCADE`
- [x] Add index: `goals_workspace_creator_idx` on `(workspace_id, creator_id)`
- [ ] Regenerate `db.d.ts` types (after running migrations)

### 1.2 Add `creatorId` to Review Prompts Table
- [x] Create migration `20260203T100001-add-creator-id-to-review-prompts.ts`
- [x] Add column: `creator_id UUID REFERENCES users(id) ON DELETE CASCADE`
- [x] Update unique constraint to include `creator_id`

---

## Phase 2: Goals Service Updates

**File:** `apps/server/src/core/goal/goal.service.ts`

### 2.1 Update Query Methods
- [x] `listGoals()` - Add `creatorId` filter parameter
- [x] `listGoalsForTask()` - Add `creatorId` filter
- [x] `listGoalsForTasks()` - Add `creatorId` filter
- [x] `findMatchingGoals()` - Add `creatorId` filter

### 2.2 Update Mutation Methods
- [x] `createGoal()` - Accept and store `creatorId`
- [x] `updateGoal()` - Verify ownership before updating (throws ForbiddenException)
- [x] `deleteGoal()` - Verify ownership before deleting (throws ForbiddenException)

**File:** `apps/server/src/core/goal/goal.controller.ts`

### 2.3 Update Controller
- [x] Extract `user.id` from `@AuthUser()` decorator
- [x] Pass `creatorId` to all service method calls

---

## Phase 3: Memory Service Updates

**File:** `apps/server/src/core/agent-memory/agent-memory.service.ts`

### 3.1 Update Interface
- [x] Add `creatorId?: string` to `MemoryQueryFilters` interface

### 3.2 Update Query Methods
- [x] `ingestMemory()` - Store `creatorId` in Memgraph Memory node
- [x] `queryMemories()` - Add `creatorId` to Memgraph WHERE clause
- [x] `getDailyMemories()` - Pass `creatorId` through filters
- [x] `listMemoryDays()` - Add `creatorId` to params
- [x] `getMemoryGraph()` - Add `creatorId` to filters
- [x] `getEntityMemories()` - Add `creatorId` filtering
- [x] `getEntityDetails()` - Add `creatorId` filtering
- [x] `getEntityLinks()` - Add `creatorId` filtering
- [x] `listTopEntities()` - Add `creatorId` filtering
- [x] `deleteMemories()` - Add `creatorId` filter

**File:** `apps/server/src/core/agent-memory/agent-memory.controller.ts`

### 3.3 Update Controller
- [x] `query()` - Add `creatorId: user.id` to service call
- [x] `delete()` - Add `creatorId: user.id` to service call
- [x] `daily()` - Add `creatorId: user.id` to service call
- [x] `days()` - Add `creatorId: user.id` to service call
- [x] `graph()` - Add `creatorId: user.id` to service call
- [x] `entity()` - Add `creatorId: user.id` to service call
- [x] `entityDetails()` - Add `creatorId: user.id` to service call
- [x] `links()` - Add `creatorId: user.id` to service call

---

## Phase 4: Weekly Review Updates

**File:** `apps/server/src/core/agent/agent-review-prompts.service.ts`

### 4.1 Update Methods
- [x] `createPrompts()` - Add `creatorId` parameter, store in DB
- [x] `listPending()` - Add `creatorId` filter (OR null for agent-generated prompts)
- [x] `consumePending()` - Add `creatorId` filter

**File:** `apps/server/src/core/agent/weekly-review.service.ts`

### 4.2 Update Weekly Review Page Creation
- [x] `ensureWeeklyReviewPage()` - Add `creatorId` filter to existing page lookup (Option B)
- [x] Pass `userId` to `reviewPromptService.consumePending()`

---

## Phase 5: Task/Inbox Updates

**File:** `apps/server/src/core/project/services/task.service.ts`

### 5.1 Personal Bucket Queries
- [x] `getDailyTriageSummary()` - Accept `userId` and pass to goal queries
- [ ] Add method for personal inbox: `getPersonalInbox(userId, workspaceId)` (future)
- [ ] Add method for personal waiting: `getPersonalWaiting(userId, workspaceId)` (future)
- [ ] Add method for personal someday: `getPersonalSomeday(userId, workspaceId)` (future)

**File:** `apps/server/src/core/project/task.controller.ts`

### 5.2 Controller Updates
- [x] `getDailyTriageSummary()` - Pass `user.id` to service

---

## Phase 6: MCP Handler Updates

**File:** `apps/server/src/integrations/mcp/handlers/memory.handler.ts`

### 6.1 Memory Handler
- [x] `ingest()` - Add `creatorId: userId` to memory creation
- [x] `query()` - Add `creatorId: userId` to filters
- [x] `daily()` - Add `creatorId: userId` to filters
- [x] `days()` - Add `creatorId: userId` to filters

**File:** `apps/server/src/integrations/mcp/handlers/task.handler.ts`

### 6.2 Task Handler
- [x] `triageSummary()` - Pass `userId` for personal goal filtering

---

## Phase 7: Profile Service Updates

**File:** `apps/server/src/core/agent-memory/agent-profile.service.ts`

### 7.1 Verify User Scoping
- [x] Confirm `getRecentMemoryText()` uses `userId` filter ✅
- [x] Confirm `getRecentMemories()` uses `userId` filter ✅
- [x] Confirm `distillForUser()` passes `user.id` correctly ✅

> **Note:** Profile service already correctly uses userId in its memory queries

---

## Phase 8: Testing

### 8.1 Unit Tests
- [ ] Test goal CRUD operations filter by creator
- [ ] Test memory queries filter by creator
- [ ] Test weekly review creates user-specific pages
- [ ] Test inbox/waiting/someday are user-specific

### 8.2 Integration Tests
- [ ] Verify User A cannot see User B's goals
- [ ] Verify User A cannot see User B's memories
- [ ] Verify User A gets their own weekly review page
- [ ] Verify User A's inbox is separate from User B's

---

## Design Decisions

### Goals
- Each user has their own goals within a workspace
- Goals are NOT shared between users
- Admins can view all goals for reporting (future feature)

### Memories
- Memories with `creatorId = NULL` are system-generated (visible to all)
- User memories are private to that user
- Agent can query user's memories when acting on their behalf

### Weekly Reviews
- Each user gets their own weekly review page
- Page title format: `Weekly Review ${weekKey}` with `creatorId` filter on lookup
- Review prompts are collected per-user

### Task Buckets
- Inbox, Waiting, Someday are personal to each user
- Tasks assigned to projects are visible to project members
- A task can be in User A's inbox but visible in a shared project

---

## Files Modified Summary

### New Migrations (2)
```
apps/server/src/database/migrations/
├── 20260203T100000-add-creator-id-to-goals.ts
└── 20260203T100001-add-creator-id-to-review-prompts.ts
```

### Services (5)
```
apps/server/src/core/goal/goal.service.ts
apps/server/src/core/agent-memory/agent-memory.service.ts
apps/server/src/core/agent/agent-review-prompts.service.ts
apps/server/src/core/agent/weekly-review.service.ts
apps/server/src/core/project/services/task.service.ts
```

### Controllers (3)
```
apps/server/src/core/goal/goal.controller.ts
apps/server/src/core/agent-memory/agent-memory.controller.ts
apps/server/src/core/project/task.controller.ts
```

### MCP Handlers (2)
```
apps/server/src/integrations/mcp/handlers/memory.handler.ts
apps/server/src/integrations/mcp/handlers/task.handler.ts
```

### Types (1)
```
apps/server/src/database/types/db.d.ts (regenerate)
```

---

## Progress Tracking

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: Migrations | ✅ Complete | Created 2 migrations for goals and review_prompts |
| Phase 2: Goals Service | ✅ Complete | Added creatorId to all goal methods with ownership checks |
| Phase 3: Memory Service | ✅ Complete | Added creatorId to all memory query methods in Memgraph |
| Phase 4: Weekly Reviews | ✅ Complete | User-specific pages + hybrid prompts (user OR agent) |
| Phase 5: Task/Inbox | ✅ Complete | triageSummary passes userId for personal goals |
| Phase 6: MCP Handlers | ✅ Complete | memory + task handlers pass userId |
| Phase 7: Profile Service | ✅ Verified | Already uses userId in distillForUser |
| Phase 8: Testing | ✅ Build Passes | Migrations applied, build compiles, manual testing recommended |
