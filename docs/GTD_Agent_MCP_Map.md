# Raven Docs GTD + Second Brain MCP Map

This document maps GTD / Second Brain primitives to Raven Docs data and MCP Standard tools. It also lists gaps that must be implemented before an agent can fully automate the workflow.

## Core Principles (GTD + Second Brain)

- Capture everything quickly into a single Inbox.
- Triage daily to clarify, organize, and commit.
- Keep a consistent Weekly Review ritual.
- Use projects as the unit of outcomes; tasks are the next actions.
- Maintain Waiting/Someday buckets and surface them in review.
- Keep a daily log (journal/daily note) as the living memory.

## Raven Docs Entities (Current)

- Inbox items: tasks in a space with no `projectId`.
- Projects: `projects` table with `homePageId` and task lists.
- Tasks: `tasks` table with status, priority, due date, assignee.
- GTD buckets: stored on tasks (`bucket` enum), with legacy localStorage
  migrations supported for older data.
- Daily notes: created as pages with date titles.
- Weekly review: helper creates a page with a checklist template.

## MCP Standard (Current Public Surface)

Exposed tool categories (from docs):
- Spaces (list/create/update/delete)
- Pages (list/create/update/delete/move)
- Comments (create/list/update/delete)
- Attachments (upload/list/get/download/delete)
- Projects + Tasks (project/task CRUD, triage summary)
- Users, Groups, Workspaces
- UI navigation

## Critical Gaps (Blockers for Agentic GTD)

1) Page task list sync uses stable pageTaskId values with legacy title fallback;
   validate legacy behavior in QA.
2) Agent UX needs clearer explanations for policy/approval boundaries.

## MCP Status (Current)

### Projects + Tasks
- Project and task tools exist in MCP Standard (`project_*`, `task_*`).
- Bucket state is persisted on tasks and is MCP-accessible via `task_update`.

## Primitive → Data → Tool Mapping

| Primitive | Data Source | MCP Tool(s) | Notes |
| --- | --- | --- | --- |
| Capture Inbox item | `tasks` (no projectId) | `task_create` | Single input should create unassigned task. |
| Triage item | `tasks` + bucket | `task_update`, `task_move_to_project`, `task_bucket_set` | Needs server bucket field. |
| Waiting list | `tasks` where bucket = waiting | `task_list`, `task_update` | Server-side bucket persisted. |
| Someday list | `tasks` where bucket = someday | `task_list`, `task_update` | Server-side bucket persisted. |
| Daily Note | `pages` by date | `page_create`, `page_list`, `page_update` | Use search by title or metadata. |
| Weekly Review | `pages` template | `page_create`, `page_update` | Weekly checklist stored in page content. |
| Project overview | `projects` + `tasks` | `project_list`, `task_list` | Needs MCP for projects/tasks. |

## Agent Workflow Stages (High Level)

1) **Capture**
   - MCP `task_create` into Inbox (no projectId).
2) **Daily Triage**
   - MCP `task_list` for unassigned tasks.
   - For each task: assign project, due date, or bucket.
3) **Daily Note**
   - MCP `page_create` for today if not present.
   - Append summary of captured items and decisions.
4) **Weekly Review**
   - MCP create/open weekly review page.
   - Compile overdue tasks, stale projects, waiting/someday lists.

## Data Model Notes (Current)

- Tasks include a `bucket` enum: `inbox | waiting | someday | none`.

