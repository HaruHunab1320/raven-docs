---
title: Research
sidebar_position: 7
---

# Research Tools

Tools for conducting AI-powered research from multiple sources.

## Available Tools

### research_create

Start a new research job.

```json
{
  "name": "research_create",
  "arguments": {
    "workspace_id": "ws_123",
    "topic": "Best practices for API rate limiting",
    "sources": ["docs", "web"],
    "output_mode": "longform",
    "time_budget": 60,
    "target_space_id": "space_456"
  }
}
```

**Arguments:**

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `workspace_id` | string | Yes | Workspace ID |
| `topic` | string | Yes | Research topic |
| `sources` | array | No | Sources to search (default: all) |
| `output_mode` | string | No | `longform` or `brief` (default: longform) |
| `time_budget` | number | No | Max minutes (default: 60, min: 5) |
| `target_space_id` | string | No | Where to save report |
| `repository` | object | No | Repository config for repo research |

**Response:**

```json
{
  "job": {
    "id": "research_789",
    "topic": "Best practices for API rate limiting",
    "status": "pending",
    "sources": ["docs", "web"],
    "outputMode": "longform",
    "timeBudget": 60,
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

### research_status

Check the status of a research job.

```json
{
  "name": "research_status",
  "arguments": {
    "workspace_id": "ws_123",
    "job_id": "research_789"
  }
}
```

**Response:**

```json
{
  "job": {
    "id": "research_789",
    "status": "running",
    "progress": 45,
    "sourcesSearched": 8,
    "documentsFound": 23,
    "timeElapsed": 12,
    "estimatedTimeRemaining": 15
  }
}
```

**Status values:**

| Status | Description |
|--------|-------------|
| `pending` | Job queued, not started |
| `running` | Actively researching |
| `completed` | Research done, report ready |
| `failed` | Research failed |
| `cancelled` | Job was cancelled |

### research_get_report

Get the completed research report.

```json
{
  "name": "research_get_report",
  "arguments": {
    "workspace_id": "ws_123",
    "job_id": "research_789"
  }
}
```

**Response:**

```json
{
  "report": {
    "id": "research_789",
    "topic": "Best practices for API rate limiting",
    "summary": "API rate limiting is essential for...",
    "content": "# Research: API Rate Limiting\n\n## Summary\n...",
    "sources": [
      {
        "type": "doc",
        "title": "API Architecture",
        "url": "/spaces/eng/api-architecture"
      },
      {
        "type": "web",
        "title": "Rate Limiting Algorithms",
        "url": "https://example.com/rate-limiting"
      }
    ],
    "pageId": "page_report_123",
    "completedAt": "2024-01-15T10:45:00Z",
    "timeSpent": 15
  }
}
```

### research_cancel

Cancel an ongoing research job.

```json
{
  "name": "research_cancel",
  "arguments": {
    "workspace_id": "ws_123",
    "job_id": "research_789"
  }
}
```

### research_list

List research jobs.

```json
{
  "name": "research_list",
  "arguments": {
    "workspace_id": "ws_123",
    "status": "completed",
    "limit": 10
  }
}
```

## Research Sources

### Documentation (`docs`)

Searches your workspace content:

- All pages you have access to
- Attachments and embedded content
- Page history and comments

### Web (`web`)

Searches the public internet:

- Technical documentation
- Blog posts and articles
- Stack Overflow answers
- Official guides

### Repository (`repository`)

Analyzes GitHub repositories:

```json
{
  "name": "research_create",
  "arguments": {
    "workspace_id": "ws_123",
    "topic": "Authentication implementation patterns",
    "sources": ["repository"],
    "repository": {
      "url": "https://github.com/expressjs/express",
      "paths": ["lib/", "examples/"],
      "branch": "master"
    }
  }
}
```

## Output Modes

### Longform

Comprehensive report including:

- Executive summary
- Detailed findings by section
- Code examples where relevant
- Full source citations
- Recommendations

### Brief

Concise summary including:

- Key findings (bullet points)
- Top recommendations
- Essential sources

## Example: Comprehensive Research

```typescript
// Start research
const job = await mcp.call("research_create", {
  workspace_id: "ws_123",
  topic: "Implementing WebSocket authentication",
  sources: ["docs", "web", "repository"],
  repository: {
    url: "https://github.com/socketio/socket.io",
    paths: ["lib/"]
  },
  output_mode: "longform",
  time_budget: 90,
  target_space_id: "space_engineering"
});

// Poll for completion
let status;
do {
  await sleep(30000); // Wait 30 seconds
  status = await mcp.call("research_status", {
    workspace_id: "ws_123",
    job_id: job.job.id
  });
} while (status.job.status === "running");

// Get report
if (status.job.status === "completed") {
  const report = await mcp.call("research_get_report", {
    workspace_id: "ws_123",
    job_id: job.job.id
  });

  console.log(`Report saved to page: ${report.report.pageId}`);
}
```

## Best Practices

1. **Be specific** - Clear topics yield better results
2. **Match sources to need** - Internal questions → docs, industry practices → web
3. **Set realistic budgets** - Quick lookups: 5min, deep dives: 60min+
4. **Review and refine** - Use findings to ask follow-up questions

## Related

- [Research Guide](/guides/research) - Detailed usage guide
- [Memory Tools](/mcp/tools/memory) - Research stored in memory
