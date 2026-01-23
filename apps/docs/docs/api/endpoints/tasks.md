---
title: Tasks
sidebar_position: 4
---

# Tasks API

Create and manage tasks.

## List Tasks

<span className="api-method api-method--get">GET</span> `/v1/tasks`

Returns tasks with optional filters.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspaceId` | string | Yes | Workspace ID |
| `spaceId` | string | No | Filter by space |
| `projectId` | string | No | Filter by project |
| `assigneeId` | string | No | Filter by assignee |
| `status` | string | No | Filter by status |
| `priority` | string | No | Filter by priority |

### Example Request

```bash
curl "https://api.ravendocs.com/v1/tasks?workspaceId=ws_123&status=todo" \
  -H "Authorization: Bearer $API_KEY"
```

### Example Response

```json
{
  "data": [
    {
      "id": "task_abc123",
      "title": "Update API documentation",
      "description": "Add examples for new endpoints",
      "status": "todo",
      "priority": "high",
      "assigneeId": "user_456",
      "projectId": "proj_789",
      "dueDate": "2025-02-01",
      "createdAt": "2025-01-15T10:00:00Z",
      "createdBy": "user_123"
    }
  ]
}
```

---

## Get Task

<span className="api-method api-method--get">GET</span> `/v1/tasks/:taskId`

Returns a single task.

### Example Response

```json
{
  "data": {
    "id": "task_abc123",
    "title": "Update API documentation",
    "description": "Add examples for all new endpoints including:\n- Pages API\n- Tasks API\n- Search API",
    "status": "in_progress",
    "priority": "high",
    "assignee": {
      "id": "user_456",
      "name": "Jane Smith",
      "avatarUrl": "https://..."
    },
    "project": {
      "id": "proj_789",
      "name": "Q1 Documentation"
    },
    "labels": ["documentation", "api"],
    "dueDate": "2025-02-01",
    "completedAt": null,
    "createdAt": "2025-01-15T10:00:00Z",
    "updatedAt": "2025-01-20T14:00:00Z",
    "createdBy": "user_123"
  }
}
```

---

## Create Task

<span className="api-method api-method--post">POST</span> `/v1/tasks`

Creates a new task.

### Body Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspaceId` | string | Yes | Workspace ID |
| `title` | string | Yes | Task title |
| `description` | string | No | Task description (markdown) |
| `assigneeId` | string | No | Assignee user ID |
| `projectId` | string | No | Project ID |
| `spaceId` | string | No | Space ID |
| `dueDate` | string | No | Due date (ISO 8601) |
| `priority` | string | No | `high`, `medium`, `low` |
| `labels` | string[] | No | Label names |

### Example Request

```bash
curl -X POST "https://api.ravendocs.com/v1/tasks" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "workspaceId": "ws_123",
    "title": "Review security documentation",
    "description": "Review and update the security best practices guide",
    "assigneeId": "user_456",
    "priority": "high",
    "dueDate": "2025-02-15"
  }'
```

---

## Update Task

<span className="api-method api-method--put">PUT</span> `/v1/tasks/:taskId`

Updates an existing task.

### Body Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspaceId` | string | Yes | Workspace ID |
| `title` | string | No | New title |
| `description` | string | No | New description |
| `status` | string | No | `todo`, `in_progress`, `done` |
| `assigneeId` | string | No | New assignee |
| `priority` | string | No | New priority |
| `dueDate` | string | No | New due date |
| `bucket` | string | No | Triage bucket |

### Example Request

```bash
curl -X PUT "https://api.ravendocs.com/v1/tasks/task_abc123" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "workspaceId": "ws_123",
    "status": "in_progress"
  }'
```

---

## Complete Task

<span className="api-method api-method--post">POST</span> `/v1/tasks/:taskId/complete`

Marks a task as complete.

### Body Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspaceId` | string | Yes | Workspace ID |

### Example Request

```bash
curl -X POST "https://api.ravendocs.com/v1/tasks/task_abc123/complete" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "workspaceId": "ws_123" }'
```

---

## Assign Task

<span className="api-method api-method--post">POST</span> `/v1/tasks/:taskId/assign`

Assigns a task to a user.

### Body Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspaceId` | string | Yes | Workspace ID |
| `assigneeId` | string | Yes | User ID to assign |

---

## Delete Task

<span className="api-method api-method--delete">DELETE</span> `/v1/tasks/:taskId`

Deletes a task.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `taskId` | string | Yes | Task ID |
| `workspaceId` | query | Yes | Workspace ID |

---

## Triage Summary

<span className="api-method api-method--get">GET</span> `/v1/tasks/triage-summary`

Returns task counts by triage bucket.

### Example Response

```json
{
  "data": {
    "now": 5,
    "next": 12,
    "later": 28,
    "none": 8
  }
}
```
