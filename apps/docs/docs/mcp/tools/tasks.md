---
title: Task Tools
sidebar_position: 4
---

# Task Tools

Tools for managing tasks and projects.

## task_list

List tasks with filters.

```json
{
  "name": "task_list",
  "arguments": {
    "workspaceId": "ws_123",
    "status": "todo",
    "assigneeId": "user_456",
    "limit": 20
  }
}
```

## task_get

Get task details.

```json
{
  "name": "task_get",
  "arguments": {
    "taskId": "task_789",
    "workspaceId": "ws_123"
  }
}
```

## task_create

Create a new task.

```json
{
  "name": "task_create",
  "arguments": {
    "workspaceId": "ws_123",
    "title": "Update documentation",
    "description": "Add examples for new API endpoints",
    "assigneeId": "user_456",
    "priority": "high",
    "dueDate": "2025-02-01"
  }
}
```

## task_update

Update a task.

```json
{
  "name": "task_update",
  "arguments": {
    "taskId": "task_789",
    "workspaceId": "ws_123",
    "status": "in_progress",
    "priority": "medium"
  }
}
```

## task_delete

Delete a task.

```json
{
  "name": "task_delete",
  "arguments": {
    "taskId": "task_789",
    "workspaceId": "ws_123"
  }
}
```

## task_complete

Mark task as complete.

```json
{
  "name": "task_complete",
  "arguments": {
    "taskId": "task_789",
    "workspaceId": "ws_123"
  }
}
```

## task_assign

Assign task to a user.

```json
{
  "name": "task_assign",
  "arguments": {
    "taskId": "task_789",
    "workspaceId": "ws_123",
    "assigneeId": "user_456"
  }
}
```

## task_move_to_project

Move task to a project.

```json
{
  "name": "task_move_to_project",
  "arguments": {
    "taskId": "task_789",
    "workspaceId": "ws_123",
    "projectId": "proj_111"
  }
}
```

## task_bucket_set

Set triage bucket.

```json
{
  "name": "task_bucket_set",
  "arguments": {
    "taskId": "task_789",
    "bucket": "now"
  }
}
```

## task_bucket_clear

Clear triage bucket.

```json
{
  "name": "task_bucket_clear",
  "arguments": {
    "taskId": "task_789"
  }
}
```

## task_triage_summary

Get triage bucket counts.

```json
{
  "name": "task_triage_summary",
  "arguments": {
    "workspaceId": "ws_123"
  }
}
```

Response:

```json
{
  "now": 5,
  "next": 12,
  "later": 28,
  "none": 8
}
```

## Agent Access Control

Tasks have an `agentAccessible` field that controls whether AI agents can access them.

### Inheritance

Task agent access can be:
- **Explicitly set** - `true` or `false`
- **Inherited from project** - `null` (default)

### Access Denied

If a task has `agentAccessible: false`, agent requests will receive an error:

```json
{
  "error": {
    "code": -32003,
    "message": "This task is not accessible by agents"
  }
}
```

See [Agent Concepts](/concepts/agent#resource-level-access-control) for more details.
