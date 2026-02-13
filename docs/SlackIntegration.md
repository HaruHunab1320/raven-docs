# Slack Integration

Status: Implemented with account linking and channel mapping.

## Goals
- Bring Raven Docs agent capabilities into Slack for mobile/away-from-desk use.
- Enable lightweight approvals without opening the web app.
- Push research status, task updates, and summaries into team channels.
- Allow users to link their Slack accounts to Raven Docs for personalized permissions.
- Map Slack channels to Raven spaces for organized content creation.

## Non-goals (MVP)
- Full task/project management from Slack.
- Rich document editing in Slack.
- Multi-workspace Slack federation.

## Core User Flows

### 1) Account Linking
- Users run `/raven link` to get a secure linking URL.
- Click the link and sign in to Raven Docs to connect accounts.
- Once linked, all commands execute with the user's permissions.
- Use `/raven status` to check linking status.

### 2) Ask Raven (read-only)
- Users can query the agent for summaries, status, or searches.
- Responses include references to pages/projects when possible.

### 3) Research status + results
- When a research task starts, the agent posts a short status update.
- When finished, the agent posts a summary + link to the page.

### 4) Approval requests
- When the agent needs approval to run MCP tools, it posts a request.
- Users can approve/deny directly in Slack (interactive buttons).

### 5) Quick capture (optional)
- Create a task or note from a Slack message with explicit confirmation.

## Slack UX
- Slash command: `/raven` with subcommands (see Commands).
- @mention the bot in channels for conversational mode.
- Channel notifications for research + approvals.

### Commands
- `/raven link`
  - Generate a secure URL to link your Slack account to Raven Docs.
- `/raven status`
  - Check if your account is linked and view your Raven Docs email.
- `/raven ask <question>`
  - Read-only summary/answer.
- `/raven project <name>`
  - Show project summary + open tasks.
- `/raven research <query>`
  - Create a research task and post updates.
- `/raven approve <id>` / `/raven reject <id>`
  - Approve/deny pending agent actions.

## Permissions & Security

### User Identity
- **Linked users**: Commands execute with the linked Raven user's permissions.
- **Unlinked users**: Falls back to workspace default user (if configured).
- Users are encouraged to link accounts for proper permission enforcement.

### Channel → Space Mapping
- Admins can map Slack channels to Raven spaces in workspace settings.
- When a user runs commands in a mapped channel, content is created in that space.
- Unmapped channels use the workspace default space.

## Architecture
- Slack app with bot token + signing secret.
- Webhook endpoints in Raven Docs server:
  - `POST /api/integrations/slack/events` - Handle @mentions and messages
  - `POST /api/integrations/slack/commands` - Handle slash commands
  - `POST /api/integrations/slack/interactions` - Handle button clicks
- Account linking endpoints:
  - `GET /api/integrations/slack/link/:token` - Get pending link info
  - `POST /api/integrations/slack/link/:token` - Complete account linking
- Channel mapping endpoints:
  - `GET /api/integrations/slack/channel-mappings` - List mappings
  - `POST /api/integrations/slack/channel-mappings` - Add mapping
  - `POST /api/integrations/slack/channel-mappings/remove` - Remove mapping

## Data Model

### Workspace Settings
Stored in `workspace.settings.integrations.slack`:
- `enabled` - Whether Slack integration is active
- `teamId` - Slack workspace ID
- `botToken` - Bot OAuth token (xoxb-...)
- `signingSecret` - Request signing secret
- `defaultChannelId` - Default channel for notifications
- `defaultUserId` - Fallback Raven user for unlinked Slack users
- `channelMappings` - Object mapping channel IDs to space IDs

### User Settings
Stored in `user.settings.integrations.slack`:
- `slackUserId` - The linked Slack user ID
- `linkedAt` - When the account was linked

## Agent Behavior (Slack)
- Use the same MCP tool system as the in-app agent.
- If the agent proposes actions, respond with a preview + approval buttons.
- Keep responses short with a deep-link to Raven Docs when needed.

## Implementation Steps (completed)
1. Slack integration settings in workspace settings UI.
2. Server endpoints for events/commands/interactions.
3. Slack service for outbound messages + approvals.
4. Command router (ask/research/approve/reject/link/status).
5. Research status notifications.
6. Account linking service with secure token flow.
7. Channel → space mapping with admin UI.
8. Masked secret display in settings (shows last 4 chars).

## Testing Checklist
- [ ] Install app into a test Slack workspace.
- [ ] Configure bot token and signing secret in Raven Docs settings.
- [ ] Verify secrets show masked hints (••••••••1234) after saving.
- [ ] `/raven link` returns a valid linking URL.
- [ ] Clicking the link and signing in successfully links accounts.
- [ ] `/raven status` shows linked account info.
- [ ] `/raven ask` returns an answer using the linked user's permissions.
- [ ] `/raven research` creates a research task in the mapped space.
- [ ] Channel mapping directs content to the correct space.
- [ ] Approval request posts buttons; approve triggers MCP tool call.
- [ ] Unlinked users fall back to default user (if configured).

## Slack App Setup Guide

### 1. Create a Slack App
1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click **Create New App** → **From scratch**
3. Enter app name (e.g., "Raven Docs") and select your workspace

### 2. Configure Bot Token Scopes
Go to **OAuth & Permissions** → **Scopes** → **Bot Token Scopes** and add:
- `app_mentions:read` - Read @mentions
- `chat:write` - Send messages
- `commands` - Handle slash commands
- `im:history` - Read DM history
- `im:write` - Send DMs
- `users:read` - Read user info

### 3. Enable Event Subscriptions
Go to **Event Subscriptions**:
1. Toggle **Enable Events** to On
2. Set **Request URL** to: `https://your-domain.com/api/integrations/slack/events`
3. Under **Subscribe to bot events**, add:
   - `app_mention` - When @mentioned
   - `message.im` - DM messages

### 4. Create Slash Command
Go to **Slash Commands** → **Create New Command**:
- Command: `/raven`
- Request URL: `https://your-domain.com/api/integrations/slack/commands`
- Short Description: "Interact with Raven Docs"
- Usage Hint: `[ask|research|link|status|approve|reject] [text]`

### 5. Enable Interactivity
Go to **Interactivity & Shortcuts**:
1. Toggle **Interactivity** to On
2. Set **Request URL** to: `https://your-domain.com/api/integrations/slack/interactions`

### 6. Install to Workspace
Go to **Install App** and click **Install to Workspace**.
Copy the **Bot User OAuth Token** (starts with `xoxb-`).

### 7. Get Signing Secret
Go to **Basic Information** → **App Credentials**.
Copy the **Signing Secret**.

### 8. Configure in Raven Docs
1. Go to **Settings** → **Integrations** in Raven Docs
2. Enable Slack integration
3. Enter your Slack Team ID (find in Slack workspace settings)
4. Paste the Bot Token and Signing Secret
5. Optionally set default channel and user
6. Save settings

### 9. Set Up Channel Mappings (Optional)
1. In the Slack integration settings, find "Channel → Space Mappings"
2. Enter a Slack channel ID and select a Raven space
3. Click "Add Mapping"
