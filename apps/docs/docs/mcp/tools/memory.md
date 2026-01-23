---
title: Memory Tools
sidebar_position: 5
---

# Memory Tools

Tools for storing and retrieving persistent agent memory.

## Overview

Agent memory allows AI agents to store context that persists across conversations. Use it to remember user preferences, learned information, and ongoing context.

## memory_ingest

Store information in memory.

```json
{
  "name": "memory_ingest",
  "arguments": {
    "workspaceId": "ws_123",
    "content": "User prefers formal documentation style with code examples",
    "metadata": {
      "source": "user_preference",
      "confidence": 0.9
    },
    "tags": ["preferences", "style", "documentation"]
  }
}
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspaceId` | string | Yes | Workspace ID |
| `content` | string | Yes | Content to store |
| `metadata` | object | No | Additional metadata |
| `tags` | string[] | No | Tags for categorization |

## memory_query

Query memory by semantic similarity.

```json
{
  "name": "memory_query",
  "arguments": {
    "workspaceId": "ws_123",
    "query": "documentation style preferences",
    "limit": 5,
    "tags": ["preferences"]
  }
}
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspaceId` | string | Yes | Workspace ID |
| `query` | string | Yes | Search query |
| `limit` | number | No | Max results |
| `tags` | string[] | No | Filter by tags |

### Response

```json
{
  "results": [
    {
      "id": "mem_123",
      "content": "User prefers formal documentation style with code examples",
      "score": 0.92,
      "tags": ["preferences", "style"],
      "createdAt": "2025-01-15T10:00:00Z"
    }
  ]
}
```

## memory_daily

Get daily memory summary.

```json
{
  "name": "memory_daily",
  "arguments": {
    "workspaceId": "ws_123",
    "date": "2025-01-22"
  }
}
```

Returns memories ingested on a specific date.

## memory_days

List days with memory entries.

```json
{
  "name": "memory_days",
  "arguments": {
    "workspaceId": "ws_123",
    "startDate": "2025-01-01",
    "endDate": "2025-01-31"
  }
}
```

### Response

```json
{
  "days": [
    { "date": "2025-01-15", "count": 5 },
    { "date": "2025-01-18", "count": 3 },
    { "date": "2025-01-22", "count": 8 }
  ]
}
```

## Use Cases

### Remember User Preferences

```typescript
// When user expresses a preference
await mcp.callTool('memory_ingest', {
  workspaceId: 'ws_123',
  content: 'User prefers bullet points over paragraphs',
  tags: ['preferences', 'formatting'],
});

// Later, when generating content
const prefs = await mcp.callTool('memory_query', {
  workspaceId: 'ws_123',
  query: 'formatting preferences',
  tags: ['preferences'],
});
```

### Track Conversation Context

```typescript
// Store important context from conversation
await mcp.callTool('memory_ingest', {
  workspaceId: 'ws_123',
  content: 'Currently working on Q1 roadmap project, focus on API improvements',
  tags: ['context', 'project'],
});
```

### Learn from Corrections

```typescript
// When user corrects the agent
await mcp.callTool('memory_ingest', {
  workspaceId: 'ws_123',
  content: 'The authentication API uses JWT, not sessions',
  tags: ['corrections', 'api', 'auth'],
});
```

## Best Practices

1. **Use specific tags** - Makes querying more effective
2. **Include context** - Store full context, not fragments
3. **Tag sources** - Know where memories came from
4. **Clean periodically** - Review and remove outdated memories
5. **Be selective** - Don't store everything, focus on valuable info
