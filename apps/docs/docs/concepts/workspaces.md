---
title: Workspaces
sidebar_position: 1
---

# Workspaces

A workspace is the top-level container in Raven Docs. It represents your organization or team and contains all your spaces, pages, tasks, and members.

## Overview

```
Workspace (e.g., "Acme Corp")
├── Spaces
│   ├── Engineering
│   ├── Product
│   └── Company Wiki
├── Members
│   ├── Admins
│   ├── Editors
│   └── Viewers
└── Settings
    ├── Security
    └── Integrations
```

## Creating a Workspace

When you first access Raven Docs, you'll be prompted to create your first workspace:

1. Choose a name (e.g., "Acme Corp")
2. Set a hostname identifier (e.g., `acme`)
3. Invite team members (optional)

## Workspace Settings

### General

- **Name** - Display name for your workspace
- **Hostname** - Subdomain for your workspace URL
- **Logo** - Custom branding

### Members

Manage who has access to your workspace:

| Role | Permissions |
|------|-------------|
| **Admin** | Full access, manage settings and members |
| **Editor** | Create and edit content, manage tasks |
| **Viewer** | Read-only access to content |

### Security

- **2FA** - Require two-factor authentication
- **IP Allowlist** - Restrict access by IP

## Multiple Workspaces

You can be a member of multiple workspaces. Switch between them using the workspace switcher in the top-left corner.

Common use cases:

- Separate workspaces for different clients
- Personal workspace vs. company workspace
- Production and staging environments

## API Access

Access workspace data via the API:

```typescript
// List workspaces you belong to
const workspaces = await client.workspaces.list();

// Get a specific workspace
const workspace = await client.workspaces.get('ws_123');

// Update workspace settings
await client.workspaces.update('ws_123', {
  name: 'New Name',
});
```

## Best Practices

1. **One workspace per organization** - Keep all company content together
2. **Use spaces for departments** - Engineering, Product, HR, etc.
3. **Regular member audits** - Remove inactive members

## Related

- [Spaces](/concepts/spaces) - Organize content within workspaces
- [Permissions](/guides/permissions) - Detailed permission guide
- [Workspaces API](/api/endpoints/workspaces) - API reference
