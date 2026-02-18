---
title: Team
sidebar_position: 16
---

# Team Tools

Tools for deploying and managing multi-agent research teams. Teams are groups of AI agents deployed from templates, each with specialized roles that collaborate on research tasks.

## Available Tools

### team_deploy

Deploy a multi-agent research team from a template.

```json
{
  "name": "team_deploy",
  "arguments": {
    "workspaceId": "ws_123",
    "spaceId": "space_456",
    "templateName": "hypothesis-testing",
    "projectId": "proj_789"
  }
}
```

**Arguments:**

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `workspaceId` | string | Yes | Workspace ID |
| `spaceId` | string | Yes | Space to deploy in |
| `templateName` | string | Yes | Team template name |
| `projectId` | string | No | Project to associate with |

**Response:**

```json
{
  "deployment": {
    "id": "deploy_123",
    "templateName": "hypothesis-testing",
    "status": "deploying",
    "agents": [
      { "role": "researcher", "status": "spawning" },
      { "role": "analyst", "status": "spawning" },
      { "role": "critic", "status": "spawning" }
    ],
    "createdAt": "2024-01-15T10:00:00Z"
  }
}
```

### team_status

Get the current status of a team deployment.

```json
{
  "name": "team_status",
  "arguments": {
    "deploymentId": "deploy_123"
  }
}
```

**Response:**

```json
{
  "deployment": {
    "id": "deploy_123",
    "templateName": "hypothesis-testing",
    "status": "active",
    "agents": [
      { "role": "researcher", "status": "active", "lastRunAt": "2024-01-15T12:00:00Z" },
      { "role": "analyst", "status": "active", "lastRunAt": "2024-01-15T12:01:00Z" },
      { "role": "critic", "status": "active", "lastRunAt": "2024-01-15T12:02:00Z" }
    ],
    "runs": 5,
    "lastRunAt": "2024-01-15T12:00:00Z"
  }
}
```

### team_list

List team deployments in a workspace.

```json
{
  "name": "team_list",
  "arguments": {
    "workspaceId": "ws_123",
    "spaceId": "space_456",
    "status": "active"
  }
}
```

**Arguments:**

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `workspaceId` | string | Yes | Workspace ID |
| `spaceId` | string | No | Filter by space |
| `status` | string | No | Filter by status |

### team_trigger

Trigger a single run of all agents in a deployment.

```json
{
  "name": "team_trigger",
  "arguments": {
    "deploymentId": "deploy_123"
  }
}
```

### team_pause

Pause a team deployment. Agents stop their scheduled runs.

```json
{
  "name": "team_pause",
  "arguments": {
    "deploymentId": "deploy_123"
  }
}
```

### team_resume

Resume a paused team deployment.

```json
{
  "name": "team_resume",
  "arguments": {
    "deploymentId": "deploy_123"
  }
}
```

### team_teardown

Tear down a team deployment. Stops all agents and cleans up resources.

```json
{
  "name": "team_teardown",
  "arguments": {
    "deploymentId": "deploy_123"
  }
}
```

## Deployment Statuses

| Status | Description |
|--------|-------------|
| `deploying` | Agents are being spawned |
| `active` | Team is running, agents are executing |
| `paused` | Team is paused, no scheduled runs |
| `completed` | Team has finished its work |
| `failed` | Deployment encountered an error |
| `torn_down` | Team has been torn down |

## Team Templates

Templates define the composition and behavior of a research team:

| Template | Agents | Purpose |
|----------|--------|---------|
| `hypothesis-testing` | Researcher, Analyst, Critic | Test and validate hypotheses |
| `literature-review` | Surveyor, Synthesizer, Reviewer | Comprehensive literature analysis |
| `exploration` | Explorer, Mapper, Reporter | Open-ended domain exploration |

Each agent in a template has:

- **Role** — What the agent specializes in
- **System prompt** — Instructions for the agent's behavior
- **Tools** — Which MCP tools the agent can use
- **Schedule** — How often the agent runs

## Example: Deploy and Monitor a Team

```typescript
// Deploy a hypothesis-testing team
const team = await mcp.call("team_deploy", {
  workspaceId: "ws_123",
  spaceId: "space_456",
  templateName: "hypothesis-testing"
});

// Trigger a manual run
await mcp.call("team_trigger", {
  deploymentId: team.deployment.id
});

// Check status
const status = await mcp.call("team_status", {
  deploymentId: team.deployment.id
});

// When done, tear down
await mcp.call("team_teardown", {
  deploymentId: team.deployment.id
});
```

## Related

- [Agent Tools](/mcp/tools/agent) - Individual agent management
- [Hypothesis Tools](/mcp/tools/hypothesis) - Hypotheses teams work on
- [Research Intelligence Guide](/guides/research-intelligence) - Full system overview
