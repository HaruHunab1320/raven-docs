---
title: Knowledge Tools
sidebar_position: 6
---

# Knowledge Tools

Tools for searching and managing knowledge sources that provide context to agents.

## Overview

The knowledge system allows workspaces to upload documentation, files, and URLs that get automatically chunked and vectorized. Agents can then search this knowledge base using semantic similarity to find relevant information.

Knowledge sources can be scoped at three levels:
- **System** - Available to all workspaces (e.g., Raven Docs documentation)
- **Workspace** - Available to all spaces within a workspace
- **Space** - Available only within a specific space

## knowledge.search

Search knowledge sources using semantic similarity.

```json
{
  "jsonrpc": "2.0",
  "method": "knowledge.search",
  "params": {
    "query": "How do I create a new page?",
    "workspaceId": "ws_123",
    "spaceId": "space_456",
    "limit": 5
  },
  "id": 1
}
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Search query text |
| `workspaceId` | string | Yes | Workspace ID |
| `spaceId` | string | No | Filter to specific space |
| `limit` | number | No | Max results (default: 5) |

### Response

```json
{
  "jsonrpc": "2.0",
  "result": {
    "results": [
      {
        "content": "To create a new page, click the + button in the sidebar or use the keyboard shortcut Cmd/Ctrl+N...",
        "sourceName": "Raven Docs - Getting Started",
        "similarity": 0.89,
        "metadata": {
          "headings": ["Creating Pages"]
        }
      },
      {
        "content": "Pages can be organized into a hierarchy by dragging them in the sidebar...",
        "sourceName": "Raven Docs - Organizing Content",
        "similarity": 0.72,
        "metadata": {
          "headings": ["Page Organization"]
        }
      }
    ],
    "count": 2
  },
  "id": 1
}
```

## knowledge.list

List available knowledge sources.

```json
{
  "jsonrpc": "2.0",
  "method": "knowledge.list",
  "params": {
    "workspaceId": "ws_123",
    "spaceId": "space_456"
  },
  "id": 1
}
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspaceId` | string | Yes | Workspace ID |
| `spaceId` | string | No | Filter to specific space |

### Response

```json
{
  "jsonrpc": "2.0",
  "result": {
    "sources": [
      {
        "id": "ks_123",
        "name": "Raven Docs - Getting Started",
        "type": "url",
        "scope": "system",
        "status": "ready",
        "chunkCount": 24,
        "lastSyncedAt": "2025-01-22T10:00:00Z"
      },
      {
        "id": "ks_456",
        "name": "Company Policies",
        "type": "file",
        "scope": "workspace",
        "status": "ready",
        "chunkCount": 42,
        "lastSyncedAt": "2025-01-20T14:30:00Z"
      }
    ],
    "count": 2
  },
  "id": 1
}
```

## knowledge.get

Get details of a specific knowledge source.

```json
{
  "jsonrpc": "2.0",
  "method": "knowledge.get",
  "params": {
    "sourceId": "ks_123"
  },
  "id": 1
}
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sourceId` | string | Yes | Knowledge source ID |

### Response

```json
{
  "jsonrpc": "2.0",
  "result": {
    "source": {
      "id": "ks_123",
      "name": "Raven Docs - Getting Started",
      "type": "url",
      "scope": "system",
      "status": "ready",
      "errorMessage": null,
      "chunkCount": 24,
      "lastSyncedAt": "2025-01-22T10:00:00Z",
      "createdAt": "2025-01-01T00:00:00Z"
    }
  },
  "id": 1
}
```

## Source Types

| Type | Description |
|------|-------------|
| `url` | Web page that gets fetched and processed |
| `file` | Uploaded document (PDF, DOCX, MD, TXT) |
| `page` | Internal Raven Docs page |

## Source Status

| Status | Description |
|--------|-------------|
| `pending` | Queued for processing |
| `processing` | Currently being chunked and embedded |
| `ready` | Available for search |
| `error` | Processing failed (see errorMessage) |

## Use Cases

### Answer Questions About the Product

```typescript
// When user asks how to do something
const knowledge = await mcp.callTool('knowledge.search', {
  query: 'How do I share a page with my team?',
  workspaceId: 'ws_123',
});

// Use the results to inform your response
const relevantDocs = knowledge.results
  .filter(r => r.similarity > 0.7)
  .map(r => r.content)
  .join('\n\n');
```

### Check Company Policies

```typescript
// When dealing with policy-related questions
const policies = await mcp.callTool('knowledge.search', {
  query: 'vacation request approval process',
  workspaceId: 'ws_123',
});
```

### Provide Context-Aware Help

```typescript
// Combine with memory for personalized assistance
const [memories, knowledge] = await Promise.all([
  mcp.callTool('memory.query', {
    workspaceId: 'ws_123',
    query: 'user preferences',
  }),
  mcp.callTool('knowledge.search', {
    workspaceId: 'ws_123',
    query: 'getting started guide',
  }),
]);
```

## Architecture

Knowledge search uses **pgvector** with HNSW indexes for fast approximate nearest neighbor search:

- Documents are chunked into ~500-1000 token segments
- Each chunk is embedded using Gemini's text-embedding-004 model (768 dimensions)
- Queries are embedded and matched against chunks using cosine similarity
- HNSW index provides O(log n) query performance

This differs from the memory system which stores user-generated context, while knowledge sources contain static documentation and reference material.

## Best Practices

1. **Use specific queries** - More specific queries get better results
2. **Check similarity scores** - Filter results below 0.5-0.6 similarity
3. **Combine with memory** - Use knowledge for facts, memory for preferences
4. **Respect scope** - System knowledge applies everywhere, space knowledge is contextual
