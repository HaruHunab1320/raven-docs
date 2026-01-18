# Repo Review (Current State)

This document is the canonical, up-to-date overview of the Raven Docs repo
before release. It describes the current system architecture, feature areas,
and the documentation cleanup recommended for a v1 publish.

## Executive Summary

Raven Docs is a monorepo with a NestJS backend, a React + Vite frontend, and
shared packages. The core systems (auth, spaces, pages, projects, tasks, GTD,
agent/memory, MCP Standard) are implemented and wired. The primary remaining
work is polish: runtime validation, performance gating, and doc consolidation.

## Architecture Overview

### Apps and Packages

- `apps/server`: NestJS backend with REST APIs, MCP Standard, WebSockets.
- `apps/client`: React frontend with editor, GTD, project/task UI, agent UI.
- `packages/editor-ext`: Tiptap extensions and markdown utilities.
- `packages/ee`: Enterprise modules (optional).

### Data Stores

- Postgres: system of record for pages, tasks, projects, memories.
- Redis: caching, approvals context, async jobs, MCP context service.
- Memgraph: memory graph + embeddings, entity relationships.
- Object storage: attachments (local or S3-compatible).

## Backend Systems (NestJS)

### Core Modules

- Auth + Users: login, setup, reset, workspace membership.
- Workspace + Spaces: workspace settings, space CRUD, member roles (CASL).
- Pages + Comments: editor content, history, comments, attachments.
- Projects + Tasks: tasks, projects, labels, buckets, triage.
- Goals: keyword-based matching and goal CRUD.
- Search: REST search + suggestions.

### Agent + Memory

- Agent loop: autonomous actions, policy gating, approvals.
- Planner cascade: multi-horizon plans (daily/short/mid/long).
- Review prompts: pending plan review prompts for approval flows.
- Agent memory: ingest/query/daily/graph; persisted in Postgres + Memgraph.

### Integrations

- MCP Standard (`/api/mcp-standard/*`) endpoints.
- WebSocket gateway for MCP events + presence.
- AI integration (Gemini generation + embeddings).
- Storage abstraction (local, S3).
- Mail (SMTP / Postmark).
- Queue, telemetry, security, health.

## Frontend Systems (React)

### Core UI

- Authentication flows and workspace setup.
- Spaces and sidebar navigation.
- Editor (Tiptap) with diagrams, history, attachments.
- Projects: dashboards, kanban board, task drawers, metrics.
- GTD: Inbox, Today, Triage, Waiting, Someday, Weekly Review, Daily Notes.

### Agent UI

- Agent chat drawer with approvals and context chips.
- Memory Insights: graphs, history, user profile, and planning cascade view.
- Autonomy settings and approval controls.

## Realtime + Collaboration

- Hocuspocus/Yjs for collaborative editing.
- MCP events broadcast to the client for UI updates.

## Current State Highlights

- MCP Standard is the canonical external integration.
- MCP permission guard aligns role tiers with CASL abilities (scope QA pending).
- Agent memory and insights are live and visible.
- Planner cascade and plan approvals are implemented.
- Project/task dashboards and GTD flows are in place.
- Page task list sync uses stable pageTaskId values with legacy title fallback.

## Release Polish Checklist

1) Runtime validation of core flows (auth, editor, tasks, projects, GTD).
2) Performance audit of WebSocket event logging (gate behind dev flag).
3) Confirm approval flows for agent actions and MCP tools.
4) Ensure deployment docs match current Docker + env setup.
5) Consolidate docs and delete deprecated/duplicate files.

## Documentation Cleanup (Proposed Deletions)

These files are deprecated or duplicative and should be removed once the
references are updated:

- `docs/MCPIntegration.md` (deprecated)
- `docs/MCPStandardIntegration.md` (deprecated)
- `docs/MCP_INTEGRATION_SUMMARY.md` (deprecated)
- `docs/MCP_ARCHITECTURE_REFACTOR.md` (deprecated)
- `docs/MCP-README.md` (deprecated)
- `docs/UIAudit_Runbook.md` (duplicate of checklist)
- `docs/UIAudit_Checklist.md` (duplicate of route checks)
- `docs/UIAudit_RouteChecks.md` (duplicate of UI audit matrix)
- `docs/UIAudit.md` (superseded by new release checklists)
- `CodebaseReview.md` (outdated; superseded by this doc)
- `DEPLOYMENT_STATUS.md` (outdated)

Optional consolidation candidates (merge into `docs/MCP.md` or this doc):

- `APIKeySystem.md`
- `docs/MCP_COVERAGE.md`
- `docs/MCPEvents.md`
- `docs/MCP_TEST_DATA_README.md`

## Primary Docs to Keep

- `README.md`
- `docs/ArchitectureOverview.md`
- `docs/SystemStatus.md`
- `docs/MCP.md`
- `docs/EngineeringStandards.md`
- `docs/Workflows.md`
- `docs/AutonomyQuickstart.md`
- `docs/SystemRisks.md`
- `docs/TestingMatrix.md`
- `docs/ManualTest_Runbook.md`
- `docs/AgentMemoryArchitecture.md`
- `docs/ProjectManagement.md`
- `docs/Agentic_Roadmap.md`
- `docs/ProductVision.md`
- `docs/SlackIntegration.md`

## Notes on v1 Readiness

The system is close to v1. The remaining work is focused on:

- running the manual test runbook and updating pass/fail states,
- validating agent planning/approval flows end-to-end,
- cleaning up doc drift and build warnings,
- confirming deployment environment settings.
