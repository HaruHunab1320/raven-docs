# Discord Integration (MVP)

Status: Implemented in server + workspace settings panel.

## Goals
- Bring Raven Docs agent capabilities into Discord for mobile/away-from-desk use.
- Enable lightweight approvals without opening the web app.
- Push research status and summaries into channels.

## Non-goals (MVP)
- Full task/project management from Discord.
- Rich document editing in Discord.
- Multi-workspace Discord federation.

## Core User Flows
1) Ask Raven (read-only)
- Users query the agent for summaries/status.
- Responses include references to pages/projects when possible.

2) Research status + results
- When a research task starts, post a short status update.
- When finished, post a summary + link to the page.

3) Approval requests
- When the agent needs approval to run MCP tools, it posts a request.
- Users can approve/deny directly in Discord.

## Discord UX
- Slash command: `/raven` (subcommands configured in Discord).
- Channel notifications for research + approvals.

### Commands (recommended)
- `/raven ask <question>`
- `/raven research <query>`
- `/raven approve <token>`
- `/raven reject <token>`

## Permissions & Security
- Discord guild mapping to Raven Docs workspace.
- Enforce Raven user mapping via default user id in settings (MVP).
- MCP tool calls from Discord are always gated by approval unless auto-approve is enabled in the workspace.

## MVP Architecture
- Discord app with bot token + public key + application id.
- Webhook endpoint in Raven Docs server:
  - `POST /api/integrations/discord/interactions`
- Outbound Discord notifier service for:
  - research status
  - approvals
  - agent updates

## Data Model (current)
Stored in `workspace.settings.integrations.discord`:
- enabled
- guildId
- botToken
- publicKey
- applicationId
- defaultChannelId
- defaultUserId

`defaultUserId` is used as the Raven Docs identity for Discord-triggered actions in the MVP.

## Testing Checklist
- Register a Discord app + commands in a test guild.
- `/raven ask` returns an answer and logs a memory.
- `/raven research` creates a research job and posts a completion message.
- Approval request posts buttons; approve triggers MCP tool call.

## Open Questions
- Should Discord approvals also appear in the in-app approvals queue? (Suggested: yes.)
- Should Discord be allowed to auto-approve in any workspace? (Suggested: admin-only toggle.)
