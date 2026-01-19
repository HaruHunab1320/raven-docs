# System Risks + Remediation Order

This document lists the highest‑impact risks discovered during the code audit
and proposes a remediation order. It is meant to drive short‑term stabilization
work.

## P0 (Stability / Data Integrity)

1) **Policy + approvals enforcement**
   - Risk: misconfigured policy can bypass approvals or block legitimate actions.
   - Fix: add integration tests for allow/approve/deny flows.
   - Status: **Resolved**. Unit tests cover allow/deny/approval/invalid token flows in `apps/server/src/integrations/mcp/mcp.service.spec.ts`.
   - Owner: Agent/MCP layer (Agent + MCP team).

2) **Agent memory ingestion**
   - Risk: invalid JSON payloads can break memory persistence.
   - Fix: validate JSON payloads before inserts; guard AI outputs.
   - Status: **Resolved**. Memory ingestion normalizes non‑JSON payloads and falls back to text when payloads are not serializable.
   - Owner: Agent memory service (Agent team).

3) **MCP event loop + logging noise**
   - Risk: high console logging can overwhelm dev UX and degrade perf.
   - Fix: gate logs behind env flag; reduce per‑event spam.
   - Status: **Resolved**. Logs are gated behind `VITE_ENABLE_LOGS`.
   - Owner: Websocket client hooks (Frontend team).

## P1 (Product Gaps)

1) **Task label CRUD**
   - Status: **Resolved**. Task drawer label manager wired to label CRUD endpoints.
   - QA: recommended as part of the UI audit.
   - Owner: Project/task feature (Frontend + Backend).

2) **Page ↔ task list sync**
   - Status: **Resolved**. Task extraction uses stable pageTaskId values for new items with
     legacy title fallback for older pages.
   - QA: recommended for legacy fallback behavior.
   - Owner: Editor + task services (Editor + Backend).

3) **Permissions QA**
   - Status: **Resolved**. MCP guard resolves scope for space/page/project/task/comment/attachment/research.
   - QA: recommended to validate scope resolution in runtime flows.
   - Owner: MCP integration (Backend).

## P2 (UX + Ops)

1) **Autonomy scheduling clarity**
   - Risk: users assume autonomy runs without cadence settings.
   - Fix: surface schedule defaults + “last run” hints in settings UI.
   - Status: **Resolved**. Settings UI shows cadence, timezone, and last run timestamps.
   - Owner: Agent settings UI (Frontend).

2) **Docs drift**
   - Risk: multiple MCP docs caused confusion.
   - Fix: keep `docs/MCP.md` canonical and link all other references there.
   - Status: **Resolved**.
   - Owner: Docs (Platform/Docs).

## Suggested Remediation Order

Remaining items to validate in product QA (optional):

1) Task label CRUD UX.
2) Page ↔ task list sync legacy fallback.
3) MCP permission guard scope resolution.
4) Autonomy schedule UX.
