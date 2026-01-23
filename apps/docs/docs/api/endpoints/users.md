---
title: Users
sidebar_position: 5
---

# Users API

Manage workspace users.

## List Users

<span className="api-method api-method--get">GET</span> `/v1/users`

Returns users in a workspace.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspaceId` | string | Yes | Workspace ID |
| `query` | string | No | Search by name or email |

### Example Response

```json
{
  "data": [
    {
      "id": "user_123",
      "email": "john@acme.com",
      "name": "John Doe",
      "avatarUrl": "https://...",
      "role": "editor",
      "createdAt": "2024-06-15T10:00:00Z"
    }
  ]
}
```

---

## Get User

<span className="api-method api-method--get">GET</span> `/v1/users/:userId`

Returns a single user.

---

## Update User

<span className="api-method api-method--put">PUT</span> `/v1/users/:userId`

Updates user profile.

### Body Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | No | Display name |
| `avatarUrl` | string | No | Avatar URL |
