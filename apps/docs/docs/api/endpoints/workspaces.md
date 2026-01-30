---
title: Workspaces
sidebar_position: 1
---

# Workspaces API

Manage workspaces and workspace members.

## List Workspaces

<span className="api-method api-method--get">GET</span> `/v1/workspaces`

Returns all workspaces the authenticated user belongs to.

### Example Request

```bash
curl "http://localhost:3000/api/workspaces" \
  -H "Authorization: Bearer $API_KEY"
```

### Example Response

```json
{
  "data": [
    {
      "id": "ws_abc123",
      "name": "Acme Corp",
      "hostname": "acme",
      "logoUrl": "https://...",
      "createdAt": "2024-06-15T10:00:00Z",
      "memberCount": 25,
      "role": "admin"
    }
  ]
}
```

---

## Get Workspace

<span className="api-method api-method--get">GET</span> `/v1/workspaces/:workspaceId`

Returns details for a specific workspace.

### Example Request

```bash
curl "http://localhost:3000/api/workspaces/ws_abc123" \
  -H "Authorization: Bearer $API_KEY"
```

### Example Response

```json
{
  "data": {
    "id": "ws_abc123",
    "name": "Acme Corp",
    "hostname": "acme",
    "logoUrl": "https://...",
    "description": "Acme's internal wiki",
    "createdAt": "2024-06-15T10:00:00Z",
    "updatedAt": "2025-01-10T09:00:00Z",
    "settings": {
      "defaultRole": "editor",
      "allowPublicPages": true
    },
    "memberCount": 25
  }
}
```

---

## Create Workspace

<span className="api-method api-method--post">POST</span> `/v1/workspaces`

Creates a new workspace.

### Body Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | Workspace name |
| `hostname` | string | Yes | Subdomain |
| `description` | string | No | Description |

### Example Request

```bash
curl -X POST "http://localhost:3000/api/workspaces" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "New Workspace",
    "hostname": "newworkspace"
  }'
```

---

## Update Workspace

<span className="api-method api-method--put">PUT</span> `/v1/workspaces/:workspaceId`

Updates workspace settings.

### Body Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | No | New name |
| `description` | string | No | New description |
| `settings` | object | No | Settings object |

---

## List Members

<span className="api-method api-method--get">GET</span> `/v1/workspaces/:workspaceId/members`

Returns all members of a workspace.

### Example Response

```json
{
  "data": [
    {
      "id": "user_123",
      "email": "john@acme.com",
      "name": "John Doe",
      "avatarUrl": "https://...",
      "role": "admin",
      "joinedAt": "2024-06-15T10:00:00Z"
    }
  ]
}
```

---

## Add Member

<span className="api-method api-method--post">POST</span> `/v1/workspaces/:workspaceId/members`

Adds a member to the workspace.

### Body Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userId` | string | Yes | User ID to add |
| `role` | string | Yes | Role: `admin`, `editor`, `viewer` |

---

## Change Member Role

<span className="api-method api-method--put">PUT</span> `/v1/workspaces/:workspaceId/members/:userId`

Changes a member's role.

### Body Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `role` | string | Yes | New role |

---

## Remove Member

<span className="api-method api-method--delete">DELETE</span> `/v1/workspaces/:workspaceId/members/:userId`

Removes a member from the workspace.
