---
title: Integrations
sidebar_position: 6
---

# Integrations

Connect Raven Docs with your existing tools for a seamless workflow.

## Slack

Get notifications and interact with Raven Docs directly from Slack.

### Setup

1. Go to **Settings** → **Integrations** → **Slack**
2. Click **Connect to Slack**
3. Authorize the Raven Docs app
4. Select channels for notifications

### Features

#### Notifications

Receive notifications in Slack for:
- New comments on pages you're watching
- Task assignments
- @mentions
- Page updates

Configure which events trigger notifications in integration settings.

#### Commands

| Command | Description |
|---------|-------------|
| `/raven search [query]` | Search your workspace |
| `/raven task [title]` | Create a new task |
| `/raven page [title]` | Create a new page |

#### Unfurling

When you paste a Raven Docs link in Slack, it automatically shows:
- Page title and excerpt
- Last updated time
- Quick actions

### Channel Mapping

Map Raven Docs spaces to Slack channels:

1. Go to Slack integration settings
2. Click **Add Channel Mapping**
3. Select a space and a channel
4. All updates in that space post to the channel

## Discord

Team notifications for Discord communities.

### Setup

1. Go to **Settings** → **Integrations** → **Discord**
2. Click **Connect to Discord**
3. Select your server and channel
4. Configure notification types

### Features

- Page update notifications
- Task activity alerts
- @mention forwarding
- Webhook-based (no bot required)

### Webhook Configuration

```json
{
  "events": ["page.updated", "task.created", "comment.created"],
  "channel_id": "123456789",
  "include_preview": true
}
```

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
