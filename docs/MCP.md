# Model Context Protocol (MCP)

This is the canonical MCP reference for Raven Docs. It replaces legacy MCP
readmes and integration summaries.

## Overview

Raven Docs exposes MCP Standard directly at `/api/mcp-standard/*`. Internally it
uses MCP services + handlers and a WebSocket event gateway for real-time updates.

## Architecture (High Level)

- **MCP Standard** (`apps/server/src/integrations/mcp-standard`): Public MCP
  interface for AI tools.
- **MCP Core Services** (`apps/server/src/integrations/mcp`): Shared services
  and handlers used by MCP Standard + agent workflows.
- **WebSocket Events** (`apps/server/src/integrations/mcp/mcp-websocket.gateway.ts`):
  real-time events for pages, tasks, spaces, etc.
- **Approvals + Policy**: Sensitive actions require approval tokens; policy
  rules are enforced by the MCP gateway and the agent loop.

## Endpoints

- `POST /api/mcp-standard/initialize`
- `POST /api/mcp-standard/list_tools`
- `POST /api/mcp-standard/call_tool`
- `POST /api/mcp-standard/list_resources`
- `POST /api/mcp-standard/read_resource`
- `POST /api/mcp-standard/subscribe`
- `POST /api/mcp-standard/unsubscribe`
- `POST /api/mcp-standard/list_prompts`
- `POST /api/mcp-standard/get_prompt`
- `POST /api/mcp-standard/complete`

## Authentication

Use API keys:

```
Authorization: Bearer mcp_your_api_key_here
```

API keys are associated with a user + workspace and enforce the same
permissions as the issuing user.

### API Key System (Summary)

- Prefix: `mcp_` identifies MCP API keys.
- Storage: Only hashed keys are stored (linked to user + workspace).
- Guards: `MCPAuthGuard` (JWT first, API key fallback) + `MCPApiKeyGuard` +
  `MCPPermissionGuard` enforce access.
- Lifecycle: Keys are created in Workspace Settings → API Keys or via
  `/api/api-keys/register` with a registration token.

### Example (MCP Standard)

```bash
curl -X POST http://localhost:3000/api/mcp-standard/call_tool \
  -H "Authorization: Bearer mcp_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "page_list",
    "arguments": {}
  }'
```

## Approvals + Policy

Some methods require approvals. When a tool needs approval, the server returns
an `APPROVAL_REQUIRED` error with `approvalToken` and `expiresAt`.

Policy is enforced in:
- The **agent loop** (auto-apply vs approval vs deny).
- The **MCP gateway** (requests require approval or are denied).

Policy rules are configured in Workspace Settings → Agent Settings:
- **Allow auto-apply**: methods that can run without approval.
- **Require approval**: methods that must be approved.
- **Deny**: methods blocked entirely.

## Tool Coverage

MCP Standard exposes all tool methods. Core tool groups include:

- Spaces, Pages, Comments, Attachments
- Projects + Tasks (including triage summary)
- Users, Groups, Workspaces
- Search, Import/Export
- Memory (ingest/query/daily/days)
- Approvals, Context, System, Navigation

Coverage currently includes all former internal MCP methods now exposed
through MCP Standard. Remaining gaps are limited to auth/billing and
admin-only configuration flows.

## WebSocket Events

Events are emitted for changes made via MCP and propagate to the client.

Event flow:
1) MCP handler performs action.
2) MCP event service emits `mcp:event`.
3) WebSocket gateway broadcasts to workspace rooms.
4) Client hooks update UI.

Key event groups: spaces, pages, comments, attachments, tasks, UI navigation.

## Test Data (MCP Standard)

Use the test data scripts in `scripts/` to seed a workspace, user, and API key:

```bash
./scripts/setup-mcp-test-data-simple.sh
```

This creates a workspace, admin user, and default space, then prompts to
create an MCP API key.

## Quick Start (Cursor Example)

```json
{
  "mcpServers": {
    "raven-docs": {
      "url": "http://localhost:3000/api/mcp-standard",
      "apiKey": "mcp_your_api_key_here"
    }
  }
}
```
