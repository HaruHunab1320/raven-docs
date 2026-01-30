---
title: Pages
sidebar_position: 3
---

# Pages API

Create, read, update, and delete pages.

## List Pages

<span className="api-method api-method--get">GET</span> `/v1/pages`

Returns a list of pages in a space.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspaceId` | string | Yes | Workspace ID |
| `spaceId` | string | Yes | Space ID |
| `parentId` | string | No | Filter by parent page |
| `limit` | number | No | Items per page (default: 20) |
| `page` | number | No | Page number |

### Example Request

```bash
curl "http://localhost:3000/api/pages?workspaceId=ws_123&spaceId=space_456" \
  -H "Authorization: Bearer $API_KEY"
```

### Example Response

```json
{
  "data": [
    {
      "id": "page_abc123",
      "title": "Getting Started",
      "slug": "getting-started",
      "icon": "rocket",
      "parentId": null,
      "spaceId": "space_456",
      "createdAt": "2025-01-15T10:00:00Z",
      "updatedAt": "2025-01-20T14:30:00Z",
      "createdBy": "user_789"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 45
  }
}
```

---

## Get Page

<span className="api-method api-method--get">GET</span> `/v1/pages/:pageId`

Returns a single page with its content.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pageId` | string | Yes | Page ID |

### Example Request

```bash
curl "http://localhost:3000/api/pages/page_abc123" \
  -H "Authorization: Bearer $API_KEY"
```

### Example Response

```json
{
  "data": {
    "id": "page_abc123",
    "title": "Getting Started",
    "slug": "getting-started",
    "icon": "rocket",
    "content": {
      "type": "doc",
      "content": [
        {
          "type": "heading",
          "attrs": { "level": 1 },
          "content": [{ "type": "text", "text": "Getting Started" }]
        },
        {
          "type": "paragraph",
          "content": [{ "type": "text", "text": "Welcome to our documentation." }]
        }
      ]
    },
    "parentId": null,
    "spaceId": "space_456",
    "workspaceId": "ws_123",
    "createdAt": "2025-01-15T10:00:00Z",
    "updatedAt": "2025-01-20T14:30:00Z",
    "createdBy": "user_789"
  }
}
```

---

## Create Page

<span className="api-method api-method--post">POST</span> `/v1/pages`

Creates a new page.

### Body Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspaceId` | string | Yes | Workspace ID |
| `spaceId` | string | Yes | Space ID |
| `title` | string | Yes | Page title |
| `content` | object | Yes | Page content (ProseMirror format) |
| `parentId` | string | No | Parent page ID |
| `icon` | string | No | Emoji or icon |

### Example Request

```bash
curl -X POST "http://localhost:3000/api/pages" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "workspaceId": "ws_123",
    "spaceId": "space_456",
    "title": "New Feature Spec",
    "content": {
      "type": "doc",
      "content": [
        {
          "type": "paragraph",
          "content": [{ "type": "text", "text": "Overview of the new feature." }]
        }
      ]
    },
    "icon": "sparkles"
  }'
```

### Example Response

```json
{
  "data": {
    "id": "page_xyz789",
    "title": "New Feature Spec",
    "slug": "new-feature-spec",
    "icon": "sparkles",
    "parentId": null,
    "spaceId": "space_456",
    "workspaceId": "ws_123",
    "createdAt": "2025-01-22T09:00:00Z",
    "updatedAt": "2025-01-22T09:00:00Z",
    "createdBy": "user_789"
  }
}
```

---

## Update Page

<span className="api-method api-method--put">PUT</span> `/v1/pages/:pageId`

Updates an existing page.

### Body Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspaceId` | string | Yes | Workspace ID |
| `title` | string | No | New title |
| `content` | object | No | New content |
| `parentId` | string | No | New parent page |
| `icon` | string | No | New icon |

### Example Request

```bash
curl -X PUT "http://localhost:3000/api/pages/page_xyz789" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "workspaceId": "ws_123",
    "title": "Updated Feature Spec",
    "content": {
      "type": "doc",
      "content": [
        {
          "type": "paragraph",
          "content": [{ "type": "text", "text": "Updated content." }]
        }
      ]
    }
  }'
```

---

## Delete Page

<span className="api-method api-method--delete">DELETE</span> `/v1/pages/:pageId`

Deletes a page.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pageId` | string | Yes | Page ID |
| `workspaceId` | query | Yes | Workspace ID |

### Example Request

```bash
curl -X DELETE "http://localhost:3000/api/pages/page_xyz789?workspaceId=ws_123" \
  -H "Authorization: Bearer $API_KEY"
```

---

## Get Page History

<span className="api-method api-method--get">GET</span> `/v1/pages/:pageId/history`

Returns the revision history for a page.

### Example Response

```json
{
  "data": [
    {
      "id": "hist_001",
      "pageId": "page_abc123",
      "version": 5,
      "createdAt": "2025-01-20T14:30:00Z",
      "createdBy": "user_789",
      "summary": "Updated introduction"
    },
    {
      "id": "hist_002",
      "pageId": "page_abc123",
      "version": 4,
      "createdAt": "2025-01-18T11:00:00Z",
      "createdBy": "user_456",
      "summary": "Added code examples"
    }
  ]
}
```

---

## Restore Page Version

<span className="api-method api-method--post">POST</span> `/v1/pages/:pageId/restore`

Restores a page to a previous version.

### Body Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `historyId` | string | Yes | History version ID |

### Example Request

```bash
curl -X POST "http://localhost:3000/api/pages/page_abc123/restore" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "historyId": "hist_002" }'
```
