---
title: Agent Runtime Setup
sidebar_position: 11
---

# Agent Runtime Setup

This guide covers how to configure and use agent runtimes with Raven Docs. Agent runtimes allow you to spawn and manage AI coding agents like Claude Code, Codex, Gemini CLI, and Aider.

## Overview

Raven Docs acts as the configuration and approval layer for agent runtimes. The actual agent execution happens on the runtime, which can be:

- **Local** - Running on your machine or a local VM
- **Parallax Cloud** - Managed Kubernetes infrastructure
- **Custom** - Your own VPC or self-hosted cluster

```
┌─────────────────┐       Spawn Request       ┌─────────────────┐
│                 │ ────────────────────────▶ │                 │
│   Raven Docs    │                           │  Agent Runtime  │
│                 │ ◀──────────────────────── │                 │
└─────────────────┘       Status Updates      └─────────────────┘
        │                                             │
        │  MCP API                                    │
        ▼                                             ▼
┌─────────────────┐                           ┌─────────────────┐
│   Permissions   │                           │  Claude Code    │
│   Approvals     │                           │  Codex, Aider   │
│   Audit Logs    │                           │  Gemini CLI     │
└─────────────────┘                           └─────────────────┘
```

## Hosting Modes

### Local Runtime

Best for development and quick setup. The runtime runs on your machine.

**Pros:**
- Quick to set up
- Interactive authentication (can open browser for OAuth)
- No infrastructure costs

**Cons:**
- Requires your machine to be running
- Not suitable for team use

### Parallax Cloud

Managed infrastructure with automatic scaling and isolation.

**Pros:**
- No infrastructure to manage
- Strong isolation between agents
- SLA guarantees
- Audit trails

**Cons:**
- Requires Parallax subscription
- Agents run in cloud (data leaves your network)

### Custom Runtime

Run the agent runtime on your own infrastructure.

**Pros:**
- Full control over infrastructure
- Data stays in your network
- Can integrate with existing K8s clusters

**Cons:**
- Requires infrastructure setup and maintenance
- You manage scaling and availability

## Configuration

### Step 1: Access Agent Settings

1. Navigate to **Settings** in the sidebar
2. Click **Agents**
3. Scroll to **Agent Runtime Hosting**

### Step 2: Select Hosting Mode

Choose your hosting mode:

| Mode | When to Use |
|------|-------------|
| Local | Development, personal use |
| Parallax Cloud | Teams, production workloads |
| Custom | Enterprise, compliance requirements |

### Step 3: Configure Endpoint

For **Local** and **Custom** modes, enter your runtime endpoint:

```
http://localhost:8765        # Local development
https://runtime.company.com  # Custom deployment
```

### Step 4: Configure Authentication

Choose how Raven Docs authenticates with the runtime:

- **API Key** - Enter a shared secret that the runtime will validate
- **None** - No authentication (only for local development)

```
Runtime API Key: sk-runtime-abc123...
```

## Setting Up a Local Runtime

### Prerequisites

- Node.js 18+ or Python 3.10+
- Docker (optional, for containerized agents)

### Installation

The Raven Agent Runtime is available as an npm package:

```bash
npm install -g @raven-docs/agent-runtime
```

Or with Python:

```bash
pip install raven-agent-runtime
```

### Starting the Runtime

```bash
# Start with default settings (port 8765)
raven-runtime start

# Start with custom port
raven-runtime start --port 9000

# Start with API key authentication
raven-runtime start --api-key "sk-your-secret-key"
```

### Verifying Connection

1. In Raven Docs, go to **Settings → Agents**
2. Under **Runtime Status**, click **Test**
3. You should see "Connected" with latency info

## Spawning Agents

Once your runtime is configured and connected:

### From the UI

1. Go to **Settings → Agents**
2. Click **Spawn Agents**
3. Select agent type (Claude Code, Codex, etc.)
4. Configure count and options
5. Click **Spawn**

### From the API

```bash
curl -X POST https://your-raven-instance.com/api/parallax-agents/spawn \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "agentType": "claude-code",
    "count": 2,
    "name": "Code Review Agents",
    "capabilities": ["code_review", "testing"]
  }'
```

## Supported Agent Types

| Type | Description | Auth Required |
|------|-------------|---------------|
| `claude-code` | Anthropic's Claude Code CLI | Anthropic API key |
| `codex` | OpenAI Codex | OpenAI API key |
| `gemini-cli` | Google Gemini CLI | Google Cloud auth |
| `aider` | Aider pair programming | Provider API key |
| `custom` | Your own agent | Varies |

## Agent Authentication

When spawning agents that require authentication (API keys, OAuth), the runtime handles this via callbacks:

### Device Code Flow

1. Agent starts and needs authentication
2. Runtime sends `requires_login` callback to Raven Docs
3. Raven Docs displays login URL to user
4. User completes authentication in browser
5. Runtime receives token and agent continues

### Pre-configured Keys

For automated setups, you can pre-configure API keys in the runtime:

```bash
raven-runtime start \
  --anthropic-key "sk-ant-..." \
  --openai-key "sk-..."
```

## Web Terminal

Raven Docs provides a web-based terminal to interact directly with running agent environments, similar to the console access in GCP or AWS.

### Accessing the Terminal

1. Navigate to an agent's detail page
2. If the agent has an active terminal session, you'll see the **Terminal** section
3. Click **Show Terminal** to expand the terminal view
4. The terminal connects via WebSocket to the agent's PTY session

### Terminal Features

- **Full PTY support** - Standard terminal emulation with xterm.js
- **Real-time streaming** - Input and output are streamed live
- **Resize support** - Terminal adapts to window size
- **Session logging** - All I/O is logged for audit purposes
- **Multiple viewers** - Multiple users can view the same session (read-only for non-attached users)

### Terminal States

| Status | Description |
|--------|-------------|
| Pending | Session created, waiting for runtime connection |
| Connecting | Runtime is establishing PTY connection |
| Active | Terminal is ready for interaction |
| Login Required | Agent needs authentication (opens login URL) |
| Disconnected | Runtime connection lost |
| Terminated | Session has ended |

### How It Works

```
┌─────────────────┐                    ┌─────────────────┐
│   Browser       │◀───WebSocket────▶  │   Raven Docs    │
│   (xterm.js)    │                    │   (Terminal GW) │
└─────────────────┘                    └────────┬────────┘
                                                │
                                                │ WebSocket
                                                ▼
                                       ┌─────────────────┐
                                       │  Agent Runtime  │
                                       │  (PTY Session)  │
                                       └─────────────────┘
```

1. When an agent spawns, the runtime creates a PTY session
2. Runtime connects to Raven Docs Terminal Gateway via WebSocket
3. User's browser connects to the same gateway
4. Input/output is relayed between browser and PTY in real-time

### Runtime Integration

When implementing a custom runtime, include terminal session support:

```javascript
// On agent spawn, create terminal session
const response = await fetch('https://raven-docs.com/api/terminal/sessions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    agentId: agent.id,
    workspaceId: workspaceId,
    runtimeSessionId: ptySession.id,
    runtimeEndpoint: 'wss://runtime.example.com/terminal'
  })
});

// Connect to terminal gateway
const socket = io('wss://raven-docs.com/terminal', {
  query: { runtimeSessionId: ptySession.id }
});

// Relay PTY output to gateway
pty.onData((data) => {
  socket.emit('output', { runtimeSessionId: ptySession.id, data });
});

// Receive input from gateway
socket.on('input', (data) => {
  pty.write(data);
});

// Handle resize
socket.on('resize', ({ cols, rows }) => {
  pty.resize(cols, rows);
});
```

## Monitoring

### Runtime Status

The Agent Settings panel shows:

- **Connection status** - Whether runtime is reachable
- **Last heartbeat** - When runtime last reported status
- **Active agents** - Number of currently running agents
- **Version** - Runtime version for compatibility

### Activity Feed

All agent spawns and status changes are logged in the workspace activity feed:

- Agent spawned
- Agent ready
- Agent failed (with error details)
- Login required
- Terminal session created
- Terminal session terminated

## Troubleshooting

### "Runtime endpoint not configured"

You need to set the runtime endpoint in Settings → Agents → Agent Runtime Hosting.

### "Connection failed"

1. Verify the runtime is running: `curl http://localhost:8765/api/health`
2. Check firewall rules allow the connection
3. Verify the endpoint URL is correct (include protocol)

### "Authentication failed"

1. Verify API key matches between Raven Docs and runtime
2. Check runtime logs for auth errors
3. Try with auth set to "None" for debugging

### "Agent spawn failed"

1. Check runtime logs for detailed error
2. Verify the agent type is supported
3. Ensure required API keys are configured
4. Check available system resources (memory, disk)

### "Login required but no URL shown"

1. Check that WebSocket connection is active
2. Verify the callback URL is reachable from runtime
3. Check browser console for errors

## Security Considerations

### Network Security

- Use HTTPS for production runtime endpoints
- Restrict runtime endpoint to known IPs if possible
- Use API key authentication in production

### API Key Storage

- Runtime API keys are stored encrypted in workspace settings
- Agent API keys (Anthropic, OpenAI) should be configured at runtime level
- Never commit API keys to version control

### Agent Isolation

- Each spawned agent runs in isolated environment
- Agents only have access to resources granted via MCP permissions
- Use resource-level `agentAccessible` flags to protect sensitive content

## WebSocket Events

The frontend receives real-time agent status updates via WebSocket. Connect to the main WebSocket gateway and listen for these events.

### Event Mapping

Parallax runtime emits events that Raven broadcasts to the workspace:

| Parallax Event | Raven Broadcast | Data |
|----------------|-----------------|------|
| `agent_started` | `agent:started` | `{ agent }` |
| `agent_ready` | `agent:ready` | `{ agent }` |
| `login_required` | `agent:login_required` | `{ agent, loginUrl }` |
| `agent_stopped` | `agent:stopped` | `{ agent, reason }` |
| `agent_error` | `agent:error` | `{ agent, error }` |

### Event: `agent:started`

Fired when an agent has started spawning.

```typescript
socket.on('agent:started', (data) => {
  console.log(`Agent ${data.agent.id} is starting`);
  // Add agent to UI list with "starting" status
});
```

### Event: `agent:login_required`

Fired when a spawned agent needs authentication (e.g., device code flow).

```typescript
socket.on('agent:login_required', (data) => {
  // Auto-open terminal to show login instructions
  console.log(`Agent ${data.agent.id} needs login: ${data.loginUrl}`);
  showTerminalPanel(data.agent.id);
});
```

**Recommended behavior:** Auto-open the terminal panel so user can see login instructions.

### Event: `agent:ready`

Fired when an agent has completed authentication and is ready for work.

```typescript
socket.on('agent:ready', (data) => {
  console.log(`Agent ${data.agent.id} is ready`);
  // Update UI to show agent is operational
  updateAgentStatus(data.agent.id, 'ready');
});
```

### Event: `agent:stopped`

Fired when an agent has stopped.

```typescript
socket.on('agent:stopped', (data) => {
  console.log(`Agent ${data.agent.id} stopped: ${data.reason}`);
  // Update UI to show agent is stopped
});
```

### Event: `agent:error`

Fired when an agent encounters an error.

```typescript
socket.on('agent:error', (data) => {
  console.error(`Agent ${data.agent.id} error: ${data.error}`);
  // Show error notification to user
});
```

### Access Management Events

```typescript
// External agent requests access
socket.on('agent:access_requested', (data) => {
  // Show notification to admins about pending request
});

// Agent access granted
socket.on('agent:access_approved', (data) => {
  console.log(`Agent ${data.agent.name} approved`);
});

// Agent access revoked
socket.on('agent:access_revoked', (data) => {
  console.log(`Agent ${data.agent.id} revoked: ${data.reason}`);
});
```

## Terminal Proxy

Raven Docs proxies terminal connections to the Parallax runtime, handling authentication and workspace routing.

### Connecting to a Terminal

```typescript
const termSocket = io('/terminal');

// Attach to an agent's terminal (by agent ID)
termSocket.emit('attach', { agentId: 'agent-123' });

// Or by session ID
termSocket.emit('attach', { sessionId: 'session-456' });

// Handle attachment confirmation
termSocket.on('attached', (session) => {
  console.log(`Attached to session ${session.sessionId}`);
  console.log(`Terminal size: ${session.cols}x${session.rows}`);
});

// Receive terminal output
termSocket.on('data', (output) => {
  xterm.write(output);
});

// Send user input
xterm.onData((input) => {
  termSocket.emit('input', input);
});

// Handle resize
xterm.onResize(({ cols, rows }) => {
  termSocket.emit('resize', { cols, rows });
});

// Handle status changes
termSocket.on('status', (data) => {
  if (data.status === 'login_required') {
    showLoginUrl(data.loginUrl);
  }
});
```

### Resize Handling

When the user resizes the terminal, Raven forwards the resize command to Parallax:

```typescript
// Frontend -> Raven
termSocket.emit('resize', { cols: 120, rows: 40 });

// Raven -> Parallax (internally)
runtimeWs.send(JSON.stringify({ type: 'resize', cols: 120, rows: 40 }));
```

### Binary Data

PTY output can include raw escape sequences and binary data. Raven preserves this data when proxying to ensure proper terminal emulation.

## Parallax Integration

When using Parallax Cloud, agents become **orchestratable** rather than fully autonomous:

```
┌─────────────────┐
│ Parallax Control│
│     Plane       │
└────────┬────────┘
         │ assigns tasks
         ▼
┌─────────────────┐
│  Agent Runtime  │
│  (Claude Code)  │
└────────┬────────┘
         │ MCP tool calls
         ▼
┌─────────────────┐
│   Raven Docs    │
│ (Knowledge Base)│
└─────────────────┘
```

- **Parallax** decides what tasks agents work on
- **Agents** have autonomy in how they accomplish tasks
- **Raven Docs** provides the knowledge, tools, and approval layer

Agents can:
- Receive task assignments from Parallax pattern engine
- Execute tasks using Raven Docs MCP tools
- Report results back to Parallax
- Escalate questions when stuck

## Next Steps

- [Agent Permissions](/concepts/agent#agent-permissions) - Configure what agents can access
- [MCP Tools](/mcp/tools/agent) - API reference for agent operations
- [Agent Invites](/concepts/agent#creating-agent-invites) - Allow external agents to register
