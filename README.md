# Raven Docs

A second-brain workspace for docs, projects, and GTD-style planning, with agentic workflows powered by MCP.

## Quick start

### Prerequisites
- Docker + Docker Compose
- Node.js 18+ (for development)
- PostgreSQL 15+ and Redis (if not using Docker)

### One-command setup

```bash
./scripts/setup.sh
```

This will create config files, start services, run migrations, and launch the app at `http://localhost:3000`.

### Manual setup (Docker)

```bash
cp .env.example .env
openssl rand -hex 32 # set APP_SECRET in .env

docker-compose up -d
docker-compose exec raven-docs pnpm migration:latest
```

Open `http://localhost:3000` and complete `/auth/setup`.

### Manual setup (local dev)

```bash
pnpm install
pnpm dev
```

## Features

- Real-time collaboration
- Spaces, pages, comments, attachments, and page history
- Diagrams (Draw.io, Excalidraw, Mermaid)
- Projects and task management (GTD: Inbox, Triage, Waiting, Someday, Weekly Review)
- Journal capture and daily notes
- AI integration via Model Context Protocol (MCP)

## Agent + MCP integration

Raven Docs exposes an MCP-standard endpoint for tool access:

```
http://localhost:3000/api/mcp-standard
```

Create an API key in **Workspace Settings → API Keys** and configure clients (Cursor, etc.) to connect.

The in-app agent can use MCP tools with approval controls. Approvals are surfaced in chat and the approvals center.

## Documentation

- Architecture: `docs/ArchitectureOverview.md`
- System status: `docs/SystemStatus.md`
- MCP canonical: `docs/MCP.md`
- Engineering standards: `docs/EngineeringStandards.md`
- Workflows: `docs/Workflows.md`
- Autonomy quickstart: `docs/AutonomyQuickstart.md`
- System risks: `docs/SystemRisks.md`
- UI audit routes: `docs/UIAudit_RouteChecks.md`
- Testing matrix: `docs/TestingMatrix.md`
- Manual test runbook: `docs/ManualTest_Runbook.md`
- GTD + second brain UI: `docs/GTD_SecondBrain_UI.md`
- GTD agent automations: `docs/GTD_Agent_Automations.md`
- Project management: `docs/ProjectManagement.md`
- Product vision: `docs/ProductVision.md`

## Repository structure

```
raven-docs/
├── apps/
│   ├── client/        # React frontend
│   └── server/        # NestJS backend
├── packages/          # Shared packages
├── scripts/           # Utility scripts
└── docker-compose.yml # Docker config
```

## Origin

Raven Docs is built on the Docmost codebase and continues to evolve with its own product direction.

## License

Raven Docs inherits the Raven Docs core licensed under AGPL 3.0. Enterprise features are under `packages/ee/License`.

## Contributing

See `CONTRIBUTING.md` if present, and the docs above for architecture and workflows.
