<p align="center">
  <img src="apps/client/public/RAVENDOCS-banner.png" alt="Raven Docs" width="600" />
</p>

# Raven Docs

**AI-native knowledge management with full agentic workflows.** Organize documentation, manage tasks with GTD methodology, and orchestrate AI agent swarms—all from one platform.

## What Makes Raven Docs Different

Raven Docs isn't just another documentation tool. It's a complete AI-native workspace that combines:

- **Knowledge Management** — Real-time collaborative docs with rich editing, diagrams, and page history
- **GTD Task System** — Capture, triage, and execute with inbox zero methodology
- **Agentic AI** — Built-in agent with planning, memory, and autonomous execution
- **Multi-Agent Orchestration** — Spawn and coordinate Claude Code, Codex, Gemini CLI, and Aider agents
- **MCP Server** — 100+ tools for external AI agents to interact with your knowledge base

```
┌─────────────────────────────────────────────────────────────────┐
│                        Raven Docs                               │
├─────────────────┬─────────────────┬─────────────────────────────┤
│   Knowledge     │   GTD System    │     Agent Runtime           │
│   • Pages       │   • Inbox       │     • Claude Code           │
│   • Spaces      │   • Triage      │     • Codex                 │
│   • Search      │   • Goals       │     • Gemini CLI            │
│   • History     │   • Reviews     │     • Aider                 │
├─────────────────┴─────────────────┴─────────────────────────────┤
│                     MCP Server (100+ tools)                     │
├─────────────────────────────────────────────────────────────────┤
│  External Agents  │  Approvals  │  Memory  │  Web Terminal      │
└─────────────────────────────────────────────────────────────────┘
```

## Key Features

### AI Agent with Full Autonomy

The built-in agent operates across multiple planning horizons:

| Horizon | Timeframe | Capabilities |
|---------|-----------|--------------|
| **Daily** | Today | Generate plans, surface priorities, schedule tasks |
| **Short** | This week | Weekly objectives, task batching |
| **Mid** | Quarter | Project milestones, goal tracking |
| **Long** | Year+ | Strategic planning, vision alignment |

The agent maintains persistent memory, learns your preferences, and can run autonomously on schedules (daily, weekly, monthly).

### Multi-Agent Swarm Orchestration

Spawn and manage coding agents through Raven Docs:

```bash
# Spawn 3 Claude Code agents for a project
curl -X POST https://your-instance.com/api/parallax-agents/spawn \
  -H "Authorization: Bearer TOKEN" \
  -d '{
    "agentType": "claude-code",
    "count": 3,
    "name": "Code Review Team"
  }'
```

**Supported agent types:**
- **Claude Code** — Anthropic's CLI coding assistant
- **Codex** — OpenAI code generation
- **Gemini CLI** — Google's Gemini agent
- **Aider** — AI pair programming
- **Custom** — Your own agent implementations

**Runtime hosting options:**
- **Local** — Run on your machine for development
- **Parallax Cloud** — Managed Kubernetes with SLA guarantees
- **Custom** — Your own VPC or self-hosted cluster

### Web Terminal Access

Access running agents through a web-based terminal:

- Full PTY emulation with xterm.js
- Real-time I/O streaming
- Session logging for audit trails
- Multi-viewer support

### MCP Server with 100+ Tools

External AI agents connect via Model Context Protocol:

```json
{
  "mcpServers": {
    "raven-docs": {
      "url": "https://your-instance.com/api/mcp-standard",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

**Tool categories:**
- Pages — CRUD, history, search
- Tasks — Full GTD workflow
- Goals — Planning horizons
- Memory — Persistent agent context
- Research — Autonomous research jobs
- Search — Full-text across workspace

### GTD Productivity System

Built-in Getting Things Done workflow:

```
Capture → Process → Organize → Review → Execute
   ↓         ↓          ↓         ↓         ↓
 Inbox    Triage     Buckets   Weekly    Tasks
                               Review
```

- **Quick Capture** (`Cmd/Ctrl + K`) — Zero-friction inbox
- **Triage Buckets** — Next Actions, Waiting, Someday/Maybe
- **Daily Notes** — Auto-generated daily pages
- **Weekly Reviews** — Structured review process
- **Goal Tracking** — Align tasks with objectives

### Knowledge Management

- **Real-time Collaboration** — Live cursors, presence, co-editing
- **Rich Editor** — Blocks, tables, code, embeds
- **Diagrams** — Draw.io, Excalidraw, Mermaid
- **Page History** — Full version control
- **Spaces** — Organize by team or project
- **Search** — Full-text across all content

## Quick Start

### One-Command Setup

```bash
./scripts/setup.sh
```

Creates config files, starts services, runs migrations, and launches at `http://localhost:3000`.

### Docker Setup

```bash
cp .env.example .env
openssl rand -hex 32  # Set as APP_SECRET in .env

docker-compose up -d
docker-compose exec raven-docs pnpm migration:latest
```

Open `http://localhost:3000` and complete `/auth/setup`.

### Local Development

```bash
pnpm install
pnpm dev
```

### Prerequisites

- Docker + Docker Compose (or PostgreSQL 15+ and Redis)
- Node.js 18+ (for development)

## Architecture

```
raven-docs/
├── apps/
│   ├── client/        # React frontend
│   ├── server/        # NestJS backend
│   └── docs/          # Documentation site
├── packages/          # Shared packages
│   └── editor-ext/    # Editor extensions
├── infra/             # Terraform infrastructure
└── scripts/           # Utility scripts
```

**Tech stack:**
- **Frontend** — React, TipTap editor, Mantine UI
- **Backend** — NestJS, Fastify, Socket.io
- **Database** — PostgreSQL with Drizzle ORM
- **Cache** — Redis
- **Infrastructure** — Terraform, GCP Cloud Run

## Production Deployment

```bash
cp .env.production.example .env
# Configure: APP_SECRET, APP_URL, DATABASE_URL, REDIS_URL, storage, mail

docker-compose -f docker-compose.production.yml up -d
pnpm --filter ./apps/server run migration:latest
```

## Agent Integration Examples

### Connect Claude Code to Your Workspace

```bash
# In Claude Code's MCP config
{
  "mcpServers": {
    "raven": {
      "url": "https://your-instance.com/api/mcp-standard",
      "headers": { "Authorization": "Bearer sk-..." }
    }
  }
}
```

### Spawn Agent Swarm via API

```typescript
// Spawn coding agents for a task
const response = await fetch('/api/parallax-agents/spawn', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({
    agentType: 'claude-code',
    count: 5,
    name: 'Feature Implementation Team',
    capabilities: ['code_review', 'testing', 'documentation']
  })
});

// Monitor via WebSocket
socket.on('agent:status', (status) => {
  console.log(`Agent ${status.id}: ${status.state}`);
});
```

### Create Autonomous Research Job

```typescript
await mcpClient.callTool('research_create', {
  workspaceId: 'ws_123',
  spaceId: 'space_456',
  topic: 'Best practices for microservices authentication',
  depth: 'comprehensive'
});
```

## Documentation

Full documentation available at your instance's `/docs` path or at the [documentation site](https://docs.ravendocs.com).

**Key guides:**
- [Agent Runtime Setup](/guides/agent-runtime) — Configure agent hosting
- [MCP Integration](/mcp/overview) — Connect external agents
- [GTD Workflow](/concepts/gtd) — Productivity system
- [Self-Hosting](/self-hosting/overview) — Deployment options

## License

Raven Docs is licensed under AGPL-3.0-only. See `LICENSE` for details.

## Acknowledgements

Raven Docs began as a fork of Docmost and includes portions of the original codebase. We are grateful to the Docmost maintainers and contributors for their foundational work.

## Contributing

See `CONTRIBUTING.md` for guidelines. Join our [Discord](https://discord.gg/ravendocs) for discussions.
