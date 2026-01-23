---
title: Page Tools
sidebar_position: 3
---

# Page Tools

Tools for managing pages and content.

## page_list

List pages in a space.

```json
{
  "name": "page_list",
  "arguments": {
    "workspaceId": "ws_123",
    "spaceId": "space_456",
    "page": 1,
    "limit": 20
  }
}
```

## page_get

Get a page with content.

```json
{
  "name": "page_get",
  "arguments": {
    "pageId": "page_789"
  }
}
```

## page_create

Create a new page.

```json
{
  "name": "page_create",
  "arguments": {
    "workspaceId": "ws_123",
    "spaceId": "space_456",
    "title": "New Page",
    "content": {
      "type": "doc",
      "content": [
        {
          "type": "paragraph",
          "content": [{ "type": "text", "text": "Hello world!" }]
        }
      ]
    }
  }
}
```

## page_update

Update a page.

```json
{
  "name": "page_update",
  "arguments": {
    "pageId": "page_789",
    "workspaceId": "ws_123",
    "title": "Updated Title",
    "content": { ... }
  }
}
```

## page_delete

Delete a page.

```json
{
  "name": "page_delete",
  "arguments": {
    "pageId": "page_789",
    "workspaceId": "ws_123"
  }
}
```

## page_move

Move a page to a new location.

```json
{
  "name": "page_move",
  "arguments": {
    "pageId": "page_789",
    "workspaceId": "ws_123",
    "parentId": "page_456",
    "spaceId": "space_new"
  }
}
```

## page_search

Search pages by content.

```json
{
  "name": "page_search",
  "arguments": {
    "query": "authentication",
    "spaceId": "space_456",
    "limit": 10
  }
}
```

## page_get_history

Get page revision history.

```json
{
  "name": "page_get_history",
  "arguments": {
    "pageId": "page_789",
    "limit": 10
  }
}
```

## page_restore

Restore a page to a previous version.

```json
{
  "name": "page_restore",
  "arguments": {
    "historyId": "hist_123"
  }
}
```

## page_recent

Get recently updated pages.

```json
{
  "name": "page_recent",
  "arguments": {
    "spaceId": "space_456",
    "limit": 10
  }
}
```

## page_breadcrumbs

Get page breadcrumb path.

```json
{
  "name": "page_breadcrumbs",
  "arguments": {
    "pageId": "page_789"
  }
}
```

## page_sidebar_pages

Get pages for sidebar navigation.

```json
{
  "name": "page_sidebar_pages",
  "arguments": {
    "workspaceId": "ws_123",
    "spaceId": "space_456"
  }
}
```
