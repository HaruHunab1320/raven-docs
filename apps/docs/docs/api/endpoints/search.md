---
title: Search
sidebar_position: 8
---

# Search API

Full-text search across your workspace.

## Search Query

<span className="api-method api-method--get">GET</span> `/v1/search`

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Search query |
| `workspaceId` | string | Yes | Workspace ID |
| `spaceId` | string | No | Filter by space |
| `types` | string[] | No | Content types: `page`, `task` |
| `limit` | number | No | Results per page |

### Example Request

```bash
curl "https://api.ravendocs.com/v1/search?workspaceId=ws_123&query=authentication" \
  -H "Authorization: Bearer $API_KEY"
```

### Example Response

```json
{
  "data": [
    {
      "type": "page",
      "id": "page_abc123",
      "title": "Authentication Guide",
      "snippet": "...implement authentication using OAuth 2.0...",
      "score": 0.95,
      "spaceId": "space_456",
      "updatedAt": "2025-01-15T10:00:00Z"
    }
  ]
}
```

---

## Search Suggestions

<span className="api-method api-method--get">GET</span> `/v1/search/suggest`

Returns autocomplete suggestions.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Partial query |
| `workspaceId` | string | Yes | Workspace ID |
| `limit` | number | No | Max suggestions |

### Example Response

```json
{
  "data": [
    { "text": "authentication", "type": "keyword" },
    { "text": "Authentication Guide", "type": "page", "id": "page_abc123" }
  ]
}
```
