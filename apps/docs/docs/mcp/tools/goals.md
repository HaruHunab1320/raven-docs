---
title: Goals
sidebar_position: 6
---

# Goals Tools

Tools for managing goals across different time horizons.

:::info Personal Goals
Goals are **personal to each user**. All goal operations are automatically scoped to the authenticated user—you can only view, create, update, and delete your own goals. This allows agents to help manage your personal objectives without exposing them to others in your workspace.
:::

## Available Tools

### goals_list

List goals in a workspace.

```json
{
  "name": "goals_list",
  "arguments": {
    "workspace_id": "ws_123",
    "space_id": "space_456",        // optional
    "horizon": "mid",               // optional: short, mid, long
    "include_tasks": true           // optional
  }
}
```

**Response:**

```json
{
  "goals": [
    {
      "id": "goal_789",
      "title": "Launch API v2.0",
      "description": "Complete API redesign with new endpoints",
      "horizon": "mid",
      "keywords": ["api", "release"],
      "taskCount": 8,
      "completedTaskCount": 5,
      "progress": 62.5,
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

### goals_create

Create a new goal.

```json
{
  "name": "goals_create",
  "arguments": {
    "workspace_id": "ws_123",
    "space_id": "space_456",
    "title": "Launch API v2.0",
    "description": "Complete API redesign with new endpoints",
    "horizon": "mid",
    "keywords": ["api", "release"]
  }
}
```

**Response:**

```json
{
  "goal": {
    "id": "goal_789",
    "title": "Launch API v2.0",
    "description": "Complete API redesign with new endpoints",
    "horizon": "mid",
    "keywords": ["api", "release"],
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

### goals_get

Get details of a specific goal.

```json
{
  "name": "goals_get",
  "arguments": {
    "workspace_id": "ws_123",
    "goal_id": "goal_789",
    "include_tasks": true
  }
}
```

**Response:**

```json
{
  "goal": {
    "id": "goal_789",
    "title": "Launch API v2.0",
    "description": "Complete API redesign with new endpoints",
    "horizon": "mid",
    "keywords": ["api", "release"],
    "tasks": [
      {
        "id": "task_001",
        "title": "Implement OAuth",
        "status": "done"
      },
      {
        "id": "task_002",
        "title": "Add rate limiting",
        "status": "in_progress"
      }
    ],
    "progress": 62.5
  }
}
```

### goals_update

Update an existing goal.

```json
{
  "name": "goals_update",
  "arguments": {
    "workspace_id": "ws_123",
    "goal_id": "goal_789",
    "title": "Launch API v2.0 Beta",
    "description": "Updated description",
    "horizon": "short",
    "keywords": ["api", "beta"]
  }
}
```

### goals_delete

Delete a goal.

```json
{
  "name": "goals_delete",
  "arguments": {
    "workspace_id": "ws_123",
    "goal_id": "goal_789"
  }
}
```

### goals_link_task

Link a task to a goal.

```json
{
  "name": "goals_link_task",
  "arguments": {
    "workspace_id": "ws_123",
    "goal_id": "goal_789",
    "task_id": "task_001"
  }
}
```

### goals_unlink_task

Remove a task from a goal.

```json
{
  "name": "goals_unlink_task",
  "arguments": {
    "workspace_id": "ws_123",
    "goal_id": "goal_789",
    "task_id": "task_001"
  }
}
```

## Goal Horizons

| Horizon | Typical Timeframe | Use Case |
|---------|-------------------|----------|
| `short` | Weeks | Sprint goals, weekly objectives |
| `mid` | Months/Quarter | Project milestones, quarterly goals |
| `long` | Year+ | Strategic initiatives, vision |

## Example: Project Planning

```typescript
// Create a long-term goal
const longGoal = await mcp.call("goals_create", {
  workspace_id: "ws_123",
  space_id: "space_456",
  title: "Become market leader in AI docs",
  horizon: "long",
  keywords: ["strategy", "growth"]
});

// Create supporting mid-term goal
const midGoal = await mcp.call("goals_create", {
  workspace_id: "ws_123",
  space_id: "space_456",
  title: "Launch enterprise features",
  horizon: "mid",
  keywords: ["enterprise", "features"]
});

// Link tasks to goal
await mcp.call("goals_link_task", {
  workspace_id: "ws_123",
  goal_id: midGoal.goal.id,
  task_id: "task_sso"
});

// Check progress
const progress = await mcp.call("goals_get", {
  workspace_id: "ws_123",
  goal_id: midGoal.goal.id,
  include_tasks: true
});
```

## Related

- [Tasks Tools](/mcp/tools/tasks) - Task management
- [Goals Concept](/concepts/goals) - Goals overview
