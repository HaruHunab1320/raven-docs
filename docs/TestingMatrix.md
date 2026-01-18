# Testing Matrix

This matrix maps critical workflows to API endpoints and MCP tools.

## Auth + Workspace

- **Setup workspace**
  - REST: `POST /api/auth/setup`
  - MCP Standard: `workspace_update`, `space_create`

- **Login**
  - REST: `POST /api/auth/login`
  - MCP: N/A (session auth)

## Capture + Triage

- **Create task (Inbox)**
  - REST: `POST /api/tasks/create`
  - MCP Standard: `task_create`

- **Move to Waiting/Someday**
  - REST: `POST /api/tasks/update`
  - MCP Standard: `task_update`

- **Triage summary**
  - REST: `POST /api/tasks/triageSummary`
  - MCP Standard: `task_triage_summary`

## Projects + Tasks

- **Create project**
  - REST: `POST /api/projects/create`
  - MCP Standard: `project_create`

- **Create project task**
  - REST: `POST /api/tasks/create`
  - MCP Standard: `task_create`

- **Move task between projects**
  - REST: `POST /api/tasks/moveToProject`
  - MCP Standard: `task_move_to_project`

- **Assign task**
  - REST: `POST /api/tasks/assign`
  - MCP Standard: `task_assign`

- **Complete task**
  - REST: `POST /api/tasks/complete`
  - MCP Standard: `task_complete`

- **Bucket set/clear**
  - REST: `POST /api/tasks/update`
  - MCP Standard: `task_bucket_set`, `task_bucket_clear`

- **Label CRUD**
  - REST: `POST /api/tasks/labels/list|create|update|delete`
  - MCP Standard: N/A

- **Label assign/remove**
  - REST: `POST /api/tasks/labels/assign|remove`
  - MCP Standard: N/A

## Pages + Editor

- **Create page**
  - REST: `POST /api/pages/create`
  - MCP Standard: `page_create`

- **Update page**
  - REST: `POST /api/pages/update`
  - MCP Standard: `page_update`

- **Delete page**
  - REST: `POST /api/pages/delete`
  - MCP Standard: `page_delete`

- **Move page**
  - REST: `POST /api/pages/move`
  - MCP Standard: `page_move`

- **Page history**
  - REST: `POST /api/pages/history`
  - MCP Standard: `page_get_history`

## Comments

- **Create comment**
  - REST: `POST /api/comments/create`
  - MCP Standard: `comment_create`

- **Resolve comment**
  - REST: `POST /api/comments/resolve`
  - MCP Standard: `comment_resolve`

## Attachments

- **Upload file**
  - REST: `POST /api/files/upload`
  - MCP Standard: `attachment_upload`

- **Delete attachment**
  - REST: `POST /api/attachments/delete`
  - MCP Standard: `attachment_delete`

- **Download attachment**
  - REST: `GET /api/files/:fileId/:fileName`
  - MCP Standard: `attachment_download`

## Search

- **Search**
  - REST: `POST /api/search`
  - MCP Standard: `search_query`

- **Suggest**
  - REST: `POST /api/search/suggest`
  - MCP Standard: `search_suggest`

## Agent + Autonomy

- **Run loop**
  - REST: `POST /api/agent/loop/run`
  - MCP Standard: N/A (REST only)

- **Approvals list**
  - REST: `POST /api/approvals/list`
  - MCP Standard: N/A (REST only)

- **Approve action**
  - REST: `POST /api/approvals/confirm`
  - MCP Standard: `approval_confirm`

## Memory + Insights

- **Ingest memory**
  - REST: `POST /api/memory/ingest`
  - MCP Standard: `memory_ingest`

- **Query memory**
  - REST: `POST /api/memory/query`
  - MCP Standard: `memory_query`

- **Daily memory**
  - REST: `POST /api/memory/daily`
  - MCP Standard: `memory_daily`

## MCP Standard

- **List tools**
  - REST: `POST /api/mcp-standard/list_tools`

- **Call tool**
  - REST: `POST /api/mcp-standard/call_tool`
