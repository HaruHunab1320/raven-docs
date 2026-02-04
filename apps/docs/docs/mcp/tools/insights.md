---
title: Insights
sidebar_position: 11
---

# Insights Tools

Tools for AI-generated summaries, activity digests, and entity relationship analysis.

:::info Personal Insights
Insights are **personal to each user**. All analysis, summaries, and entity graphs are scoped to the authenticated user's own activity and memories. This ensures agents can provide personalized productivity insights while maintaining privacy.
:::

## Available Tools

### insights_generate_summary

Generate an AI-powered summary of activity in a space for a given time period. Returns structured data appropriate to the period type.

```json
{
  "name": "insights_generate_summary",
  "arguments": {
    "workspace_id": "ws_123",
    "space_id": "space_456",
    "period": "daily"
  }
}
```

**Daily Response** (triage-focused):

```json
{
  "period": "daily",
  "spaceId": "space_456",
  "spaceName": "My Space",
  "triage": {
    "inbox": 12,
    "waiting": 5,
    "someday": 8,
    "overdue": 3,
    "dueToday": 2
  },
  "overdueTasks": [
    { "id": "task_001", "title": "Review Q4 report" },
    { "id": "task_002", "title": "Send invoice" }
  ],
  "dueTodayTasks": [
    { "id": "task_003", "title": "Team standup" }
  ],
  "summaryText": "## Summary\nYou have 3 overdue tasks...",
  "generatedAt": "2024-01-15T07:00:00Z"
}
```

**Weekly/Monthly Response** (metrics-focused):

```json
{
  "period": "weekly",
  "spaceId": "space_456",
  "spaceName": "My Space",
  "metrics": {
    "tasksCompleted": 15,
    "tasksCreated": 8,
    "pagesCreated": 3,
    "pagesUpdated": 12,
    "memoriesAdded": 45
  },
  "topProjects": [
    { "id": "proj_001", "name": "API v2", "activity": 23 },
    { "id": "proj_002", "name": "Documentation", "activity": 15 }
  ],
  "topEntities": [
    { "id": "entity_api", "name": "API v2", "type": "project", "count": 23 },
    { "id": "entity_auth", "name": "OAuth", "type": "concept", "count": 15 }
  ],
  "summaryText": "## Weekly Summary\nThis week you completed 15 tasks...",
  "generatedAt": "2024-01-15T07:00:00Z"
}
```

The summary is also stored as a memory in the space for future reference.

### insights_graph

Get the entity relationship graph showing connections between entities mentioned in memories.

```json
{
  "name": "insights_graph",
  "arguments": {
    "workspace_id": "ws_123",
    "space_id": "space_456",
    "limit": 50
  }
}
```

**Response:**

```json
{
  "graph": {
    "nodes": [
      { "id": "entity_api", "label": "API v2", "type": "project", "mentions": 23 },
      { "id": "entity_auth", "label": "OAuth", "type": "concept", "mentions": 15 },
      { "id": "entity_john", "label": "John", "type": "person", "mentions": 12 }
    ],
    "edges": [
      { "source": "entity_api", "target": "entity_auth", "weight": 8 },
      { "source": "entity_api", "target": "entity_john", "weight": 5 }
    ],
    "generatedAt": "2024-01-15T10:00:00Z"
  }
}
```

### insights_entity_memories

Get memories related to a specific entity.

```json
{
  "name": "insights_entity_memories",
  "arguments": {
    "workspace_id": "ws_123",
    "space_id": "space_456",
    "entity_id": "entity_api",
    "limit": 20
  }
}
```

**Response:**

```json
{
  "memories": [
    {
      "id": "mem_001",
      "content": "Decided to use REST over GraphQL for API v2 due to team familiarity",
      "category": "decision",
      "createdAt": "2024-01-10T14:30:00Z",
      "entities": ["entity_api", "entity_rest", "entity_graphql"]
    },
    {
      "id": "mem_002",
      "content": "API rate limiting will be 1000 req/min for free tier",
      "category": "specification",
      "createdAt": "2024-01-12T09:15:00Z",
      "entities": ["entity_api"]
    }
  ]
}
```

### insights_entity_details

Get detailed information about a specific entity including related memories and connections.

```json
{
  "name": "insights_entity_details",
  "arguments": {
    "workspace_id": "ws_123",
    "space_id": "space_456",
    "entity_id": "entity_api"
  }
}
```

**Response:**

```json
{
  "entity": {
    "id": "entity_api",
    "label": "API v2",
    "type": "project",
    "firstMentioned": "2024-01-05T10:00:00Z",
    "lastMentioned": "2024-01-14T16:30:00Z",
    "totalMentions": 23,
    "relatedEntities": [
      { "id": "entity_auth", "label": "OAuth", "coMentions": 8 },
      { "id": "entity_john", "label": "John", "coMentions": 5 }
    ],
    "recentMemories": [
      {
        "id": "mem_001",
        "content": "Decided to use REST over GraphQL...",
        "createdAt": "2024-01-10T14:30:00Z"
      }
    ]
  }
}
```

### insights_top_entities

List the most frequently mentioned entities in the user's memories.

```json
{
  "name": "insights_top_entities",
  "arguments": {
    "workspace_id": "ws_123",
    "space_id": "space_456",
    "limit": 10
  }
}
```

**Response:**

```json
{
  "entities": [
    { "id": "entity_api", "label": "API v2", "type": "project", "mentions": 23 },
    { "id": "entity_auth", "label": "OAuth", "type": "concept", "mentions": 15 },
    { "id": "entity_john", "label": "John", "type": "person", "mentions": 12 },
    { "id": "entity_docs", "label": "Documentation", "type": "project", "mentions": 10 }
  ]
}
```

## Summary Periods

| Period | Description |
|--------|-------------|
| `daily` | Activity from the past 24 hours |
| `weekly` | Activity from the past 7 days |
| `monthly` | Activity from the past 30 days |

## Entity Types

The system automatically categorizes entities mentioned in memories:

| Type | Examples |
|------|----------|
| `project` | API v2, Documentation, Migration |
| `person` | John, Sarah, external contacts |
| `concept` | OAuth, REST, microservices |
| `tool` | Postgres, Redis, Kubernetes |
| `organization` | Acme Corp, partner companies |

## Example: Building Context

```typescript
// Get daily triage for planning
const daily = await mcp.call("insights_generate_summary", {
  workspace_id: "ws_123",
  space_id: "space_456",
  period: "daily"
});

console.log(`Inbox: ${daily.triage.inbox}, Overdue: ${daily.triage.overdue}`);
console.log(`Due today: ${daily.dueTodayTasks.map(t => t.title).join(", ")}`);

// Get weekly metrics and top projects
const weekly = await mcp.call("insights_generate_summary", {
  workspace_id: "ws_123",
  space_id: "space_456",
  period: "weekly"
});

console.log(`Completed ${weekly.metrics.tasksCompleted} tasks this week`);
console.log(`Top projects: ${weekly.topProjects.map(p => p.name).join(", ")}`);

// Find the most important topics
const topEntities = await mcp.call("insights_top_entities", {
  workspace_id: "ws_123",
  space_id: "space_456",
  limit: 5
});

// Get context about the top project
const topProject = topEntities.entities[0];
const details = await mcp.call("insights_entity_details", {
  workspace_id: "ws_123",
  space_id: "space_456",
  entity_id: topProject.id
});

// Understand relationships
const graph = await mcp.call("insights_graph", {
  workspace_id: "ws_123",
  space_id: "space_456",
  limit: 20
});

// Find strongly connected entities
const strongConnections = graph.graph.edges
  .filter(e => e.weight > 5)
  .map(e => `${e.source} <-> ${e.target}`);
```

## Related

- [Memory Tools](/mcp/tools/memory) - Memory management
- [Profile Tools](/mcp/tools/profile) - User behavioral insights
- [Goals Tools](/mcp/tools/goals) - Goal tracking
