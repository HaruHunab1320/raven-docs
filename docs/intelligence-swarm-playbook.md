# Research Intelligence & Coding Swarm — Playbook

## Overview

The Research Intelligence system lets you create hypotheses, design experiments, and launch autonomous coding agents (swarms) that work on your repos. Agents authenticate interactively via your own CLI subscription (Claude Max, Google AI, etc.) — no API keys required.

## Prerequisites

- A workspace with at least one space
- A git repository URL the agent can clone
- A CLI subscription for your chosen agent type (e.g. Claude Max for `claude-code`)

> **Note:** The server can optionally use workspace-level API keys or environment variables as a fallback, but the primary auth path is interactive login through the agent's CLI.

---

## Step 1: Navigate to the Intelligence Dashboard

1. Open a **Space** from the home page (`/home`)
2. In the sidebar, click **Intelligence** (network icon)
3. You're now on `/spaces/{spaceId}/intelligence`

The dashboard has tabs for: **Overview**, **Experiments**, **Open Questions**, **Domain Graph**, **Patterns**, and **Agents**.

---

## Step 2: Create a Hypothesis (optional)

Gives the system something to test against.

1. Click **"+ New"** (top right) → **New Hypothesis**
2. Fill in your hypothesis title and details
3. Submit

---

## Step 3: Create an Experiment

1. **"+ New"** → **New Experiment**
2. Fill in:
   - **Title** — e.g. "Implement caching layer for search API"
   - **Hypothesis** — link to yours (optional)
   - **Status** — leave as "Planned"
   - **Method** — describe the approach
3. Optionally check **"Launch coding agent after creation"** to go straight to launching
4. Click **"Create & Launch Agent"** (or just "Create Experiment" if not launching)

---

## Step 4: Launch a Coding Agent

### Launch Modal Fields

| Field | Required | Notes |
|-------|----------|-------|
| Task Description | Yes | Be specific about what the agent should do |
| Repository URL | Yes | e.g. `https://github.com/org/repo.git` |
| Agent Type | No | Default: `claude-code`. Also: `gemini-cli`, `aider`, `codex` |
| Base Branch | No | Default: `main` |
| Branch Name | No | Auto-generated as `experiment/{id}` if empty |
| Experiment | No | Pre-filled if launched from an experiment |

### Ways to Launch

| Method | How |
|--------|-----|
| From the menu | **"+ New" → "Launch Agent"** (blank modal) |
| From an experiment | **Experiments tab → play button** on the card (pre-filled) |
| After creating an experiment | Check "Launch coding agent after creation" in the create modal |

---

## Step 5: Authenticate (first time only)

When the agent spawns without existing auth:

1. Execution status goes **orange — "Login Required"**
2. The terminal automatically opens the provider's login page in a new browser tab (e.g. Anthropic OAuth for Claude Code)
3. Complete the login flow in your browser
4. The agent detects the auth and transitions to **"Running"**

You can also open the terminal view from the Agents tab to see the prompt directly and click the **"Login"** button.

---

## Step 6: Monitor Execution

1. Switch to the **"Agents" tab** on the intelligence dashboard
2. Watch the live status progression:

```
pending → provisioning → spawning → login_required (if needed) → running → capturing → finalizing → completed
```

3. Updates arrive via WebSocket — no manual refresh needed
4. **"View Logs"** — expand any execution row to see terminal output
5. **Stop button** (red icon) — cancel a running execution

---

## Step 7: See Results

When the swarm completes:

- It **commits, pushes, and creates a PR** on the target repo
- If linked to an experiment, the experiment metadata is updated with:
  - PR URL (`codeRef`)
  - PR number
  - Commit SHA
  - Status → `completed`
- Navigate to the experiment page to see the linked PR

---

## Quick Reference

| I want to... | Do this |
|---|---|
| Launch agent for a new task | **"+ New" → "Launch Agent"** |
| Launch agent for an existing experiment | **Experiments tab → play icon** |
| Create experiment + launch together | **"+ New" → "New Experiment"** → check "Launch coding agent" |
| Monitor running agents | **Agents tab** |
| Authenticate a new agent | Wait for orange "Login Required" → complete browser login |
| Stop a running agent | **Agents tab → red stop button** |

---

## Execution Statuses

| Status | Meaning |
|--------|---------|
| `pending` | Execution created, waiting for processing |
| `provisioning` | Cloning repo and setting up git workspace |
| `spawning` | Starting the coding agent process |
| `login_required` | Agent needs authentication — login via browser |
| `running` | Agent is actively working on the task |
| `capturing` | Agent finished, capturing results |
| `finalizing` | Committing, pushing, and creating PR |
| `completed` | Done — PR created, experiment updated |
| `failed` | Something went wrong (check logs) |
| `cancelled` | Manually stopped by user |

---

## Architecture Notes

- Agents run locally via PTY (pseudo-terminal) managed by `pty-manager` + `coding-agent-adapters`
- Each execution gets an isolated git worktree branched from the base branch
- WebSocket events (`swarm:status_changed`, `swarm:completed`) provide real-time UI updates
- The swarm processor runs asynchronously via BullMQ queue
- Workspace cleanup is scheduled 30 minutes after completion (5 minutes after failure/cancel)
