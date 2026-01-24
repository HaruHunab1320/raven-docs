---
title: Features
sidebar_position: 10
---

# Features

A comprehensive overview of what Raven Docs offers.

## Documentation

### Rich Text Editor

A powerful block-based editor built on ProseMirror and TipTap.

- **Slash commands** - Quick access to all block types
- **Markdown shortcuts** - Write in markdown, render beautifully
- **Drag and drop** - Reorganize content intuitively
- **Nested pages** - Create hierarchical structures
- **Real-time collaboration** - See changes as they happen

### Content Blocks

| Block Type | Description |
|------------|-------------|
| Paragraph | Standard text content |
| Headings | H1, H2, H3 for structure |
| Lists | Bullet, numbered, and checklists |
| Code | Syntax-highlighted code blocks |
| Tables | Full-featured tables |
| Images | Drag and drop images |
| Embeds | YouTube, Figma, and more |
| Callouts | Info, warning, and tip boxes |
| Math | LaTeX equations |
| Excalidraw | Hand-drawn diagrams |
| Draw.io | Technical diagrams |

### Page Organization

- **Spaces** - Top-level containers for content
- **Nested pages** - Unlimited depth hierarchy
- **Page links** - Link to other pages with `[[page name]]`
- **Backlinks** - See all pages that link to the current page
- **Favorites** - Quick access to important pages
- **Attachments** - File uploads on any page

## GTD & Productivity

### Getting Things Done

Built-in GTD methodology support:

- **Inbox** - Capture everything instantly
- **Triage buckets** - Inbox, Waiting, Someday/Maybe
- **Quick capture** - `Cmd/Ctrl + K` from anywhere
- **Daily notes** - Automatic daily pages
- **Journal entries** - Guided reflection prompts
- **Weekly reviews** - Structured review process

[Learn more about GTD](/concepts/gtd)

### Task Management

Tasks live alongside your documentation:

- **Projects** - Group related tasks
- **Assignees** - Assign to team members
- **Due dates** - Set deadlines
- **Priority** - High, medium, low, urgent
- **Status** - Todo, in progress, in review, done, blocked
- **Labels** - Custom categorization
- **Subtasks** - Break down complex tasks

### Goals

Align work with objectives:

- **Goal horizons** - Short, mid, and long-term
- **Task linking** - Connect tasks to goals
- **Progress tracking** - See completion percentage
- **Goal reviews** - Regular check-ins

[Learn more about Goals](/concepts/goals)

### Views

- **List view** - Traditional task list
- **Board view** - Kanban-style columns
- **Calendar view** - Timeline visualization
- **My tasks** - Personal task dashboard

## AI Agent

### Agent Chat

Conversational AI assistant for your workspace:

- **Answer questions** about your documentation
- **Create and manage** tasks
- **Generate content** drafts
- **Summarize** long documents
- **Research topics** from multiple sources

### Agent Planning

AI-assisted planning across horizons:

- **Daily plans** - Suggested priorities for today
- **Weekly plans** - Week-ahead planning
- **Goal alignment** - Connect daily work to objectives
- **Proactive suggestions** - Recommendations based on context

### Autonomous Mode

Configure the agent to work independently:

- **Scheduled runs** - Daily, weekly, monthly
- **Approval workflow** - Human-in-the-loop for actions
- **Configurable autonomy** - Control what agent can do

[Learn more about the Agent](/concepts/agent)

### Memory System

The agent remembers context:

- **Conversation memory** - Recalls past discussions
- **Activity tracking** - Learns from your usage
- **Memory graph** - Visualize connections

[Learn more about Memory](/guides/memory)

### Behavioral Insights

Sophisticated user profiling based on activity patterns:

- **Seven Core Traits** - Focus, Execution, Creativity, Communication, Leadership, Learning, Resilience
- **Trait Scoring** - Each dimension scored 0-10 with evidence
- **Pattern Analysis** - Completion rate, consistency, diversity, collaboration
- **Trend Tracking** - See improvement or decline over time
- **AI Recommendations** - Personalized insights and growth suggestions
- **Radar Visualization** - See your behavioral shape at a glance

[Learn more about User Profiles](/guides/user-profiles)

### Research

AI-powered research from multiple sources:

- **Documentation search** - Search your workspace
- **Web research** - Public internet sources
- **Repository analysis** - GitHub repo research
- **Report generation** - Comprehensive reports

[Learn more about Research](/guides/research)

## Collaboration

### Real-time Editing

- Live cursors showing who's editing
- Presence indicators
- Change highlighting
- Automatic conflict resolution

### Comments

- Inline comments on specific text
- Page-level discussions
- @mentions for notifications
- Resolve/unresolve threads

### Sharing

- Public links for external sharing
- Password protection
- Expiring links
- View-only or edit access

## MCP Server

Connect AI agents directly to your knowledge base.

### Capabilities

- **140+ tools** for reading and writing content
- **Tool search** - Agents discover relevant tools
- **Memory storage** - Persistent agent context
- **Authentication** - Secure API key access

### Use Cases

- AI assistants with access to company knowledge
- Automated documentation updates
- Chatbots with product information
- Research agents

[Learn more about MCP](/mcp/overview)

## Integrations

### Native Integrations

- **Slack** - Notifications and search
- **Discord** - Team notifications
- **GitHub** - Link issues and PRs

### API

Full REST API for custom integrations:

- Comprehensive endpoints
- Webhook support
- OAuth 2.0 authentication
- Rate limiting

[View API Reference](/api/overview)

## Security

### Authentication

- Email/password
- Google OAuth
- GitHub OAuth

### Authorization

- Role-based access control
- Space-level permissions
- Page-level permissions
- Granular sharing controls

### Data Protection

- Encryption at rest
- Encryption in transit (TLS)
- Regular backups
- GDPR compliance

## Self-Hosting

Run Raven Docs on your own infrastructure.

- **Docker** - Simple container deployment
- **Kubernetes** - Production-ready Helm chart
- **Configuration** - Full environment customization

[Self-hosting guide](/self-hosting/overview)
