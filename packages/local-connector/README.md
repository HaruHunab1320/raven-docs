# @raven-docs/local-connector

Minimal CLI scaffold for Raven local sync development.

## Environment

- `RAVEN_SERVER_URL` (default: `http://localhost:3000`)
- `RAVEN_WORKSPACE` (workspace context header value)
- `RAVEN_JWT` (JWT for authenticated local-sync endpoints)

## Commands

```bash
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

## Daemon Mode

`daemon` performs periodic scans of `rootDir` for `.md` files, tracks local hashes, and flushes changed files to `sources/push-batch`.

Current behavior:
- Uses previous remote hash as `baseHash` when available
- Skips `.git` and `node_modules`
- Persists local state and queue to `.raven-local-sync-state.json` in the root folder
- Retries failed flushes with exponential backoff

This is Phase 1 scaffolding and will evolve into native file watchers + richer conflict workflows.
