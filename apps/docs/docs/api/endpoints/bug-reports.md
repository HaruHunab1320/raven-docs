---
title: Bug Reports
sidebar_position: 11
---

# Bug Reports API

Create and manage bug reports.

:::note Admin Only
Most bug report endpoints require admin privileges. The auto-report endpoint is available to all authenticated users for error capture.
:::

## List Bug Reports

<span className="api-method api-method--post">POST</span> `/bug-reports/list`

Returns bug reports with optional filters.

### Body Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `source` | string | No | Filter by source (`auto:server`, `auto:client`, `auto:agent`, `user:command`) |
| `severity` | string | No | Filter by severity (`low`, `medium`, `high`, `critical`) |
| `status` | string | No | Filter by status (`open`, `triaged`, `in_progress`, `resolved`, `closed`) |
| `workspaceId` | string | No | Filter by workspace |
| `fromDate` | string | No | Filter from date (ISO 8601) |
| `toDate` | string | No | Filter to date (ISO 8601) |
| `page` | number | No | Page number (default: 1) |
| `limit` | number | No | Items per page (default: 20) |

### Example Request

```bash
curl -X POST "http://localhost:3000/api/bug-reports/list" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "open",
    "severity": "high",
    "limit": 10
  }'
```

### Example Response

```json
{
  "data": {
    "items": [
      {
        "id": "bug_abc123",
        "title": "Database connection timeout",
        "source": "auto:server",
        "severity": "high",
        "status": "open",
        "occurrenceCount": 5,
        "occurredAt": "2025-02-14T10:00:00Z",
        "createdAt": "2025-02-14T10:00:00Z"
      }
    ],
    "meta": {
      "page": 1,
      "limit": 10,
      "hasNextPage": true,
      "hasPrevPage": false
    }
  },
  "success": true,
  "status": 200
}
```

---

## Get Bug Report

<span className="api-method api-method--post">POST</span> `/bug-reports/get`

Returns a single bug report with full details.

### Body Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `bugReportId` | string | Yes | Bug report ID |

### Example Request

```bash
curl -X POST "http://localhost:3000/api/bug-reports/get" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "bugReportId": "bug_abc123" }'
```

### Example Response

```json
{
  "data": {
    "id": "bug_abc123",
    "workspaceId": "ws_123",
    "spaceId": "space_456",
    "reporterId": "user_789",
    "source": "auto:server",
    "severity": "high",
    "status": "open",
    "title": "Database connection timeout",
    "description": null,
    "errorMessage": "Connection timeout after 30000ms",
    "errorStack": "Error: Connection timeout...\n    at Database.connect...",
    "errorCode": "ETIMEDOUT",
    "userJourney": {
      "recentActions": [
        {
          "id": "mem_1",
          "source": "page-view",
          "summary": "Viewed page: API Documentation",
          "timestamp": "2025-02-14T09:55:00Z"
        },
        {
          "id": "mem_2",
          "source": "task-create",
          "summary": "Created task: Update endpoints",
          "timestamp": "2025-02-14T09:58:00Z"
        }
      ],
      "sessionStartedAt": "2025-02-14T09:00:00Z"
    },
    "context": {
      "endpoint": "/api/pages/create",
      "method": "POST"
    },
    "metadata": null,
    "occurrenceCount": 5,
    "occurredAt": "2025-02-14T10:00:00Z",
    "createdAt": "2025-02-14T10:00:00Z",
    "updatedAt": "2025-02-14T10:00:00Z",
    "resolvedAt": null,
    "reporter": {
      "id": "user_789",
      "name": "Jane Smith",
      "avatarUrl": "https://..."
    }
  },
  "success": true,
  "status": 200
}
```

---

## Create Bug Report

<span className="api-method api-method--post">POST</span> `/bug-reports/create`

Creates a user-reported bug. Automatically captures user journey context.

### Body Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `title` | string | Yes | Bug title |
| `description` | string | No | Detailed description |
| `source` | string | Yes | Report source (`user:command`) |
| `severity` | string | No | `low`, `medium`, `high`, `critical` (default: `medium`) |
| `spaceId` | string | No | Related space ID |
| `context` | object | No | Additional context data |

### Example Request

```bash
curl -X POST "http://localhost:3000/api/bug-reports/create" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Export button not working",
    "description": "When clicking Export on pages with tables, nothing happens",
    "source": "user:command",
    "severity": "high",
    "spaceId": "space_456",
    "context": {
      "pageId": "page_789"
    }
  }'
```

### Example Response

```json
{
  "data": {
    "id": "bug_def456",
    "title": "Export button not working",
    "source": "user:command",
    "severity": "high",
    "status": "open",
    "createdAt": "2025-02-14T11:00:00Z"
  },
  "success": true,
  "status": 201
}
```

---

## Create Auto Bug Report

<span className="api-method api-method--post">POST</span> `/bug-reports/auto`

Creates an automatically captured bug report. Used by error handlers.

### Body Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `source` | string | Yes | `auto:server`, `auto:client`, or `auto:agent` |
| `errorMessage` | string | No | Error message |
| `errorStack` | string | No | Stack trace |
| `errorCode` | string | No | Error code |
| `title` | string | No | Custom title (auto-generated if not provided) |
| `severity` | string | No | Auto-detected if not provided |
| `workspaceId` | string | No | Workspace context |
| `spaceId` | string | No | Space context |
| `context` | object | No | Additional context |
| `metadata` | object | No | System metadata |
| `occurredAt` | string | No | When the error occurred (default: now) |

### Example Request

```bash
curl -X POST "http://localhost:3000/api/bug-reports/auto" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "auto:client",
    "errorMessage": "Cannot read property \"length\" of undefined",
    "errorStack": "TypeError: Cannot read property...",
    "context": {
      "url": "https://app.example.com/pages/123",
      "userAgent": "Mozilla/5.0..."
    }
  }'
```

### Deduplication

If an identical error (same `errorMessage` and `source`) was reported within the last 24 hours, the existing report's occurrence count is incremented instead of creating a duplicate.

---

## Update Bug Report

<span className="api-method api-method--post">POST</span> `/bug-reports/update`

Updates a bug report's status, severity, or details.

### Body Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `bugReportId` | string | Yes | Bug report ID |
| `title` | string | No | New title |
| `description` | string | No | New description |
| `severity` | string | No | New severity |
| `status` | string | No | New status |

### Example Request

```bash
curl -X POST "http://localhost:3000/api/bug-reports/update" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "bugReportId": "bug_abc123",
    "status": "resolved"
  }'
```

When status is set to `resolved`, the `resolvedAt` timestamp is automatically set.

---

## Delete Bug Report

<span className="api-method api-method--post">POST</span> `/bug-reports/delete`

Soft-deletes a bug report.

### Body Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `bugReportId` | string | Yes | Bug report ID |

### Example Request

```bash
curl -X POST "http://localhost:3000/api/bug-reports/delete" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "bugReportId": "bug_abc123" }'
```

---

## Status Values

| Status | Description |
|--------|-------------|
| `open` | New, unreviewed |
| `triaged` | Reviewed and prioritized |
| `in_progress` | Being fixed |
| `resolved` | Fix deployed |
| `closed` | Closed |

## Severity Values

| Severity | Description |
|----------|-------------|
| `low` | Minor issue |
| `medium` | Moderate issue |
| `high` | Major issue |
| `critical` | System down |

## Source Values

| Source | Description |
|--------|-------------|
| `auto:server` | Server-side error capture |
| `auto:client` | Client-side error boundary |
| `auto:agent` | AI tool error |
| `user:command` | User-reported via `/bug` |
