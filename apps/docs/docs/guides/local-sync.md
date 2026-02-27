---
title: Local Sync
---

# Local Sync

Local Sync connects a local folder (for example a markdown-heavy research repo) to Raven Docs.

## What It Enables

- Sync local `.md` files into Raven
- Resolve sync conflicts from Raven settings
- In bidirectional mode, edit synced files in Raven and have the connector write changes back locally
- Keep an event history and per-file version snapshots in Raven

## Sync Modes

### `import_only`

- Local changes sync to Raven
- Raven-side file editing is blocked

### `local_to_cloud`

- Local changes sync to Raven
- Raven-side file editing is blocked

### `bidirectional`

- Local changes sync to Raven
- Raven changes are emitted as deltas and written back locally by the connector

## Setup

1. Register a connector with a valid JWT and workspace header context.
2. Create a local sync source and choose mode.
3. Run the connector daemon against a local root directory.
4. Open `Settings -> Local Sync` in Raven to view files, conflicts, and manual resolution tools.

## Connector Behavior

- Performs periodic scans for markdown files
- Uses durable state queue in `.raven-local-sync-state.json`
- Retries failed pushes with exponential backoff
- Tracks remote event cursor for catch-up pull
- Syncs deletes (`file.delete`) in both directions
- Sends periodic connector heartbeat updates

## Hardening Controls

The connector supports operational limits through environment variables:

- `RAVEN_MAX_FILE_BYTES` (default `1000000`)
- `RAVEN_MAX_FILES_PER_SCAN` (default `10000`)

It also applies:

- Source include/exclude patterns
- `.gitignore` rules from the synced root
- Built-in excludes for `.git` and `node_modules`

## Conflict Model

Conflicts are detected when a pushed change is based on a stale hash. Raven opens a conflict record and requires explicit resolution:

- Keep Local
- Keep Raven
- Manual Merge

After resolution, Raven emits a follow-up `file.upsert` event so connectors can converge.
