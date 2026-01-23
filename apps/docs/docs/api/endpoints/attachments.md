---
title: Attachments
sidebar_position: 7
---

# Attachments API

Manage file attachments on pages.

## List Attachments

<span className="api-method api-method--get">GET</span> `/v1/attachments`

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pageId` | string | Yes | Page ID |
| `workspaceId` | string | Yes | Workspace ID |

---

## Get Attachment

<span className="api-method api-method--get">GET</span> `/v1/attachments/:attachmentId`

---

## Upload Attachment

<span className="api-method api-method--post">POST</span> `/v1/attachments`

### Body Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pageId` | string | Yes | Page ID |
| `workspaceId` | string | Yes | Workspace ID |
| `filename` | string | Yes | File name |
| `contentType` | string | Yes | MIME type |
| `data` | string | Yes | Base64-encoded data |

---

## Download Attachment

<span className="api-method api-method--get">GET</span> `/v1/attachments/:attachmentId/download`

Returns the file content.

---

## Delete Attachment

<span className="api-method api-method--delete">DELETE</span> `/v1/attachments/:attachmentId`
