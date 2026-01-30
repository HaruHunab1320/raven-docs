---
title: API Overview
sidebar_position: 1
---

# API Reference

The Raven Docs REST API gives you full programmatic access to your workspace.

## Base URL

```
http://localhost:3000/api
```

For production deployments with a custom domain:

```
https://your-domain.com/api
```

## Authentication

All API requests require an API key passed in the header:

```bash
curl http://localhost:3000/api/workspaces \
  -H "Authorization: Bearer YOUR_API_KEY"
```

See [Authentication](/api/authentication) for details on getting an API key.

## Request Format

### Headers

| Header | Required | Description |
|--------|----------|-------------|
| `Authorization` | Yes | `Bearer YOUR_API_KEY` |
| `Content-Type` | For POST/PUT | `application/json` |

### Query Parameters

List endpoints support pagination and filtering:

```bash
GET /v1/pages?workspaceId=ws_123&limit=20&page=1
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | number | Items per page (default: 20, max: 100) |
| `page` | number | Page number (default: 1) |

## Response Format

All responses are JSON:

```json
{
  "data": { ... },
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

### Success Responses

| Status | Description |
|--------|-------------|
| `200 OK` | Request successful |
| `201 Created` | Resource created |
| `204 No Content` | Delete successful |

### Error Responses

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Title is required",
    "details": {
      "field": "title",
      "reason": "required"
    }
  }
}
```

See [Errors](/api/errors) for all error codes.

## Endpoints

### Workspaces

| Method | Endpoint | Description |
|--------|----------|-------------|
| <span className="api-method api-method--get">GET</span> | `/workspaces` | List workspaces |
| <span className="api-method api-method--get">GET</span> | `/workspaces/:id` | Get workspace |
| <span className="api-method api-method--post">POST</span> | `/workspaces` | Create workspace |
| <span className="api-method api-method--put">PUT</span> | `/workspaces/:id` | Update workspace |

[Workspaces Reference →](/api/endpoints/workspaces)

### Spaces

| Method | Endpoint | Description |
|--------|----------|-------------|
| <span className="api-method api-method--get">GET</span> | `/spaces` | List spaces |
| <span className="api-method api-method--get">GET</span> | `/spaces/:id` | Get space |
| <span className="api-method api-method--post">POST</span> | `/spaces` | Create space |
| <span className="api-method api-method--put">PUT</span> | `/spaces/:id` | Update space |
| <span className="api-method api-method--delete">DELETE</span> | `/spaces/:id` | Delete space |

[Spaces Reference →](/api/endpoints/spaces)

### Pages

| Method | Endpoint | Description |
|--------|----------|-------------|
| <span className="api-method api-method--get">GET</span> | `/pages` | List pages |
| <span className="api-method api-method--get">GET</span> | `/pages/:id` | Get page |
| <span className="api-method api-method--post">POST</span> | `/pages` | Create page |
| <span className="api-method api-method--put">PUT</span> | `/pages/:id` | Update page |
| <span className="api-method api-method--delete">DELETE</span> | `/pages/:id` | Delete page |

[Pages Reference →](/api/endpoints/pages)

### Tasks

| Method | Endpoint | Description |
|--------|----------|-------------|
| <span className="api-method api-method--get">GET</span> | `/tasks` | List tasks |
| <span className="api-method api-method--get">GET</span> | `/tasks/:id` | Get task |
| <span className="api-method api-method--post">POST</span> | `/tasks` | Create task |
| <span className="api-method api-method--put">PUT</span> | `/tasks/:id` | Update task |
| <span className="api-method api-method--delete">DELETE</span> | `/tasks/:id` | Delete task |

[Tasks Reference →](/api/endpoints/tasks)

## SDK

### TypeScript/JavaScript

```bash
npm install @raven-docs/sdk
```

```typescript
import { RavenDocs } from '@raven-docs/sdk';

const client = new RavenDocs({
  apiKey: process.env.RAVEN_API_KEY,
});

// List pages
const pages = await client.pages.list({
  workspaceId: 'ws_123',
  spaceId: 'space_456',
});

// Create a page
const page = await client.pages.create({
  workspaceId: 'ws_123',
  spaceId: 'space_456',
  title: 'New Page',
  content: { type: 'doc', content: [] },
});
```

### Python (Coming Soon)

```python
from ravendocs import RavenDocs

client = RavenDocs(api_key="your-api-key")

pages = client.pages.list(workspace_id="ws_123")
```

## Rate Limits

Rate limits can be configured in your environment. Default limits:

| Scope | Requests/minute |
|-------|-----------------|
| Default | 60 |

See [Rate Limits](/api/rate-limits) for configuration options.

## Webhooks

Subscribe to events via webhooks:

```typescript
// Configure in dashboard or via API
await client.webhooks.create({
  url: 'https://your-server.com/webhooks/raven',
  events: ['page.created', 'task.completed'],
});
```

## Related

- [Authentication](/api/authentication) - API key setup
- [Errors](/api/errors) - Error handling
- [Rate Limits](/api/rate-limits) - Usage limits
