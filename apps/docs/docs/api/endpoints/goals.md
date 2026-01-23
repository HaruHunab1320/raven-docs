---
title: Goals
sidebar_position: 9
---

# Goals API

Endpoints for managing goals across different time horizons.

## List Goals

```http
GET /api/workspaces/{workspaceId}/goals
```

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `spaceId` | string | Filter by space |
| `horizon` | string | Filter by horizon: `short`, `mid`, `long` |
| `includeTasks` | boolean | Include linked tasks |
| `limit` | number | Max results (default: 50) |
| `offset` | number | Pagination offset |

### Response

```json
{
  "goals": [
    {
      "id": "goal_123",
      "title": "Launch API v2.0",
      "description": "Complete API redesign with new endpoints",
      "horizon": "mid",
      "keywords": ["api", "release"],
      "spaceId": "space_456",
      "taskCount": 8,
      "completedTaskCount": 5,
      "progress": 62.5,
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-15T10:30:00Z"
    }
  ],
  "total": 12,
  "limit": 50,
  "offset": 0
}
```

## Get Goal

```http
GET /api/workspaces/{workspaceId}/goals/{goalId}
```

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `includeTasks` | boolean | Include linked tasks with details |

### Response

```json
{
  "id": "goal_123",
  "title": "Launch API v2.0",
  "description": "Complete API redesign with new endpoints",
  "horizon": "mid",
  "keywords": ["api", "release"],
  "spaceId": "space_456",
  "tasks": [
    {
      "id": "task_001",
      "title": "Implement OAuth",
      "status": "done",
      "priority": "high"
    },
    {
      "id": "task_002",
      "title": "Add rate limiting",
      "status": "in_progress",
      "priority": "high"
    }
  ],
  "taskCount": 8,
  "completedTaskCount": 5,
  "progress": 62.5,
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-15T10:30:00Z"
}
```

## Create Goal

```http
POST /api/workspaces/{workspaceId}/goals
```

### Request Body

```json
{
  "title": "Launch API v2.0",
  "description": "Complete API redesign with new endpoints",
  "horizon": "mid",
  "keywords": ["api", "release"],
  "spaceId": "space_456"
}
```

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | Yes | Goal title |
| `description` | string | No | Detailed description |
| `horizon` | string | Yes | `short`, `mid`, or `long` |
| `keywords` | string[] | No | Tags for categorization |
| `spaceId` | string | No | Associated space |

### Response

```json
{
  "id": "goal_123",
  "title": "Launch API v2.0",
  "description": "Complete API redesign with new endpoints",
  "horizon": "mid",
  "keywords": ["api", "release"],
  "spaceId": "space_456",
  "taskCount": 0,
  "completedTaskCount": 0,
  "progress": 0,
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T10:30:00Z"
}
```

## Update Goal

```http
PATCH /api/workspaces/{workspaceId}/goals/{goalId}
```

### Request Body

```json
{
  "title": "Launch API v2.0 Beta",
  "description": "Updated description",
  "horizon": "short",
  "keywords": ["api", "beta"]
}
```

All fields are optional. Only provided fields are updated.

### Response

Returns the updated goal object.

## Delete Goal

```http
DELETE /api/workspaces/{workspaceId}/goals/{goalId}
```

### Response

```json
{
  "success": true
}
```

Note: Deleting a goal does not delete linked tasks.

## Link Task to Goal

```http
POST /api/workspaces/{workspaceId}/goals/{goalId}/tasks
```

### Request Body

```json
{
  "taskId": "task_001"
}
```

### Response

```json
{
  "success": true,
  "goal": {
    "id": "goal_123",
    "taskCount": 9
  }
}
```

## Unlink Task from Goal

```http
DELETE /api/workspaces/{workspaceId}/goals/{goalId}/tasks/{taskId}
```

### Response

```json
{
  "success": true,
  "goal": {
    "id": "goal_123",
    "taskCount": 8
  }
}
```

## Goal Horizons

| Horizon | Value | Typical Timeframe |
|---------|-------|-------------------|
| Short-term | `short` | Weeks |
| Mid-term | `mid` | Months/Quarter |
| Long-term | `long` | Year+ |

## Example: Create and Track Goal

```typescript
// Create a goal
const goal = await fetch('/api/workspaces/ws_123/goals', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    title: 'Complete Q1 Documentation',
    description: 'Update all API docs for v2.0 release',
    horizon: 'mid',
    keywords: ['docs', 'q1', 'api'],
    spaceId: 'space_engineering',
  }),
});

// Link existing tasks
await fetch(`/api/workspaces/ws_123/goals/${goal.id}/tasks`, {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    taskId: 'task_auth_docs',
  }),
});

// Check progress
const progress = await fetch(
  `/api/workspaces/ws_123/goals/${goal.id}?includeTasks=true`,
  {
    headers: { 'Authorization': 'Bearer YOUR_API_KEY' },
  }
);
```

## Related

- [Tasks API](/api/endpoints/tasks) - Task management
- [Goals Concept](/concepts/goals) - Goals overview
