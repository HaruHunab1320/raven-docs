---
title: Space Tools
sidebar_position: 2
---

# Space Tools

Tools for managing spaces within a workspace.

## space_list

List all spaces in a workspace.

```json
{
  "name": "space_list",
  "arguments": {
    "workspaceId": "ws_123",
    "page": 1,
    "limit": 20
  }
}
```

## space_create

Create a new space.

```json
{
  "name": "space_create",
  "arguments": {
    "workspaceId": "ws_123",
    "name": "Engineering",
    "description": "Technical documentation"
  }
}
```

## space_get

Get space details.

```json
{
  "name": "space_get",
  "arguments": {
    "workspaceId": "ws_123",
    "spaceId": "space_456"
  }
}
```

## space_update

Update space settings.

```json
{
  "name": "space_update",
  "arguments": {
    "workspaceId": "ws_123",
    "spaceId": "space_456",
    "name": "New Name",
    "description": "Updated description"
  }
}
```

## space_delete

Delete a space.

```json
{
  "name": "space_delete",
  "arguments": {
    "workspaceId": "ws_123",
    "spaceId": "space_456"
  }
}
```

## space_members

List space members.

```json
{
  "name": "space_members",
  "arguments": {
    "workspaceId": "ws_123",
    "spaceId": "space_456"
  }
}
```

## space_members_add

Add members to a space.

```json
{
  "name": "space_members_add",
  "arguments": {
    "workspaceId": "ws_123",
    "spaceId": "space_456",
    "userIds": ["user_789"],
    "role": "editor"
  }
}
```

## space_members_remove

Remove a member from a space.

```json
{
  "name": "space_members_remove",
  "arguments": {
    "workspaceId": "ws_123",
    "spaceId": "space_456",
    "userId": "user_789"
  }
}
```

## space_change_member_role

Change a member's role.

```json
{
  "name": "space_change_member_role",
  "arguments": {
    "workspaceId": "ws_123",
    "spaceId": "space_456",
    "userId": "user_789",
    "role": "admin"
  }
}
```

## space_update_permissions

Update permissions for a user or group.

```json
{
  "name": "space_update_permissions",
  "arguments": {
    "workspaceId": "ws_123",
    "spaceId": "space_456",
    "targetId": "user_789",
    "role": "viewer",
    "isGroup": false
  }
}
```
