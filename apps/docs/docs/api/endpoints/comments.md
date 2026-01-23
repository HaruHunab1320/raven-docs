---
title: Comments
sidebar_position: 6
---

# Comments API

Manage comments on pages.

## List Comments

<span className="api-method api-method--get">GET</span> `/v1/comments`

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pageId` | string | Yes | Page ID |
| `workspaceId` | string | Yes | Workspace ID |

---

## Create Comment

<span className="api-method api-method--post">POST</span> `/v1/comments`

### Body Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pageId` | string | Yes | Page ID |
| `workspaceId` | string | Yes | Workspace ID |
| `text` | string | Yes | Comment text |
| `parentId` | string | No | Parent comment for replies |

---

## Update Comment

<span className="api-method api-method--put">PUT</span> `/v1/comments/:commentId`

---

## Delete Comment

<span className="api-method api-method--delete">DELETE</span> `/v1/comments/:commentId`

---

## Resolve Comment

<span className="api-method api-method--post">POST</span> `/v1/comments/:commentId/resolve`

### Body Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `workspaceId` | string | Yes | Workspace ID |
| `resolved` | boolean | Yes | Resolve status |
