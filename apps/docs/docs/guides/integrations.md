---
title: Integrations
sidebar_position: 6
---

# Integrations

Connect Raven Docs with your existing tools for a seamless workflow.

## Slack

Interact with Raven Docs directly from Slack using slash commands and @mentions.

### Creating a Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click **Create New App** → **From scratch**
3. Name your app (e.g., "Raven Docs") and select your workspace

### Configure Bot Permissions

Go to **OAuth & Permissions** → **Bot Token Scopes** and add:
- `app_mentions:read`
- `chat:write`
- `commands`
- `im:history`
- `im:write`
- `users:read`

### Set Up Webhooks

1. **Event Subscriptions**: Enable and set Request URL to:
   ```
   https://your-domain.com/api/integrations/slack/events
   ```
   Subscribe to: `app_mention`, `message.im`

2. **Slash Commands**: Create `/raven` command with Request URL:
   ```
   https://your-domain.com/api/integrations/slack/commands
   ```

3. **Interactivity**: Enable and set Request URL to:
   ```
   https://your-domain.com/api/integrations/slack/interactions
   ```

### Install and Configure

1. Install the app to your workspace
2. Copy the **Bot Token** (xoxb-...) and **Signing Secret**
3. In Raven Docs, go to **Settings** → **Integrations**
4. Enable Slack and enter your credentials
5. Save settings

### Commands

| Command | Description |
|---------|-------------|
| `/raven link` | Link your Slack account to Raven Docs |
| `/raven status` | Check your account linking status |
| `/raven ask [question]` | Ask the AI agent a question |
| `/raven research [topic]` | Start a research task |
| `/raven approve [token]` | Approve a pending action |
| `/raven reject [token]` | Reject a pending action |

### Account Linking

Link your Slack account to use your Raven Docs permissions:

1. Run `/raven link` in Slack
2. Click the secure link provided
3. Sign in to your Raven Docs account
4. Your accounts are now connected

Once linked, all commands run with your permissions.

### Channel Mapping

Map Slack channels to Raven spaces:

1. Go to **Settings** → **Integrations** → Slack section
2. Find "Channel → Space Mappings"
3. Enter a Slack channel ID and select a space
4. Click **Add Mapping**

Content created from that channel will be saved to the mapped space.

## Discord

Interact with Raven Docs from Discord using slash commands.

### Creating a Discord App

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. Click **New Application**
3. Name your app and create it

### Get Your Credentials

From **General Information**, copy:
- Application ID
- Public Key

From **Bot**, copy:
- Bot Token (click Reset Token if needed)

### Invite the Bot

Go to **OAuth2** → **URL Generator**:
1. Select scopes: `bot`, `applications.commands`
2. Select permissions: Send Messages, Use Slash Commands, Embed Links
3. Open the generated URL to invite the bot

### Set Up Interactions

In **General Information**, set **Interactions Endpoint URL** to:
```
https://your-domain.com/api/integrations/discord/interactions
```

### Register Commands

Register the `/raven` slash command using the Discord API:

```bash
curl -X POST \
  "https://discord.com/api/v10/applications/YOUR_APP_ID/guilds/YOUR_GUILD_ID/commands" \
  -H "Authorization: Bot YOUR_BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "raven",
    "description": "Interact with Raven Docs",
    "options": [{
      "name": "command",
      "description": "Command to run",
      "type": 3,
      "required": true
    }]
  }'
```

### Configure in Raven Docs

1. Go to **Settings** → **Integrations**
2. Enable Discord
3. Enter: Guild ID, Bot Token, Public Key, Application ID
4. Save settings

### Commands

| Command | Description |
|---------|-------------|
| `/raven link` | Link your Discord account to Raven Docs |
| `/raven status` | Check your account linking status |
| `/raven ask [question]` | Ask the AI agent a question |
| `/raven research [topic]` | Start a research task |
| `/raven approve [token]` | Approve a pending action |
| `/raven reject [token]` | Reject a pending action |

### Account Linking

Link your Discord account to use your Raven Docs permissions:

1. Run `/raven link` in Discord
2. Click the secure link provided
3. Sign in to your Raven Docs account
4. Your accounts are now connected

### Channel Mapping

Map Discord channels to Raven spaces:

1. Go to **Settings** → **Integrations** → Discord section
2. Find "Channel → Space Mappings"
3. Enter a Discord channel ID and select a space
4. Click **Add Mapping**

:::tip Getting Channel IDs
Enable Developer Mode in Discord (Settings → Advanced → Developer Mode), then right-click any channel and select "Copy ID".
:::

## GitHub

Link your code and documentation.

### Setup

1. Go to **Settings** → **Integrations** → **GitHub**
2. Click **Connect to GitHub**
3. Select repositories to link

### Features

#### Issue/PR Mentions

Reference GitHub issues and PRs in your docs:

```markdown
This feature was implemented in #123.

See the PR at github:owner/repo#456.
```

#### Auto-linking

Raven Docs automatically detects and links:
- Issue numbers (#123)
- PR numbers (#456)
- Commit SHAs (abc1234)

#### Sync Tasks

Optionally sync tasks with GitHub Issues:
- Create GitHub issue from Raven task
- Update task when issue is closed
- Bidirectional status sync

## Webhooks

Build custom integrations with webhooks.

### Creating a Webhook

1. Go to **Settings** → **Integrations** → **Webhooks**
2. Click **Create Webhook**
3. Enter your endpoint URL
4. Select events to subscribe to

### Available Events

| Event | Description |
|-------|-------------|
| `page.created` | New page created |
| `page.updated` | Page content changed |
| `page.deleted` | Page deleted |
| `task.created` | New task created |
| `task.updated` | Task modified |
| `task.completed` | Task marked done |
| `comment.created` | New comment added |
| `member.joined` | New workspace member |

### Webhook Payload

```json
{
  "event": "page.updated",
  "timestamp": "2025-01-22T10:30:00Z",
  "workspace_id": "ws_123",
  "data": {
    "page_id": "page_456",
    "title": "Updated Page",
    "updated_by": "user_789",
    "changes": ["content", "title"]
  }
}
```

### Security

Webhooks include a signature header for verification:

```typescript
import crypto from 'crypto';

function verifyWebhook(payload: string, signature: string, secret: string) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}
```

## API Integration

Build custom integrations using the REST API.

### Authentication

```typescript
const client = new RavenDocs({
  apiKey: process.env.RAVEN_API_KEY,
});
```

### Common Patterns

**Automated Documentation:**
```typescript
// Update docs when code changes
async function updateDocs(componentName: string, props: any) {
  await client.pages.update({
    pageId: 'api-reference',
    workspaceId: 'ws_123',
    content: generateDocsContent(componentName, props),
  });
}
```

**Task Sync:**
```typescript
// Create Raven task from external system
async function syncTask(externalTask: ExternalTask) {
  await client.tasks.create({
    workspaceId: 'ws_123',
    title: externalTask.title,
    description: externalTask.description,
    metadata: {
      external_id: externalTask.id,
    },
  });
}
```

## MCP Server

Connect AI agents to your knowledge base.

### What is MCP?

The Model Context Protocol (MCP) allows AI assistants to:
- Read and search your documentation
- Create and update content
- Manage tasks
- Store persistent memory

### Setup

See the [MCP documentation](/mcp/overview) for full setup instructions.

### Use Cases

- AI assistant with company knowledge
- Automated documentation updates
- Intelligent chatbots
- Research agents

## Zapier (Coming Soon)

Connect to 5000+ apps without code.

### Planned Triggers

- New page created
- Task completed
- Comment added

### Planned Actions

- Create page
- Create task
- Add comment

## Best Practices

1. **Start small** - Enable one integration at a time
2. **Test in staging** - Verify webhooks before production
3. **Monitor activity** - Watch for unexpected behavior
4. **Secure credentials** - Use environment variables for secrets
5. **Rate limiting** - Respect API limits in custom integrations

## Related

- [API Reference](/api/overview) - Full API documentation
- [MCP Server](/mcp/overview) - AI agent integration
