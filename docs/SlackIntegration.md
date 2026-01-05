# Slack Integration (MVP)

## Goals
- Bring Raven Docs agent capabilities into Slack for mobile/away-from-desk use.
- Enable lightweight approvals without opening the web app.
- Push research status, task updates, and summaries into team channels.

## Non-goals (MVP)
- Full task/project management from Slack.
- Rich document editing in Slack.
- Multi-workspace Slack federation.

## Core User Flows
1) Ask Raven (read-only)
- Users can query the agent for summaries, status, or searches.
- Responses include references to pages/projects when possible.

2) Research status + results
- When a research task starts, the agent posts a short status update.
- When finished, the agent posts a summary + link to the page.

3) Approval requests
- When the agent needs approval to run MCP tools, it posts a request.
- Users can approve/deny directly in Slack (interactive buttons).

4) Quick capture (optional MVP)
- Create a task or note from a Slack message with explicit confirmation.

## Slack UX
- Slash command: `/raven` with subcommands (see Commands).
- DM bot for conversational mode.
- Channel notifications for research + approvals.

### Commands
- `/raven ask <question>`
  - Read-only summary/answer.
- `/raven project <name>`
  - Show project summary + open tasks.
- `/raven research <query>`
  - Create a research task and post updates.
- `/raven approve <id>` / `/raven reject <id>`
  - Approve/deny pending agent actions.

## Permissions & Security
- Slack workspace mapping to Raven Docs workspace.
- Enforce user identity mapping (Slack user -> Raven user).
- MCP tool calls from Slack are always gated by explicit approval unless the
  workspace admin enables auto-approve for Slack.

## MVP Architecture
- Slack app with bot token + signing secret.
- Webhook endpoints in Raven Docs server:
  - `POST /api/integrations/slack/events`
  - `POST /api/integrations/slack/commands`
  - `POST /api/integrations/slack/interactions`
- Outbound Slack notifier service for:
  - research status
  - approvals
  - playbook or project updates

## Data Model (new)
- SlackIntegration
  - workspaceId
  - slackTeamId
  - botToken (encrypted)
  - signingSecret (encrypted)
  - defaultChannelId
  - createdAt / updatedAt

- SlackUserMap
  - slackUserId
  - ravenUserId
  - slackTeamId

## Agent Behavior (Slack)
- Use the same MCP tool system as the in-app agent.
- If the agent proposes actions, respond with a preview + approval buttons.
- Keep responses short with a deep-link to Raven Docs when needed.

## MVP Implementation Steps
1) Add Slack integration settings to workspace settings UI.
2) Add server endpoints to receive events/commands/interactions.
3) Add Slack service to send messages + approvals.
4) Add minimal command router (ask/research/approve).
5) Add logging + audit trail for Slack-driven actions.

## Testing Checklist
- Install app into a test Slack workspace.
- `/raven ask` returns an answer and logs a memory.
- `/raven research` creates a research task and posts a completion message.
- Approval request posts buttons; approve triggers MCP tool call.
- Slack user mapping prevents unauthorized use.

## Open Questions
- Should approvals in Slack also appear in the in-app approvals queue? (Suggested: yes.)
- Should Slack be allowed to auto-approve in any workspace? (Suggested: admin-only toggle.)
- Should Slack be allowed to create projects or only tasks/notes? (Suggested: tasks/notes for MVP.)
