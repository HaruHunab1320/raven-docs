# Project Management System

This document describes the current Raven Docs project and task system,
including what is implemented, how it maps to UI, and what remains.

## Current State

### Projects (Core)
- Projects are persisted in Postgres (`projects` table) and scoped to spaces.
- Project CRUD is exposed via REST and MCP Standard.
- Project home pages can be created via `project.createPage`.

### Tasks (Core)
- Tasks are persisted in Postgres (`tasks` table).
- Tasks support status, priority, bucket, due dates, assignees, and project
  association.
- Task CRUD + assignment + completion are exposed via REST and MCP Standard.

### UI Surfaces
- Project dashboard + metrics
- Kanban board and list views
- Task drawer with assignment, status, due dates, and bucket controls
- Task cards and quick create modals

## Feature Coverage

### Implemented
- Project CRUD + archive
- Task CRUD + assignment + completion
- Task board views (columns, swimlanes, timeline)
- Project dashboards + metrics
- MCP exposure for projects/tasks + triage summary
- Document task list extraction uses stable pageTaskId values with legacy
  title fallback; validate legacy behavior in QA.

### In Progress / Gaps
- Task label CRUD UI is implemented; needs runtime validation pass.
- Task mentions inside pages are not yet first-class.

## Data Model Notes

- Projects and tasks are stored as first-class entities.
- Goal matching uses keyword-based rules and can be used in triage summaries.
- Task buckets map to GTD flows (Inbox/Waiting/Someday).

## MCP Integration

Projects and tasks are exposed via MCP Standard:
- Projects: `project_list`, `project_get`, `project_create`, `project_update`, `project_archive`, `project_delete`
- Tasks: `task_list`, `task_get`, `task_create`, `task_update`, `task_delete`,
  `task_complete`, `task_assign`, `task_move_to_project`, `task_triage_summary`

Approvals are required for sensitive methods based on policy rules.
