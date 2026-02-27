---
title: Local Sync
sidebar_position: 12
---

# Local Sync API

Local Sync APIs are available under `/api/local-sync/*`.

All endpoints require:

- `Authorization: Bearer <JWT>`
- `x-workspace-id: <workspace-id>`

## Connector Endpoints

### `POST /local-sync/connectors/register`

Registers a connector instance.

Request body:

```json
{
  "name": "macbook-pro",
  "platform": "darwin",
  "version": "0.1.0"
}
```

### `POST /local-sync/connectors/heartbeat`

Updates connector liveness.

Request body:

```json
{
  "connectorId": "uuid"
}
```

## Source Management

### `POST /local-sync/sources`

Creates a sync source.

Request body:

```json
{
  "name": "Research Vault",
  "mode": "bidirectional",
  "connectorId": "uuid",
  "includePatterns": ["**/*.md"],
  "excludePatterns": ["**/.git/**", "**/node_modules/**"]
}
```

### `POST /local-sync/sources/list`

Lists sources for the workspace.

### `POST /local-sync/sources/pause`

Pauses syncing for a source.

### `POST /local-sync/sources/resume`

Resumes syncing for a source.

## File Sync

### `POST /local-sync/sources/files`

Lists synced files for a source.

### `POST /local-sync/sources/file`

Returns a synced file content record.

Request body:

```json
{
  "sourceId": "uuid",
  "relativePath": "research/notes.md"
}
```

### `POST /local-sync/sources/file/update`

Updates a synced file from Raven-side editing. Allowed only for `bidirectional` sources.

Request body:

```json
{
  "sourceId": "uuid",
  "relativePath": "research/notes.md",
  "content": "# Updated content",
  "baseHash": "optional-last-synced-hash"
}
```

Possible outcomes:

- `status: "ok"` when applied
- `status: "conflict"` when base hash is stale and manual resolution is required

### `POST /local-sync/sources/push-batch`

Pushes connector operations (upserts/deletes).

Request body:

```json
{
  "sourceId": "uuid",
  "items": [
    {
      "operationId": "op-123",
      "relativePath": "research/notes.md",
      "content": "markdown content",
      "contentType": "text/markdown",
      "contentHash": "sha256",
      "baseHash": "optional-base-hash",
      "isDelete": false
    }
  ]
}
```

### `POST /local-sync/sources/deltas`

Returns ordered events after a cursor (`file.upsert`, `file.delete`, conflict/source events).

## Conflicts & History

### `POST /local-sync/sources/conflicts`

Lists open conflicts for a source.

### `POST /local-sync/sources/conflicts/preview`

Returns line-level preview for a conflict.

### `POST /local-sync/sources/conflicts/resolve`

Resolves conflict with:

- `keep_local`
- `keep_raven`
- `manual_merge` (+ `resolvedContent`)

### `POST /local-sync/sources/history`

Returns version snapshots for a synced file path.
