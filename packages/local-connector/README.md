# @raven-docs/local-connector

Minimal CLI scaffold for Raven local sync development.

## Environment

- `RAVEN_SERVER_URL` (default: `http://localhost:3000`)
- `RAVEN_WORKSPACE` (workspace context header value)
- `RAVEN_JWT` (JWT for authenticated local-sync endpoints)
- `RAVEN_MAX_FILE_BYTES` (optional, default `1000000`)
- `RAVEN_MAX_FILES_PER_SCAN` (optional, default `10000`)

## Commands

```bash
pnpm --filter @raven-docs/local-connector start init
pnpm --filter @raven-docs/local-connector start connect [connectorName] [sourceName] [mode] [rootDir]
pnpm --filter @raven-docs/local-connector start start [sourceId] [rootDir] [intervalMs]
pnpm --filter @raven-docs/local-connector start status
pnpm --filter @raven-docs/local-connector start doctor
pnpm --filter @raven-docs/local-connector start quickstart [serverUrl] [workspaceId] [rootDir] [mode] [intervalMs]
pnpm --filter @raven-docs/local-connector start register [name]
pnpm --filter @raven-docs/local-connector start heartbeat <connectorId>
pnpm --filter @raven-docs/local-connector start create-source <connectorId> <name> [mode]
pnpm --filter @raven-docs/local-connector start list-sources
pnpm --filter @raven-docs/local-connector start push-batch <sourceId> <relativePath> [content]
pnpm --filter @raven-docs/local-connector start sync-file <sourceId> <relativePath> <localFilePath> [baseHash]
pnpm --filter @raven-docs/local-connector start deltas <sourceId> [cursor] [limit]
pnpm --filter @raven-docs/local-connector start conflicts <sourceId>
pnpm --filter @raven-docs/local-connector start daemon <sourceId> <rootDir> [intervalMs]
```

## End-User CLI Flow

For a low-friction CLI setup, run:

```bash
pnpm --filter @raven-docs/local-connector start init
pnpm --filter @raven-docs/local-connector start connect
pnpm --filter @raven-docs/local-connector start start
```

Configuration is saved to:

`~/.config/raven-sync/config.json`

For an all-in-one guided flow:

```bash
pnpm --filter @raven-docs/local-connector start quickstart
```

## Daemon Mode

`daemon` performs periodic scans of `rootDir` for `.md` files, tracks local hashes, and flushes changed files to `sources/push-batch`.

Current behavior:
- Uses previous remote hash as `baseHash` when available
- Skips `.git` and `node_modules`
- Applies source include/exclude patterns
- Applies `.gitignore` rules in the synced root
- Skips files above `RAVEN_MAX_FILE_BYTES`
- Caps scan size by `RAVEN_MAX_FILES_PER_SCAN`
- Persists local state and queue to `.raven-local-sync-state.json` in the root folder
- Retries failed flushes with exponential backoff
- Sends periodic connector heartbeat updates
- Applies remote `file.delete` deltas and queues local delete operations

This is Phase 1 scaffolding and will evolve into native file watchers + richer conflict workflows.
