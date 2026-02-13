# Discord Integration

Status: Implemented with account linking and channel mapping.

## Goals
- Bring Raven Docs agent capabilities into Discord for mobile/away-from-desk use.
- Enable lightweight approvals without opening the web app.
- Push research status and summaries into channels.
- Allow users to link their Discord accounts to Raven Docs for personalized permissions.
- Map Discord channels to Raven spaces for organized content creation.

## Non-goals (MVP)
- Full task/project management from Discord.
- Rich document editing in Discord.
- Multi-workspace Discord federation.

## Core User Flows

### 1) Account Linking
- Users run `/raven link` to get a secure linking URL.
- Click the link and sign in to Raven Docs to connect accounts.
- Once linked, all commands execute with the user's permissions.
- Use `/raven status` to check linking status.

### 2) Ask Raven (read-only)
- Users query the agent for summaries/status.
- Responses include references to pages/projects when possible.

### 3) Research status + results
- When a research task starts, post a short status update.
- When finished, post a summary + link to the page.

### 4) Approval requests
- When the agent needs approval to run MCP tools, it posts a request.
- Users can approve/deny directly in Discord (interactive buttons).

## Discord UX
- Slash command: `/raven` with subcommands.
- Channel notifications for research + approvals.

### Commands
- `/raven link`
  - Generate a secure URL to link your Discord account to Raven Docs.
- `/raven status`
  - Check if your account is linked and view your Raven Docs email.
- `/raven ask <question>`
  - Read-only summary/answer.
- `/raven research <query>`
  - Create a research task and post updates.
- `/raven task <title>`
  - Add an item to your inbox.
- `/raven approve <token>`
  - Approve a pending agent action.
- `/raven reject <token>`
  - Reject a pending agent action.

## Permissions & Security

### User Identity
- **Linked users**: Commands execute with the linked Raven user's permissions.
- **Unlinked users**: Falls back to workspace default user (if configured).
- Users are encouraged to link accounts for proper permission enforcement.

### Channel → Space Mapping
- Admins can map Discord channels to Raven spaces in workspace settings.
- When a user runs commands in a mapped channel, content is created in that space.
- Unmapped channels use the workspace default space.

## Architecture
- Discord app with bot token + public key + application id.
- Webhook endpoint in Raven Docs server:
  - `POST /api/integrations/discord/interactions` - Handle all interactions
- Account linking endpoints:
  - `GET /api/integrations/discord/link/:token` - Get pending link info
  - `POST /api/integrations/discord/link/:token` - Complete account linking
- Channel mapping endpoints:
  - `GET /api/integrations/discord/channel-mappings` - List mappings
  - `POST /api/integrations/discord/channel-mappings` - Add mapping
  - `POST /api/integrations/discord/channel-mappings/remove` - Remove mapping

## Data Model

### Workspace Settings
Stored in `workspace.settings.integrations.discord`:
- `enabled` - Whether Discord integration is active
- `guildId` - Discord server/guild ID
- `botToken` - Bot token
- `publicKey` - Application public key for signature verification
- `applicationId` - Discord application ID
- `defaultChannelId` - Default channel for notifications
- `defaultUserId` - Fallback Raven user for unlinked Discord users
- `channelMappings` - Object mapping channel IDs to space IDs

### User Settings
Stored in `user.settings.integrations.discord`:
- `discordUserId` - The linked Discord user ID
- `linkedAt` - When the account was linked

## Implementation Steps (completed)
1. Discord integration settings in workspace settings UI.
2. Server endpoint for interactions (slash commands + buttons).
3. Discord service for outbound messages + approvals.
4. Command router (ask/research/approve/reject/link/status).
5. Research status notifications.
6. Account linking service with secure token flow.
7. Channel → space mapping with admin UI.
8. Masked secret display in settings (shows last 4 chars).

## Testing Checklist
- [ ] Create Discord app and configure in Developer Portal.
- [ ] Configure bot token and public key in Raven Docs settings.
- [ ] Verify secrets show masked hints (••••••••1234) after saving.
- [ ] `/raven link` returns a valid linking URL.
- [ ] Clicking the link and signing in successfully links accounts.
- [ ] `/raven status` shows linked account info.
- [ ] `/raven ask` returns an answer using the linked user's permissions.
- [ ] `/raven research` creates a research task in the mapped space.
- [ ] Channel mapping directs content to the correct space.
- [ ] Approval request posts buttons; approve triggers MCP tool call.
- [ ] Unlinked users fall back to default user (if configured).

## Discord App Setup Guide

### 1. Create a Discord Application
1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. Click **New Application**
3. Enter app name (e.g., "Raven Docs") and create

### 2. Get Application Credentials
In **General Information**:
- Copy the **Application ID**
- Copy the **Public Key**

### 3. Create a Bot
Go to **Bot**:
1. Click **Add Bot** (if not already created)
2. Copy the **Token** (click Reset Token if needed)
3. Under **Privileged Gateway Intents**, enable:
   - Message Content Intent (if you want to read messages)

### 4. Configure OAuth2
Go to **OAuth2** → **URL Generator**:
1. Select scopes:
   - `bot`
   - `applications.commands`
2. Select bot permissions:
   - Send Messages
   - Use Slash Commands
   - Embed Links
   - Read Message History
3. Copy the generated URL and open it to invite the bot to your server

### 5. Register Slash Commands
You can register commands via the Discord API. Example using curl:

```bash
# Set your credentials
APP_ID="your_application_id"
BOT_TOKEN="your_bot_token"
GUILD_ID="your_guild_id"

# Register the /raven command
curl -X POST \
  "https://discord.com/api/v10/applications/$APP_ID/guilds/$GUILD_ID/commands" \
  -H "Authorization: Bot $BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "raven",
    "description": "Interact with Raven Docs",
    "options": [
      {
        "name": "command",
        "description": "The command to run (ask, research, link, status, approve, reject)",
        "type": 3,
        "required": true
      }
    ]
  }'
```

### 6. Set Interactions Endpoint
Go to **General Information**:
1. Set **Interactions Endpoint URL** to: `https://your-domain.com/api/integrations/discord/interactions`
2. Discord will verify the endpoint - make sure your server is running

### 7. Configure in Raven Docs
1. Go to **Settings** → **Integrations** in Raven Docs
2. Enable Discord integration
3. Enter:
   - Guild ID (right-click server → Copy ID with Developer Mode enabled)
   - Bot Token
   - Public Key
   - Application ID
4. Optionally set default channel and user
5. Save settings

### 8. Set Up Channel Mappings (Optional)
1. In the Discord integration settings, find "Channel → Space Mappings"
2. Enter a Discord channel ID (right-click channel → Copy ID)
3. Select a Raven space
4. Click "Add Mapping"

## Troubleshooting

### "Invalid signature" errors
- Verify the Public Key in Raven Docs matches your Discord app
- Ensure your server clock is synchronized (Discord validates timestamps)

### Commands not appearing
- Slash commands can take up to an hour to propagate globally
- For testing, use guild-specific commands (instant)
- Make sure the bot has `applications.commands` scope

### Bot not responding
- Check that the Interactions Endpoint URL is correct and accessible
- Verify the bot has proper permissions in the channel
- Check server logs for errors
