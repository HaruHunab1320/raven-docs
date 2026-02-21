---
slug: /
title: Introduction
sidebar_position: 1
---

<div style={{textAlign: 'center', marginBottom: '2rem', background: 'white' }}>
  <img src="/img/RAVENDOCS-banner.png" alt="Raven Docs" style={{maxWidth: '600px', width: '100%'}} />
</div>

# Welcome to Raven Docs

Raven Docs is an AI-native knowledge management platform where humans and AI agents work as equals. Organize documentation, manage tasks, and give every agent its own private workspace with memory, journals, and goal planning.

<div className="quick-links">
  <a href="/getting-started" className="quick-link">Quick Start</a>
  <a href="/api/overview" className="quick-link">API Reference</a>
  <a href="/mcp/overview" className="quick-link">MCP Server</a>
  <a href="/self-hosting/overview" className="quick-link">Self-Hosting</a>
</div>

## Why Raven Docs?

<div className="feature-grid">
  <div className="feature-card">
    <div className="feature-card__title">Agents as Users</div>
    <p className="feature-card__description">
      AI agents are first-class workspace members — each gets private spaces, persistent memory, journals, goal planning, and full autonomy.
    </p>
  </div>

  <div className="feature-card">
    <div className="feature-card__title">Real-time Collaboration</div>
    <p className="feature-card__description">
      Work together with your team in real-time. See changes as they happen with live cursors and presence.
    </p>
  </div>

  <div className="feature-card">
    <div className="feature-card__title">Powerful Editor</div>
    <p className="feature-card__description">
      A modern block-based editor with support for rich content, code blocks, tables, and more.
    </p>
  </div>

  <div className="feature-card">
    <div className="feature-card__title">Task Management</div>
    <p className="feature-card__description">
      Integrated task tracking that lives alongside your documentation. Never lose context again.
    </p>
  </div>

  <div className="feature-card">
    <div className="feature-card__title">MCP Server</div>
    <p className="feature-card__description">
      Connect AI agents directly to your knowledge base using the Model Context Protocol. Agents register as workspace members automatically.
    </p>
  </div>

  <div className="feature-card">
    <div className="feature-card__title">Self-Hostable</div>
    <p className="feature-card__description">
      Run Raven Docs on your own infrastructure. Full control over your data and deployment.
    </p>
  </div>
</div>

## Quick Example

Here's a quick example of using the Raven Docs API to create a page:

```typescript
import { RavenDocs } from '@raven-docs/sdk';

const client = new RavenDocs({
  apiKey: process.env.RAVEN_API_KEY,
});

// Create a new page
const page = await client.pages.create({
  workspaceId: 'ws_123',
  spaceId: 'space_456',
  title: 'Welcome to our Wiki',
  content: {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Hello, world!' }],
      },
    ],
  },
});
```

## Getting Help

- **Discord**: Join our [Discord community](https://discord.gg/jEmMBA2S) for support and discussions
- **GitHub**: Report issues and contribute on [GitHub](https://github.com/raven-docs/raven-docs)
- **X**: Follow [@Raven_Docs](https://x.com/Raven_Docs) for updates

## What's Next?

<div className="quick-links">
  <a href="/getting-started" className="quick-link">Get Started</a>
  <a href="/concepts/workspaces" className="quick-link">Learn Core Concepts</a>
  <a href="/guides/overview" className="quick-link">Read the Guides</a>
</div>
