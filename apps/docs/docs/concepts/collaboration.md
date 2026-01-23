---
title: Collaboration
sidebar_position: 5
---

# Collaboration

Raven Docs is built for teams. Work together in real-time, share feedback, and keep everyone aligned.

## Real-time Editing

Multiple team members can edit the same page simultaneously.

### How It Works

1. Open a page that someone else is editing
2. See their cursor and selection in real-time
3. Changes merge automatically without conflicts
4. Presence indicators show who's viewing

### Technical Details

- Built on [Yjs](https://yjs.dev/) CRDT library
- Changes sync in ~50ms
- Works offline with automatic sync when reconnected
- No manual save needed - everything auto-saves

## Presence

See who's online and what they're looking at:

- **Avatars in sidebar** - Who's in this space
- **Cursors in editor** - Who's editing this page
- **Activity feed** - Recent changes across the workspace

## Comments

### Inline Comments

1. Select text in the editor
2. Click the comment icon or press `Cmd/Ctrl + Shift + M`
3. Type your comment
4. Others can reply to create a thread

### Page Comments

Add comments that apply to the whole page:

1. Click the comments icon in the toolbar
2. Type your comment
3. @mention team members to notify them

### Comment Features

- **Threads** - Nested replies
- **@mentions** - Notify specific people
- **Reactions** - Quick feedback with emoji
- **Resolve** - Mark issues as addressed
- **Link** - Share link to specific comment

```typescript
// Create a comment
await client.comments.create({
  pageId: 'page_123',
  workspaceId: 'ws_456',
  text: 'This section needs examples. @john can you add some?',
});

// Resolve a comment
await client.comments.resolve({
  commentId: 'comment_789',
  workspaceId: 'ws_456',
  resolved: true,
});
```

## Sharing

### Internal Sharing

Share pages with specific team members:

1. Click **Share** on any page
2. Add people by name or email
3. Set permission level (View, Edit, Admin)

### External Sharing

Share with people outside your workspace:

1. Click **Share** → **Public Link**
2. Configure options:
   - Require password
   - Set expiration date
   - Allow/disallow downloads
3. Copy and send the link

### Share Settings

| Option | Description |
|--------|-------------|
| **Anyone with link** | Open access |
| **Password protected** | Require password |
| **Expires** | Auto-disable after date |
| **Allow copy** | Let viewers copy content |
| **Allow download** | Let viewers export |

## Notifications

### Notification Types

- **Mentions** - When someone @mentions you
- **Comments** - On pages you're watching
- **Assignments** - When assigned a task
- **Updates** - Changes to watched pages

### Channels

- **In-app** - Bell icon in top nav
- **Email** - Daily digest or instant
- **Slack** - Real-time notifications
- **Discord** - Team channel notifications

### Configuration

Go to **Settings** → **Notifications** to customize:

- Which events trigger notifications
- Which channels to use
- Quiet hours

## Activity Feed

Track what's happening in your workspace:

- Page creates and updates
- Task completions
- Comments and mentions
- Member joins and leaves

Access from the sidebar or via API:

```typescript
const activity = await client.activity.list({
  workspaceId: 'ws_123',
  limit: 50,
});
```

## Best Practices

1. **@mention liberally** - Ensure the right people see important content
2. **Use comments, not edits** - For feedback on others' work
3. **Resolve comments** - Keep pages clean
4. **Watch important pages** - Stay informed on key content
5. **Set notification preferences** - Avoid notification fatigue

## Related

- [Permissions Guide](/guides/permissions) - Access control
- [Integrations](/guides/integrations) - Slack, Discord setup
