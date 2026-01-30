---
title: Spaces
sidebar_position: 2
---

# Spaces API

Manage spaces within a workspace.

## List Spaces

<span className="api-method api-method--get">GET</span> `/v1/spaces`

Returns all spaces in a workspace.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspaceId` | string | Yes | Workspace ID |

### Example Request

```bash
curl "http://localhost:3000/api/spaces?workspaceId=ws_123" \
  -H "Authorization: Bearer $API_KEY"
```

### Example Response

```json
{
  "data": [
    {
      "id": "space_abc123",
      "name": "Engineering",
      "slug": "engineering",
      "description": "Technical documentation",
      "icon": "code",
      "visibility": "public",
      "workspaceId": "ws_123",
      "createdAt": "2024-08-01T10:00:00Z",
      "pageCount": 45
    }
  ]
}
```

---

## Get Space

<span className="api-method api-method--get">GET</span> `/v1/spaces/:spaceId`

Returns details for a specific space.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `spaceId` | string | Yes | Space ID |
| `workspaceId` | query | Yes | Workspace ID |

### Example Response

```json
{
  "data": {
    "id": "space_abc123",
    "name": "Engineering",
    "slug": "engineering",
    "description": "Technical documentation and guides",
    "icon": "code",
    "visibility": "public",
    "workspaceId": "ws_123",
    "createdAt": "2024-08-01T10:00:00Z",
    "updatedAt": "2025-01-15T14:00:00Z",
    "pageCount": 45,
    "memberCount": 12
  }
}
```

---

## Create Space

<span className="api-method api-method--post">POST</span> `/v1/spaces`

Creates a new space.

### Body Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspaceId` | string | Yes | Workspace ID |
| `name` | string | Yes | Space name |
| `description` | string | No | Space description |
| `slug` | string | No | URL slug (auto-generated if omitted) |
| `icon` | string | No | Emoji or icon |
| `visibility` | string | No | `public` or `private` |

### Example Request

```bash
curl -X POST "http://localhost:3000/api/spaces" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "workspaceId": "ws_123",
    "name": "Product",
    "description": "Product documentation and specs",
    "visibility": "public"
  }'
```

---

## Update Space

<span className="api-method api-method--put">PUT</span> `/v1/spaces/:spaceId`

Updates an existing space.

### Body Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspaceId` | string | Yes | Workspace ID |
| `name` | string | No | New name |
| `description` | string | No | New description |
| `icon` | string | No | New icon |
| `visibility` | string | No | New visibility |

---

## Delete Space

<span className="api-method api-method--delete">DELETE</span> `/v1/spaces/:spaceId`

Deletes a space and all its pages.

:::danger
This action is irreversible. All pages in the space will be deleted.
:::

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `spaceId` | string | Yes | Space ID |
| `workspaceId` | query | Yes | Workspace ID |

---

## List Space Members

<span className="api-method api-method--get">GET</span> `/v1/spaces/:spaceId/members`

Returns members with access to this space.

### Example Response

```json
{
  "data": [
    {
      "id": "user_123",
      "name": "John Doe",
      "email": "john@acme.com",
      "role": "admin",
      "addedAt": "2024-08-01T10:00:00Z"
    }
  ]
}
```

---

## Add Space Member

<span className="api-method api-method--post">POST</span> `/v1/spaces/:spaceId/members`

Adds a member to the space.

### Body Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspaceId` | string | Yes | Workspace ID |
| `userIds` | string[] | No | User IDs to add |
| `groupIds` | string[] | No | Group IDs to add |
| `role` | string | Yes | Role: `admin`, `editor`, `viewer` |

---

## Update Space Permissions

<span className="api-method api-method--put">PUT</span> `/v1/spaces/:spaceId/permissions`

Updates permissions for a user or group.

### Body Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspaceId` | string | Yes | Workspace ID |
| `targetId` | string | Yes | User or group ID |
| `role` | string | Yes | New role |
| `isGroup` | boolean | No | True if targetId is a group |

---

## Remove Space Member

<span className="api-method api-method--delete">DELETE</span> `/v1/spaces/:spaceId/members/:userId`

Removes a member from the space.
