# Local Connector Sync Plan

## Goal
Enable Raven Docs to sync selected local folders/files (especially markdown-heavy research repos) while preserving Raven's web app architecture.

This plan defines:
- Sync behavior (import-only, one-way, bidirectional)
- Conflict and offline semantics
- Data/API contracts
- Security boundaries
- Phased implementation

## Non-Goals (v1)
- Full git-native collaboration UX inside Raven
- Binary document semantic merge (PDF/DOCX)
- Cross-device local folder sync without a connector

## Product Modes

### 1) Import-only
- Local files can be indexed/ingested into Raven.
- Raven edits do not write back to local disk.
- Lowest risk, fastest to ship.

### 2) Local -> Cloud (mirror upstream)
- Local changes sync to Raven.
- Raven edits are blocked or stored as derived notes.
- Useful for "local repo is source of truth" teams.

### 3) Bidirectional (recommended advanced mode)
- Local and Raven can both edit synced files.
- Requires robust conflict handling and explicit merge policy.

## High-Level Architecture

1. `raven-connector` (local daemon on macOS first)
- User authorizes folder roots.
- Performs file discovery, watch, hashing, and local change journal.
- Sends authenticated sync batches to Raven.

2. Raven Server Sync Module (new)
- Stores sync metadata and per-file cursor state.
- Exposes delta APIs for connector pull/push.
- Emits remote change feed for connector catch-up.

3. Raven Client UI
- "Local Sources" settings panel.
- Sync status, last sync time, and conflict inbox.
- Optional file-tree browser for connected roots.

## Source of Truth Model
Each synced file has a stable `syncFileId` and a tracked base revision.

Key idea: do not resolve conflicts by timestamp alone.
Use a 3-way comparison:
- `base`: last known synced content hash
- `local`: current local version
- `remote`: current Raven version

Decision matrix:
- Local changed only: push local to Raven
- Remote changed only: pull remote to local (if mode allows)
- Both changed: run merge flow

## Conflict Strategy

### Automatic path
- Attempt 3-way text merge for `.md`, `.txt`, `.json`, `.yaml`, code files.
- If clean: apply merged content, record new base hash.

### Manual path
When auto-merge fails:
- Keep both versions
- Create conflict artifacts:
  - Local: `filename.conflict-<timestamp>.md` (or sidecar)
  - Raven: conflict record + preview
- Surface in "Conflict Inbox"
- User resolves with one action:
  - Keep Local
  - Keep Raven
  - Manual edit merge

## Offline Semantics

### Connector offline
- Connector writes local edits to a durable queue (SQLite journal).
- On reconnect, it pushes queued local ops and pulls remote deltas since `lastRemoteCursor`.

### Raven side changes while connector offline
- Server stores ordered change feed per connection/source.
- Connector resumes using cursor/token.

### Guarantees
- At-least-once delivery from connector queue.
- Idempotent apply via operation IDs and content hashes.
- Deterministic conflict detection via `base/local/remote` comparison.

## Versioning and History

Default (no git required):
- Raven stores file version snapshots/diffs for synced files.
- Connector stores short local operation journal for replay/rollback.

Optional git mode (v2):
- If root is a git repo and user enables it, connector can commit sync batches.
- Unresolved conflicts can be placed on a dedicated branch.

## Security Model

- Explicit local folder allowlist (no unrestricted FS access).
- Per-connector scoped token (workspace + source).
- Path canonicalization + traversal prevention.
- File extension and max-size filters.
- Audit log for read/write/sync/conflict actions.
- Token revocation from Raven UI immediately disables connector.

## Data Model (proposed)

### `local_sync_sources`
- `id`
- `workspace_id`
- `created_by_id`
- `name`
- `mode` (`import_only | local_to_cloud | bidirectional`)
- `connector_id`
- `status`
- `last_remote_cursor`
- `created_at`, `updated_at`

### `local_sync_files`
- `id` (`syncFileId`)
- `source_id`
- `relative_path`
- `content_type`
- `last_synced_hash`
- `last_local_hash`
- `last_remote_hash`
- `last_synced_at`
- `state` (`ok | conflict | paused`)

### `local_sync_events`
- append-only stream for replay/debug
- includes op id, actor, timestamp, hashes, result

### `local_sync_conflicts`
- `file_id`
- `base_hash`, `local_hash`, `remote_hash`
- `status` (`open | resolved`)
- `resolution` metadata

## API Surface (proposed)

Connector auth:
- `POST /api/local-sync/connectors/register`
- `POST /api/local-sync/connectors/heartbeat`

Push/pull sync:
- `POST /api/local-sync/sources/:id/push-batch`
- `GET /api/local-sync/sources/:id/deltas?cursor=...`
- `POST /api/local-sync/conflicts/:id/resolve`

Management:
- `POST /api/local-sync/sources`
- `GET /api/local-sync/sources`
- `GET /api/local-sync/sources/:id/files`
- `POST /api/local-sync/sources/:id/pause`
- `POST /api/local-sync/sources/:id/resume`

## File Tree UX Plan

- Reuse existing tree patterns/components (`react-arborist`-based page tree) for local source explorer.
- Show per-node badges:
  - synced
  - pending upload
  - pending download
  - conflict
- Add quick actions:
  - Open in Raven
  - Reveal conflict
  - Exclude path

## Phased Delivery

### Phase 0: Design + Contracts (this doc)
- Finalize modes and conflict policy.
- Finalize API and schema.

### Phase 1: Import-only MVP (fastest value)
- Connector can watch + upload `.md` changes.
- Raven indexes content and displays status.
- No writeback to local.

### Phase 2: One-way local->cloud reliability
- Durable queue, retry/backoff, idempotency keys.
- Remote deltas endpoint and cursoring.

### Phase 3: Bidirectional sync
- Remote writeback to local.
- 3-way merge and conflict inbox.

### Phase 4: Hardening
- Performance tuning on large trees.
- Better ignore patterns (`.gitignore` support + custom).
- Observability dashboards + admin controls.

## Implementation Notes Against Current Repo

- Existing remote repo browsing can inspire tree/read contracts but currently targets GitHub/GitLab/Bitbucket only.
- Existing MCP Standard `attachment_upload` supports base64 payloads and can be reused for ingestion bridging.
- Existing knowledge source type `file` currently has extraction TODO; v1 should focus on markdown/text ingestion path.

## Open Questions

1. Should bidirectional mode be opt-in per source and default to import-only?
2. Should Raven edits to synced files be restricted to a dedicated editor mode (to reduce conflicts)?
3. What is the max supported file count per source for v1 target SLA?
4. Do we need workspace policy controls (admins can disable local sync)?

## Recommendation

Ship in order:
1. Import-only
2. Local -> cloud reliable sync
3. Bidirectional with 3-way merge

This sequence delivers user value quickly while avoiding unsafe "last write wins" behavior.
