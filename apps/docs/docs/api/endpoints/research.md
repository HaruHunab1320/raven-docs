---
title: Research
sidebar_position: 10
---

# Research API

Endpoints for creating and managing AI-powered research jobs.

## Create Research Job

```http
POST /api/workspaces/{workspaceId}/research
```

### Request Body

```json
{
  "topic": "Best practices for API rate limiting",
  "sources": ["docs", "web"],
  "outputMode": "longform",
  "timeBudget": 60,
  "targetSpaceId": "space_456",
  "repository": {
    "url": "https://github.com/org/repo",
    "paths": ["src/", "docs/"],
    "branch": "main"
  }
}
```

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `topic` | string | Yes | Research topic/question |
| `sources` | string[] | No | Sources to search (default: all) |
| `outputMode` | string | No | `longform` or `brief` (default: longform) |
| `timeBudget` | number | No | Max minutes (default: 60, min: 5) |
| `targetSpaceId` | string | No | Space for report page |
| `repository` | object | No | Repository config |

### Sources

| Source | Description |
|--------|-------------|
| `docs` | Search workspace documentation |
| `web` | Search public internet |
| `repository` | Analyze GitHub repository |

### Response

```json
{
  "id": "research_123",
  "topic": "Best practices for API rate limiting",
  "status": "pending",
  "sources": ["docs", "web"],
  "outputMode": "longform",
  "timeBudget": 60,
  "createdAt": "2024-01-15T10:30:00Z"
}
```

## Get Research Status

```http
GET /api/workspaces/{workspaceId}/research/{jobId}
```

### Response

```json
{
  "id": "research_123",
  "topic": "Best practices for API rate limiting",
  "status": "running",
  "progress": 45,
  "sourcesSearched": 8,
  "documentsFound": 23,
  "timeElapsed": 12,
  "estimatedTimeRemaining": 15,
  "createdAt": "2024-01-15T10:30:00Z"
}
```

### Status Values

| Status | Description |
|--------|-------------|
| `pending` | Job queued |
| `running` | Actively researching |
| `completed` | Done, report ready |
| `failed` | Research failed |
| `cancelled` | Job cancelled |

## Get Research Report

```http
GET /api/workspaces/{workspaceId}/research/{jobId}/report
```

Only available when status is `completed`.

### Response

```json
{
  "id": "research_123",
  "topic": "Best practices for API rate limiting",
  "summary": "API rate limiting is essential for protecting services from abuse...",
  "content": "# Research: API Rate Limiting\n\n## Executive Summary\n...",
  "sources": [
    {
      "type": "doc",
      "title": "API Architecture Guide",
      "url": "/spaces/engineering/api-architecture",
      "relevance": 0.92
    },
    {
      "type": "web",
      "title": "Rate Limiting Algorithms Explained",
      "url": "https://example.com/rate-limiting",
      "relevance": 0.88
    }
  ],
  "pageId": "page_report_456",
  "timeSpent": 45,
  "completedAt": "2024-01-15T11:15:00Z"
}
```

## Cancel Research

```http
POST /api/workspaces/{workspaceId}/research/{jobId}/cancel
```

### Response

```json
{
  "id": "research_123",
  "status": "cancelled",
  "partialResults": true
}
```

## List Research Jobs

```http
GET /api/workspaces/{workspaceId}/research
```

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | Filter by status |
| `limit` | number | Max results (default: 20) |
| `offset` | number | Pagination offset |

### Response

```json
{
  "jobs": [
    {
      "id": "research_123",
      "topic": "API rate limiting",
      "status": "completed",
      "createdAt": "2024-01-15T10:30:00Z",
      "completedAt": "2024-01-15T11:15:00Z"
    },
    {
      "id": "research_124",
      "topic": "Authentication patterns",
      "status": "running",
      "progress": 30,
      "createdAt": "2024-01-15T11:00:00Z"
    }
  ],
  "total": 15,
  "limit": 20,
  "offset": 0
}
```

## Repository Configuration

When researching a repository:

```json
{
  "repository": {
    "url": "https://github.com/expressjs/express",
    "paths": ["lib/", "examples/"],
    "branch": "master",
    "maxFiles": 100
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `url` | string | GitHub repository URL |
| `paths` | string[] | Paths to analyze (optional) |
| `branch` | string | Branch to analyze (default: main) |
| `maxFiles` | number | Max files to analyze (default: 100) |

## Example: Complete Research Workflow

```typescript
// Start research
const job = await fetch('/api/workspaces/ws_123/research', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    topic: 'WebSocket authentication best practices',
    sources: ['docs', 'web', 'repository'],
    repository: {
      url: 'https://github.com/socketio/socket.io',
      paths: ['lib/'],
    },
    outputMode: 'longform',
    timeBudget: 90,
    targetSpaceId: 'space_engineering',
  }),
});

const jobData = await job.json();

// Poll for completion
let status;
do {
  await new Promise(r => setTimeout(r, 30000)); // Wait 30s

  const statusRes = await fetch(
    `/api/workspaces/ws_123/research/${jobData.id}`,
    { headers: { 'Authorization': 'Bearer YOUR_API_KEY' } }
  );
  status = await statusRes.json();

  console.log(`Progress: ${status.progress}%`);
} while (status.status === 'running');

// Get report
if (status.status === 'completed') {
  const reportRes = await fetch(
    `/api/workspaces/ws_123/research/${jobData.id}/report`,
    { headers: { 'Authorization': 'Bearer YOUR_API_KEY' } }
  );
  const report = await reportRes.json();

  console.log(`Report saved to page: ${report.pageId}`);
  console.log(`Sources consulted: ${report.sources.length}`);
}
```

## Rate Limits

Research jobs are resource-intensive:

- Max 5 concurrent jobs per workspace
- Max 10 jobs per hour
- Time budgets enforced strictly

## Related

- [Research Guide](/guides/research) - Usage guide
- [Pages API](/api/endpoints/pages) - Access report pages
