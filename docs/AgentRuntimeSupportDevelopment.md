# Agent Runtime Support - Development Plan

This document defines how Raven Docs will support agent runtimes, starting with local hosting and progressing to Parallax-managed Kubernetes hosting. The goal is to let workspace admins choose where agents run while keeping Raven Docs as the configuration + approvals source of truth.

## Goals
- Allow Raven Docs users to configure agent runtimes (local or managed).
- Support interactive CLI agents (Claude Code, Codex, Gemini CLI, Aider) via PTY-backed sessions.
- Preserve Raven Docs approval, permissions, and MCP access controls.
- Minimize infrastructure changes to Raven Docs.

## Non-Goals
- Building a full orchestration engine inside Raven Docs.
- Replacing Parallax control plane or registry.

## Hosting Modes (User-Selectable)
1) Local Runtime (MVP)
   - Admin runs an agent runtime on their machine or a local VM.
   - Runtime registers with Parallax and uses Raven Docs MCP keys for access.
   - Best for quick setup and interactive auth.

2) Parallax Cloud (Managed K8s)
   - Parallax provisions containers for agents.
   - Strong isolation, policy controls, audit trails.
   - Best for enterprise workflows and SLA guarantees.

3) Custom VPC / Self-Hosted K8s (optional)
   - Enterprise installs the runtime in their infra.
   - Parallax can schedule to that cluster.

## Raven Docs Responsibilities
- Store agent definitions, permissions, and hosting preferences.
- Handle access approvals and MCP API key issuance.
- Provide an admin UI for hosting configuration and runtime status.
- Emit webhooks or API calls to request agent spawns.

## Required Raven Docs Changes
1) Agent Hosting Configuration
   - Add hosting config to workspace settings.
   - Fields: hostingMode, runtimeEndpoint, authType, defaultRegion (optional).

2) Spawn Requests
   - Add API endpoint to request agent spawn.
   - Emits a request to Parallax control plane or runtime directly.

3) Status + Observability
   - UI panel to show runtime connectivity, active agents, last heartbeat.

## Auth + Login UX (Local Runtime)
- Runtime starts CLI in PTY.
- If login required, runtime emits "login_required" event.
- Raven Docs surfaces login instructions (device code / link).
- After login, runtime continues and registers the agent.

## Data Flow (Local Runtime)
1) Admin configures runtime endpoint in Raven Docs.
2) User requests N agents in Raven Docs.
3) Raven Docs sends spawn request to runtime (via Parallax or direct).
4) Runtime starts CLI sessions and registers each agent in Parallax registry.
5) Raven Docs grants MCP keys and approves access.
6) Agents call MCP endpoints to interact with Raven Docs.

## Security Notes
- Agent-specific MCP API keys (already supported).
- Strict permission sets tied to workspace roles.
- Runtime should run with least privileges and isolated working dirs.
- Audit all agent actions via existing activity logging.

## Milestones
1) Local Runtime MVP
   - Hosting config in Raven Docs.
   - Spawn request flow.
   - Status/health display.

2) Parallax Cloud Integration
   - Hosting selection UI includes managed option.
   - Spawn requests target Parallax control plane.
   - Workspace-level limits, billing hooks.

3) Enterprise Runtime (optional)
   - Support custom clusters / VPC endpoints.
   - Advanced compliance controls.

## Open Questions
- Should Raven Docs call Parallax or the runtime directly?
- Where should runtime auth credentials live for cloud hosting?
- How should Raven Docs expose "login required" states in the UI?
