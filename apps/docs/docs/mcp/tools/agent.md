---
title: Agent
sidebar_position: 8
---

# Agent Tools

Tools for interacting with the AI agent's planning, suggestions, and autonomous features.

## Available Tools

### agent_chat

Send a message to the agent and get a response.

```json
{
  "name": "agent_chat",
  "arguments": {
    "workspace_id": "ws_123",
    "message": "What tasks are due this week?",
    "context": {
      "space_id": "space_456",
      "page_id": "page_789"
    }
  }
}
```

**Response:**

```json
{
  "response": "You have 5 tasks due this week:\n1. Review PR #456 (Tomorrow)\n2. Update API docs (Wednesday)...",
  "suggestions": [
    "Would you like me to prioritize these?",
    "Should I create a plan for completing them?"
  ],
  "actions_taken": []
}
```

### agent_plan_generate

Generate a plan for a specific horizon.

```json
{
  "name": "agent_plan_generate",
  "arguments": {
    "workspace_id": "ws_123",
    "horizon": "daily",
    "date": "2024-01-15",
    "include_goals": true
  }
}
```

**Arguments:**

| Argument | Type | Description |
|----------|------|-------------|
| `horizon` | string | `daily`, `short`, `mid`, or `long` |
| `date` | string | Target date (for daily plans) |
| `include_goals` | boolean | Include goal alignment |

**Response:**

```json
{
  "plan": {
    "id": "plan_123",
    "horizon": "daily",
    "date": "2024-01-15",
    "summary": "Focus on API documentation and code reviews",
    "items": [
      {
        "time": "09:00",
        "task_id": "task_456",
        "title": "Review PR #456",
        "duration": 30,
        "priority": "high"
      },
      {
        "time": "09:30",
        "task_id": "task_789",
        "title": "Update API documentation",
        "duration": 120,
        "priority": "high",
        "goal_id": "goal_abc"
      }
    ],
    "goalAlignment": [
      {
        "goal_id": "goal_abc",
        "title": "Launch API v2.0",
        "tasksInPlan": 2
      }
    ]
  }
}
```

### agent_plan_approve

Approve or reject a generated plan.

```json
{
  "name": "agent_plan_approve",
  "arguments": {
    "workspace_id": "ws_123",
    "plan_id": "plan_123",
    "approved": true,
    "feedback": "Looks good, but move the meeting earlier"
  }
}
```

### agent_suggestions_get

Get proactive suggestions from the agent.

```json
{
  "name": "agent_suggestions_get",
  "arguments": {
    "workspace_id": "ws_123",
    "types": ["tasks", "goals", "content"],
    "limit": 5
  }
}
```

**Response:**

```json
{
  "suggestions": [
    {
      "type": "task_priority",
      "message": "Consider prioritizing 'Update API docs' - it's blocking 2 other tasks",
      "task_id": "task_456",
      "confidence": 0.85
    },
    {
      "type": "goal_attention",
      "message": "Your goal 'Launch v2.0' has no activity in 5 days",
      "goal_id": "goal_789",
      "confidence": 0.72
    },
    {
      "type": "content_update",
      "message": "The deployment guide hasn't been updated in 30 days",
      "page_id": "page_abc",
      "confidence": 0.68
    }
  ]
}
```

### agent_settings_get

Get current agent settings.

```json
{
  "name": "agent_settings_get",
  "arguments": {
    "workspace_id": "ws_123",
    "space_id": "space_456"  // optional for space-specific settings
  }
}
```

**Response:**

```json
{
  "settings": {
    "enabled": true,
    "autonomyLevel": "assisted",
    "schedule": {
      "daily": true,
      "weekly": true,
      "monthly": false,
      "timezone": "America/New_York"
    },
    "approvalRequired": ["create_task", "delete", "publish"],
    "spaceOverrides": {
      "space_456": {
        "autonomyLevel": "full"
      }
    }
  }
}
```

### agent_settings_update

Update agent settings.

```json
{
  "name": "agent_settings_update",
  "arguments": {
    "workspace_id": "ws_123",
    "settings": {
      "autonomyLevel": "full",
      "schedule": {
        "daily": true,
        "weekly": true
      }
    }
  }
}
```

### agent_approval_list

List pending approvals.

```json
{
  "name": "agent_approval_list",
  "arguments": {
    "workspace_id": "ws_123",
    "status": "pending"
  }
}
```

**Response:**

```json
{
  "approvals": [
    {
      "id": "approval_123",
      "type": "create_tasks",
      "description": "Create 3 tasks based on weekly goals",
      "details": {
        "tasks": [
          { "title": "Review auth module", "priority": "high" },
          { "title": "Update tests", "priority": "medium" }
        ]
      },
      "createdAt": "2024-01-15T08:00:00Z"
    }
  ]
}
```

### agent_approval_respond

Respond to an approval request.

```json
{
  "name": "agent_approval_respond",
  "arguments": {
    "workspace_id": "ws_123",
    "approval_id": "approval_123",
    "approved": true,
    "feedback": "Approved, but change the second task priority to high"
  }
}
```

### agent_questions_get

Get reflection questions for planning.

```json
{
  "name": "agent_questions_get",
  "arguments": {
    "workspace_id": "ws_123",
    "context": "daily_planning"
  }
}
```

**Response:**

```json
{
  "questions": [
    "What's the most important thing to accomplish today?",
    "Are there any blockers I should know about?",
    "How did yesterday's plan work out?"
  ]
}
```

## Autonomy Levels

| Level | Description | Actions |
|-------|-------------|---------|
| `off` | Agent disabled | None |
| `assisted` | Suggestions only | Suggest, don't act |
| `supervised` | Act with approval | Propose, await approval |
| `full` | Autonomous | Act independently |

## Example: Daily Planning Workflow

```typescript
// Get reflection questions
const questions = await mcp.call("agent_questions_get", {
  workspace_id: "ws_123",
  context: "daily_planning"
});

// Generate daily plan
const plan = await mcp.call("agent_plan_generate", {
  workspace_id: "ws_123",
  horizon: "daily",
  date: "2024-01-15",
  include_goals: true
});

// Review and approve
await mcp.call("agent_plan_approve", {
  workspace_id: "ws_123",
  plan_id: plan.plan.id,
  approved: true
});

// Get suggestions throughout the day
const suggestions = await mcp.call("agent_suggestions_get", {
  workspace_id: "ws_123",
  types: ["tasks"],
  limit: 3
});
```

## External Agent Registration

Tools for external agents to register and interact with the workspace.

### agent_register

Register an external agent with the workspace using an invite token.

```json
{
  "name": "agent_register",
  "arguments": {
    "invite_token": "inv_abc123def456",
    "agent_name": "My Custom Agent",
    "agent_description": "A custom agent for task automation",
    "capabilities": ["task.read", "task.write", "page.read"]
  }
}
```

**Response:**

```json
{
  "agent_id": "agent_789",
  "api_key": "mcp_live_abc123...",
  "permissions": ["task.read", "task.write", "page.read"],
  "workspace_id": "ws_123"
}
```

:::caution
Store the API key securely - it will only be shown once.
:::

### agent_profile

Get the current agent's profile and permissions.

```json
{
  "name": "agent_profile",
  "arguments": {}
}
```

**Response:**

```json
{
  "agent": {
    "id": "agent_789",
    "name": "My Custom Agent",
    "description": "A custom agent for task automation",
    "status": "active",
    "permissions": ["task.read", "task.write", "page.read"],
    "createdAt": "2024-01-15T10:00:00Z",
    "lastActiveAt": "2024-01-15T14:30:00Z"
  }
}
```

### agent_updateStatus

Update the agent's status.

```json
{
  "name": "agent_updateStatus",
  "arguments": {
    "status": "active",
    "metadata": {
      "currentTask": "Processing inbox items",
      "progress": 75
    }
  }
}
```

### agent_logActivity

Log an activity entry for the agent.

```json
{
  "name": "agent_logActivity",
  "arguments": {
    "action": "task.complete",
    "resource_id": "task_456",
    "details": {
      "task_title": "Review API docs",
      "completion_note": "Completed with comments"
    }
  }
}
```

## Agent Spawning

Request new agents from the configured runtime.

### agent_spawn

Spawn new agents via the workspace's configured runtime.

```json
{
  "name": "agent_spawn",
  "arguments": {
    "workspace_id": "ws_123",
    "agent_type": "claude-code",
    "count": 2,
    "name": "Code Review Bot",
    "capabilities": ["code_review", "testing"],
    "permissions": ["page.read", "task.write"],
    "project_id": "proj_456",
    "config": {
      "model": "claude-3-opus",
      "max_tokens": 4096
    }
  }
}
```

**Arguments:**

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `agent_type` | string | Yes | `claude-code`, `codex`, `gemini-cli`, `aider`, `custom` |
| `count` | number | Yes | Number of agents to spawn (1-10) |
| `name` | string | No | Display name for spawned agents |
| `capabilities` | string[] | No | Capabilities to assign |
| `permissions` | string[] | No | Permissions to grant |
| `project_id` | string | No | Auto-assign to project |
| `task_id` | string | No | Auto-assign to task |
| `config` | object | No | Agent-specific configuration |

**Response:**

```json
{
  "success": true,
  "spawnedAgents": [
    {
      "id": "agent_abc123",
      "name": "Code Review Bot #1",
      "type": "claude-code",
      "status": "spawning"
    },
    {
      "id": "agent_def456",
      "name": "Code Review Bot #2",
      "type": "claude-code",
      "status": "spawning"
    }
  ]
}
```

### agent_runtime_test

Test connection to the runtime endpoint.

```json
{
  "name": "agent_runtime_test",
  "arguments": {
    "workspace_id": "ws_123",
    "endpoint": "http://localhost:8765"
  }
}
```

**Response:**

```json
{
  "connected": true,
  "latency": 45,
  "version": "1.2.0",
  "activeAgents": 3
}
```

## Resource Access Control

When accessing pages or tasks, the MCP API respects resource-level access controls.

### Agent Accessible Flag

Resources with `agentAccessible: false` will return a permission error:

```json
{
  "error": {
    "code": -32003,
    "message": "This page is not accessible by agents"
  }
}
```

### Best Practices

1. **Check permissions first** - Query available resources before attempting modifications
2. **Handle access errors gracefully** - Some resources may be restricted
3. **Log activities** - Use `agent_logActivity` for audit trail
4. **Respect rate limits** - See [Rate Limits](/api/rate-limits)

## Related

- [AI Agent Concept](/concepts/agent) - Agent overview
- [Memory Tools](/mcp/tools/memory) - Agent memory
- [Goals Tools](/mcp/tools/goals) - Goal management
- [Authentication](/mcp/authentication) - API authentication
