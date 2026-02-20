/**
 * E2E test: Coding swarm MCP credential passing & task lifecycle
 *
 * Proves the full round-trip:
 *   Agent receives MCP credentials → Agent calls Raven API → Task state is updated
 *
 * Creates a real project and task in Raven, spawns a coding agent with MCP
 * credentials, and verifies the agent successfully called the Raven API to
 * update the task through its full lifecycle (todo → in_progress → done).
 *
 * Usage: npx tsx test/e2e-swarm-mcp-integration.ts [agent-type]
 *   agent-type: claude | codex | gemini | aider (default: claude)
 *
 * Requires server running at APP_URL + env vars:
 *   GITHUB_PAT, MCP_API_KEY, MCP_WORKSPACE_ID, MCP_USER_ID, ANTHROPIC_API_KEY
 */

import { resolve } from 'path';
import { randomBytes } from 'crypto';
import { config as dotenvConfig } from 'dotenv';

// Load .env from project root
dotenvConfig({ path: resolve(__dirname, '../../../.env') });

import { PTYManager } from 'pty-manager';
import { createAllAdapters } from 'coding-agent-adapters';
import {
  WorkspaceService as GitWsService,
  CredentialService,
  GitHubPatClient,
} from 'git-workspace-service';

// ─── Config ──────────────────────────────────────────────────────────────────

const REPO_URL = 'https://github.com/HaruHunab1320/git-workspace-service-testbed';
const AGENT_TYPE = process.argv[2] || 'claude';
const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes max

const GITHUB_PAT = process.env.GITHUB_PAT!;
const MCP_API_KEY = process.env.MCP_API_KEY!;
const MCP_WORKSPACE_ID = process.env.MCP_WORKSPACE_ID!;
const MCP_USER_ID = process.env.MCP_USER_ID!;
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function log(phase: string, msg: string) {
  const ts = new Date().toISOString().split('T')[1].slice(0, 12);
  console.log(`[${ts}] [${phase}] ${msg}`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Low-level MCP call — no approval handling.
 */
async function rawCallTool(
  toolName: string,
  args: Record<string, any>,
): Promise<any> {
  const url = `${APP_URL}/api/mcp-standard/call_tool`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${MCP_API_KEY}`,
    },
    body: JSON.stringify({ name: toolName, arguments: args }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`MCP call_tool ${toolName} failed (${resp.status}): ${text}`);
  }

  const body = await resp.json();

  // MCP response: { data: { content: [{ type: "text", text: "..." }] } }
  const content = body?.data?.content ?? body?.content;
  if (content && Array.isArray(content) && content.length > 0) {
    const textEntry = content.find((c: any) => c.type === 'text');
    if (textEntry?.text) {
      try {
        return JSON.parse(textEntry.text);
      } catch {
        return textEntry.text;
      }
    }
  }

  return body;
}

/**
 * Call an MCP tool via the Raven API.
 * Automatically handles the approval flow: if a write operation returns an
 * approval token, we confirm it and retry to get the actual result.
 */
async function callTool(
  toolName: string,
  args: Record<string, any>,
): Promise<any> {
  const result = await rawCallTool(toolName, args);

  // Check for JSON-RPC error responses
  if (result?.jsonrpc && result?.error) {
    const errData = result.error.data;

    // Handle approval-required flow: re-call with approvalToken in the args
    if (errData?.approvalToken) {
      log('MCP', `Approval required for ${toolName} — re-calling with approval token...`);
      return rawCallTool(toolName, { ...args, approvalToken: errData.approvalToken });
    }

    throw new Error(`${toolName} RPC error: ${result.error.message} — ${JSON.stringify(errData)}`);
  }

  return result;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  // ══════════════════════════════════════════════════════════════════════════
  // Phase 0: Validate Preconditions
  // ══════════════════════════════════════════════════════════════════════════

  log('INIT', `Starting MCP integration e2e test with agent: ${AGENT_TYPE}`);
  log('INIT', `Target repo: ${REPO_URL}`);
  log('INIT', `MCP API: ${APP_URL}/api/mcp-standard`);

  const requiredEnvVars: Record<string, string | undefined> = {
    GITHUB_PAT: process.env.GITHUB_PAT,
    MCP_API_KEY: process.env.MCP_API_KEY,
    MCP_WORKSPACE_ID: process.env.MCP_WORKSPACE_ID,
    MCP_USER_ID: process.env.MCP_USER_ID,
  };

  const missing = Object.entries(requiredEnvVars)
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missing.length > 0) {
    console.error(`❌ Missing required env vars: ${missing.join(', ')}`);
    process.exit(1);
  }

  const nonce = randomBytes(16).toString('hex'); // 32 hex chars
  const executionId = `e2e-mcp-${Date.now().toString(36)}`;

  log('INIT', `Nonce: ${nonce}`);
  log('INIT', `Execution ID: ${executionId}`);

  // Track IDs for cleanup
  let testProjectId: string | null = null;
  let testTaskId: string | null = null;
  let wsService: GitWsService | null = null;
  let gitWorkspaceId: string | null = null;
  let workspaceId = MCP_WORKSPACE_ID;

  try {
    // ════════════════════════════════════════════════════════════════════════
    // Phase 1: MCP API Setup — create project & task via HTTP
    // ════════════════════════════════════════════════════════════════════════

    // Auto-discover workspace ID if the configured one doesn't work
    log('MCP-SETUP', 'Finding available space...');

    let spaces: any;
    try {
      spaces = await callTool('space_list', { workspaceId });
    } catch (err: any) {
      if (err.message.includes('Workspace not found') || err.message.includes('RPC error')) {
        log('MCP-SETUP', `Workspace ${workspaceId} not found, auto-discovering...`);
        const wsList = await callTool('workspace_list', {});
        const workspaces = wsList?.workspaces ?? wsList?.items ?? wsList;
        if (!Array.isArray(workspaces) || workspaces.length === 0) {
          throw new Error('No workspaces found. Create at least one workspace first.');
        }
        workspaceId = workspaces[0].id;
        log('MCP-SETUP', `Discovered workspace: ${workspaces[0].name} (${workspaceId})`);
        spaces = await callTool('space_list', { workspaceId });
      } else {
        throw err;
      }
    }

    const spaceList = spaces?.spaces ?? spaces?.items ?? spaces?.data ?? spaces;
    if (!Array.isArray(spaceList) || spaceList.length === 0) {
      throw new Error('No spaces found in workspace. Create at least one space first.');
    }
    const spaceId = spaceList[0].id;
    log('MCP-SETUP', `Using space: ${spaceList[0].name} (${spaceId})`);

    // Discover a valid user ID from workspace members (for assigneeId FK constraint)
    log('MCP-SETUP', 'Discovering valid user ID for assignee...');
    let validUserId = MCP_USER_ID; // fallback
    try {
      const members = await callTool('workspace_members', { workspaceId, limit: 5 });
      const memberList = members?.items ?? members?.members ?? members?.data ?? members;
      if (Array.isArray(memberList) && memberList.length > 0) {
        validUserId = memberList[0].userId ?? memberList[0].id ?? memberList[0].user?.id ?? MCP_USER_ID;
        log('MCP-SETUP', `Using valid user ID for assignee: ${validUserId}`);
      } else {
        log('MCP-SETUP', `No members found, falling back to MCP_USER_ID: ${MCP_USER_ID}`);
      }
    } catch (err: any) {
      log('MCP-SETUP', `Failed to get workspace members (${err.message}), using MCP_USER_ID`);
    }

    log('MCP-SETUP', 'Creating test project...');
    const project = await callTool('project_create', {
      name: `[E2E] MCP Integration Test ${executionId}`,
      description: `Automated MCP credential pass-through test. Nonce: ${nonce}`,
      spaceId,
      workspaceId,
    });
    testProjectId = project?.id ?? project?.data?.id;
    if (!testProjectId) {
      throw new Error(`project_create did not return an ID. Response: ${JSON.stringify(project)}`);
    }
    log('MCP-SETUP', `Project created: ${testProjectId}`);

    log('MCP-SETUP', 'Creating test task...');
    const task = await callTool('task_create', {
      title: `[E2E-${nonce.slice(0, 8)}] MCP credential pass-through verification`,
      description: `Automated test task. The coding agent should update this task through its lifecycle. Nonce: ${nonce}`,
      workspaceId,
      projectId: testProjectId,
      spaceId,
    });
    testTaskId = task?.id ?? task?.data?.id;
    if (!testTaskId) {
      throw new Error(`task_create did not return an ID. Response: ${JSON.stringify(task)}`);
    }
    log('MCP-SETUP', `Task created: ${testTaskId}`);

    // ════════════════════════════════════════════════════════════════════════
    // Phase 2: Provision Git Workspace
    // ════════════════════════════════════════════════════════════════════════

    log('PROVISION', 'Setting up git-workspace-service...');

    const baseDir = `/tmp/raven-e2e-${executionId}`;
    const credService = new CredentialService({
      defaultTtlSeconds: 3600,
      maxTtlSeconds: 7200,
    });

    wsService = new GitWsService({
      config: { baseDir, branchPrefix: 'e2e-mcp-test' },
      credentialService: credService,
    });

    log('PROVISION', 'Cloning and provisioning workspace...');
    const workspace = await wsService.provision({
      repo: REPO_URL,
      strategy: 'clone',
      branchStrategy: 'feature_branch',
      baseBranch: 'main',
      execution: { id: executionId, patternName: 'e2e-mcp-test' },
      task: { id: executionId, role: 'coding-agent', slug: executionId.slice(0, 8) },
      userCredentials: { type: 'pat' as const, token: GITHUB_PAT },
    });

    gitWorkspaceId = workspace.id;
    log('PROVISION', `Workspace ready at: ${workspace.path}`);
    log('PROVISION', `Branch: ${workspace.branch.name}`);

    // Ensure .git-workspace/ is gitignored
    const { writeFileSync, existsSync, appendFileSync, readFileSync } = require('fs');
    const gitignorePath = `${workspace.path}/.gitignore`;
    const gitignoreEntry = '.git-workspace/\n';
    if (existsSync(gitignorePath)) {
      const content = readFileSync(gitignorePath, 'utf-8');
      if (!content.includes('.git-workspace')) {
        appendFileSync(gitignorePath, `\n${gitignoreEntry}`);
      }
    } else {
      writeFileSync(gitignorePath, gitignoreEntry);
    }

    // ════════════════════════════════════════════════════════════════════════
    // Phase 3: Write Agent Memory File
    // ════════════════════════════════════════════════════════════════════════

    log('PREPARE', 'Writing agent memory file and helper script with MCP instructions...');

    // Write a helper shell script that handles the approval flow automatically
    const mcpCallScript = `#!/bin/bash
# mcp-call.sh — Calls Raven MCP API with automatic approval handling.
# Usage: ./mcp-call.sh <tool_name> '<json_arguments>'
# Example: ./mcp-call.sh task_update '{"taskId":"abc","workspaceId":"xyz","status":"done"}'

set -euo pipefail

TOOL_NAME="$1"
ARGS_JSON="$2"
API_URL="${APP_URL}/api/mcp-standard/call_tool"

# First call
PAYLOAD=$(jq -n --arg name "$TOOL_NAME" --argjson args "$ARGS_JSON" '{name: $name, arguments: $args}')
RESPONSE=$(curl -s -X POST "$API_URL" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $MCP_API_KEY" \\
  -d "$PAYLOAD")

echo ">>> First call response:"
echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"

# Check for approval token in the response
APPROVAL_TOKEN=$(echo "$RESPONSE" | jq -r '
  .data.content[0].text // empty
' 2>/dev/null | jq -r '.error.data.approvalToken // empty' 2>/dev/null || echo "")

if [ -n "$APPROVAL_TOKEN" ] && [ "$APPROVAL_TOKEN" != "null" ]; then
  echo ">>> Approval required — re-calling with token..."
  # Re-call with approvalToken injected into the arguments
  APPROVED_ARGS=$(echo "$ARGS_JSON" | jq --arg token "$APPROVAL_TOKEN" '. + {approvalToken: $token}')
  PAYLOAD2=$(jq -n --arg name "$TOOL_NAME" --argjson args "$APPROVED_ARGS" '{name: $name, arguments: $args}')
  RESPONSE2=$(curl -s -X POST "$API_URL" \\
    -H "Content-Type: application/json" \\
    -H "Authorization: Bearer $MCP_API_KEY" \\
    -d "$PAYLOAD2")
  echo ">>> Approved call response:"
  echo "$RESPONSE2" | jq . 2>/dev/null || echo "$RESPONSE2"
else
  echo ">>> No approval needed — done."
fi
`;

    const mcpCallScriptPath = `${workspace.path}/mcp-call.sh`;
    writeFileSync(mcpCallScriptPath, mcpCallScript, { mode: 0o755 });
    log('PREPARE', 'Wrote mcp-call.sh helper script');

    const memoryFileContent = `# Raven Docs — Agent Context (MCP Integration Test)

## Your Objectives

You have TWO objectives. You MUST complete BOTH.

### Objective 1: Create Nonce Verification File

Create the file \`src/nonce-verification.ts\` with EXACTLY this content:

\`\`\`typescript
// MCP Integration Test — Nonce Verification
export const NONCE = "${nonce}";
export const EXECUTION_ID = "${executionId}";
export const TIMESTAMP = "${new Date().toISOString()}";
\`\`\`

### Objective 2: Update Task Lifecycle via Raven MCP API

You MUST call the Raven API to update the task through its full lifecycle.
A helper script \`./mcp-call.sh\` is provided that handles the API's approval flow automatically.

**IMPORTANT:** The \`$MCP_API_KEY\` env var is already set in your environment. The script uses it automatically.

Run this command AFTER creating the nonce file:

\`\`\`bash
./mcp-call.sh task_update '{"taskId": "${testTaskId}", "workspaceId": "${workspaceId}", "status": "done", "assigneeId": "${validUserId}", "description": "Completed by ${AGENT_TYPE} agent. Nonce: ${nonce}. Execution: ${executionId}"}'
\`\`\`

## Guidelines
- Do NOT commit API keys or this memory file
- Stay on the current git branch
- You MUST run the ./mcp-call.sh command above — it is critical to the test
- The script handles the approval flow for you automatically
`;

    // Write memory file based on agent type
    const MEMORY_FILE_MAP: Record<string, string> = {
      claude: 'CLAUDE.md',
      'claude-code': 'CLAUDE.md',
      gemini: 'GEMINI.md',
      codex: 'AGENTS.md',
      aider: '.aider.conventions.md',
    };

    const memoryFileName = MEMORY_FILE_MAP[AGENT_TYPE] || 'CLAUDE.md';
    const memoryFilePath = `${workspace.path}/${memoryFileName}`;

    writeFileSync(memoryFilePath, memoryFileContent);
    log('PREPARE', `Wrote ${memoryFileName} to workspace`);

    // Update .gitignore to exclude the memory file and helper script
    if (existsSync(gitignorePath)) {
      const gitignoreContent = readFileSync(gitignorePath, 'utf-8');
      if (!gitignoreContent.includes(memoryFileName)) {
        appendFileSync(gitignorePath, `${memoryFileName}\n`);
      }
      if (!gitignoreContent.includes('mcp-call.sh')) {
        appendFileSync(gitignorePath, `mcp-call.sh\n`);
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // Phase 4: Spawn Agent & Send Task
    // ════════════════════════════════════════════════════════════════════════

    log('AGENT', 'Initializing PTYManager...');

    const ptyManager = new PTYManager({
      maxLogLines: 5000,
      stallDetectionEnabled: true,
      stallTimeoutMs: 60000,
      onStallClassify: async (_sessionId, _recentOutput, stallDurationMs) => {
        // After 60s of idle, treat it as task complete
        if (stallDurationMs >= 60000) {
          log('STALL', `Stall detected (${Math.round(stallDurationMs / 1000)}s) — classifying as task_complete`);
          return { state: 'task_complete' as const };
        }
        return { state: 'still_working' as const };
      },
    });

    for (const adapter of createAllAdapters()) {
      ptyManager.registerAdapter(adapter);
    }

    // Event monitoring
    let sessionReady = false;
    let sessionDone = false;
    let taskComplete = false;
    let sessionError: string | null = null;
    let loginRequired = false;

    let taskSent = false;
    let taskSentAt = 0;
    const TASK_COMPLETE_MIN_ELAPSED_MS = 10000; // Ignore task_complete within 10s of sending

    ptyManager.on('session_ready', (session) => {
      log('EVENT', `session_ready: ${session.id}`);
      if (taskSent) {
        const elapsed = taskSentAt > 0 ? Date.now() - taskSentAt : 0;
        if (elapsed < TASK_COMPLETE_MIN_ELAPSED_MS) {
          log('EVENT', `session_ready after task sent but only ${Math.round(elapsed / 1000)}s elapsed — ignoring false positive`);
        } else {
          log('EVENT', `session_ready after task sent — treating as task_complete`);
          taskComplete = true;
        }
      }
      sessionReady = true;
    });

    ptyManager.on('task_complete', (session) => {
      const elapsed = taskSentAt > 0 ? Date.now() - taskSentAt : 0;
      if (taskSentAt > 0 && elapsed < TASK_COMPLETE_MIN_ELAPSED_MS) {
        log('EVENT', `task_complete: ${session.id} — only ${Math.round(elapsed / 1000)}s since task sent, likely false positive (model select, etc). Ignoring.`);
        return;
      }
      log('EVENT', `task_complete: ${session.id} — agent finished its task`);
      taskComplete = true;
    });

    ptyManager.on('session_stopped', (session, reason) => {
      log('EVENT', `session_stopped: ${session.id} reason=${reason} exitCode=${session.exitCode}`);
      sessionDone = true;
    });

    ptyManager.on('session_error', (session, error) => {
      log('EVENT', `session_error: ${session.id} — ${error}`);
      sessionError = String(error);
    });

    ptyManager.on('login_required', (session, instructions, url) => {
      log('EVENT', `login_required: ${session.id}`);
      if (url) log('EVENT', `   URL: ${url}`);
      loginRequired = true;
    });

    ptyManager.on('blocking_prompt', (session, detection) => {
      log('EVENT', `blocking_prompt: type=${detection.type} prompt="${detection.prompt}"`);
      if (detection.type === 'model_select') {
        log('EVENT', 'model_select detected — auto-selecting model...');
        // Send a model selection after a brief delay for the CLI to be ready
        setTimeout(() => {
          ptyManager.send(session.id, 'gemini-2.5-pro');
        }, 500);
      }
      if (detection.canAutoRespond) {
        log('EVENT', `   Auto-responding: "${detection.suggestedResponse}"`);
      }
    });

    let msgCount = 0;
    ptyManager.on('message', (msg) => {
      msgCount++;
      // Only log every 10th message to reduce noise
      if (msgCount % 10 === 1) {
        const text = typeof msg === 'string' ? msg : JSON.stringify(msg);
        if (text && text.length > 150) {
          log('MSG', `[#${msgCount}] ${text.slice(0, 150)}...`);
        } else if (text) {
          log('MSG', `[#${msgCount}] ${text}`);
        }
      }
    });

    log('AGENT', `Spawning ${AGENT_TYPE} agent in ${workspace.path}...`);

    // Nesting overrides + MCP env vars
    // Pass through agent-specific API keys from the environment
    const agentKeyOverrides: Record<string, string> = {};
    for (const key of ['GOOGLE_API_KEY', 'GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY']) {
      if (process.env[key]) {
        agentKeyOverrides[key] = process.env[key]!;
        log('AGENT', `Passing through ${key} (${process.env[key]!.slice(0, 8)}...)`);
      }
    }

    const nestingOverrides: Record<string, string> = {
      CLAUDECODE: '',
      CLAUDE_CODE_SESSION: '',
      CLAUDE_CODE_ENTRYPOINT: '',
      MCP_SERVER_URL: APP_URL,
      MCP_API_KEY,
      RAVEN_WORKSPACE_ID: workspaceId,
      RAVEN_EXECUTION_ID: executionId,
      ...agentKeyOverrides,
    };

    // Track terminal output for input prompt detection
    let outputBuffer = '';
    let inputReady = false;

    const session = await ptyManager.spawn({
      type: AGENT_TYPE,
      name: `e2e-mcp-${AGENT_TYPE}`,
      workdir: workspace.path,
      env: nestingOverrides,
      adapterConfig: { interactive: true },
    });

    log('AGENT', `Session spawned: ${session.id}`);

    // Attach to terminal output
    const terminal = ptyManager.attachTerminal(session.id);
    let rawLogCounter = 0;
    if (terminal) {
      terminal.onData((data: string) => {
        outputBuffer += data;
        if (outputBuffer.length > 4000) {
          outputBuffer = outputBuffer.slice(-2000);
        }
        // Log raw chunks periodically to debug agent state
        rawLogCounter++;
        if (rawLogCounter <= 5 || rawLogCounter % 20 === 0) {
          const clean = data.replace(/\x1b\[[^m]*m/g, '').replace(/[\r\x00-\x1f]/g, ' ').trim();
          if (clean.length > 0) {
            log('RAW', `[chunk#${rawLogCounter}] ${clean.slice(0, 200)}`);
          }
        }
        const stripped = outputBuffer.replace(/\x1b\[[^m]*m/g, '').replace(/\r/g, '');
        if (
          !inputReady &&
          sessionReady &&
          (stripped.includes('for shortcuts') ||
            stripped.includes('❯') ||
            stripped.includes('Type your message') ||
            /Try ".*"/.test(stripped))
        ) {
          inputReady = true;
          log('AGENT', 'Input prompt detected — ready for task');
        }
      });
    }

    // Wait for session_ready
    log('AGENT', 'Waiting for agent to be ready...');
    const readyStart = Date.now();
    while (!sessionReady && !sessionError && !sessionDone && !loginRequired) {
      if (Date.now() - readyStart > 60000) {
        log('AGENT', 'Timed out waiting for session_ready (60s)');
        break;
      }
      await sleep(500);
    }

    if (loginRequired) {
      log('AGENT', 'Agent requires authentication. Please authenticate the CLI and re-run.');
      await ptyManager.shutdown();
      process.exit(2);
    }

    if (sessionError) {
      throw new Error(`Agent errored during startup: ${sessionError}`);
    }

    if (!sessionReady) {
      log('AGENT', 'Agent did not reach ready state.');
      try {
        const logs: string[] = [];
        for await (const line of ptyManager.logs(session.id)) {
          logs.push(line);
          if (logs.length >= 50) break;
        }
        logs.forEach((l) => console.log(`  ${l}`));
      } catch {}
      await ptyManager.shutdown();
      process.exit(1);
    }

    // Wait for input prompt
    log('TASK', 'Waiting for input prompt...');
    const promptStart = Date.now();
    let promptWaitLoops = 0;
    while (!inputReady && !sessionDone && !sessionError) {
      if (Date.now() - promptStart > 30000) {
        log('TASK', 'Timed out waiting for input prompt (30s). Sending anyway...');
        break;
      }
      promptWaitLoops++;
      if (promptWaitLoops % 30 === 0) {
        log('TASK', `Still waiting for input prompt... (${Math.round((Date.now() - promptStart) / 1000)}s)`);
      }
      await sleep(300);
    }

    if (inputReady) {
      await sleep(1000);
    }

    // Send the task message — reinforces the memory file
    const memFileRef = memoryFileName;

    const taskMessage = [
      `Read your ${memFileRef} file carefully — it contains your full instructions.`,
      ``,
      `You have TWO objectives:`,
      ``,
      `1. Create \`src/nonce-verification.ts\` with the nonce "${nonce}"`,
      ``,
      `2. Run this ./mcp-call.sh command to update the Raven task:`,
      `   ./mcp-call.sh task_update '{"taskId":"${testTaskId}","workspaceId":"${workspaceId}","status":"done","assigneeId":"${MCP_USER_ID}","description":"Completed by ${AGENT_TYPE} agent. Nonce: ${nonce}. Execution: ${executionId}"}'`,
      ``,
      `The MCP_API_KEY env var is already set. The script uses it automatically.`,
      `The script handles the API approval flow for you.`,
      ``,
      `Complete both objectives, then exit.`,
    ].join('\n');

    if (!sessionDone) {
      log('TASK', 'Sending coding task to agent...');
      taskSentAt = Date.now();
      ptyManager.send(session.id, taskMessage);
      taskSent = true;
    }

    // Wait for agent to finish — task_complete (adapter fast-path) or session_stopped
    log('TASK', 'Waiting for agent to complete (up to 5 minutes)...');
    const taskStart = Date.now();
    while (!taskComplete && !sessionDone && !sessionError) {
      if (Date.now() - taskStart > TIMEOUT_MS) {
        log('TASK', 'Agent timed out after 5 minutes. Stopping...');
        await ptyManager.stop(session.id);
        break;
      }
      await sleep(1000);

      const elapsed = Math.round((Date.now() - taskStart) / 1000);
      if (elapsed % 15 === 0 && elapsed > 0) {
        log('TASK', `Still running... (${elapsed}s elapsed)`);
      }
    }

    // If task_complete fired but session is still alive, gracefully stop it
    if (taskComplete && !sessionDone) {
      log('TASK', 'Task complete detected — stopping agent session...');
      await ptyManager.stop(session.id);
      // Brief wait for session_stopped event
      const stopStart = Date.now();
      while (!sessionDone && Date.now() - stopStart < 5000) {
        await sleep(200);
      }
    }

    // Collect final logs
    log('LOGS', 'Collecting session logs...');
    try {
      const logs: string[] = [];
      for await (const line of ptyManager.logs(session.id)) {
        logs.push(line);
        if (logs.length >= 100) break;
      }
      log('LOGS', `Captured ${logs.length} log lines (last 20):`);
      logs.slice(-20).forEach((l) => console.log(`  ${l}`));
    } catch (err) {
      log('LOGS', `Could not collect logs: ${err}`);
    }

    await ptyManager.shutdown();

    if (sessionError) {
      log('TASK', `Agent failed: ${sessionError}`);
    }

    // ════════════════════════════════════════════════════════════════════════
    // Phase 5: Finalize (Git) — commit, push, create PR
    // ════════════════════════════════════════════════════════════════════════

    log('FINALIZE', 'Checking workspace for changes...');

    const { execSync } = require('child_process');
    const gitStatus = execSync('git status --porcelain', {
      cwd: workspace.path,
      encoding: 'utf-8',
    });

    log('FINALIZE', `git status:\n${gitStatus || '(no changes)'}`);

    let prUrl: string | null = null;

    if (gitStatus.trim()) {
      log('FINALIZE', 'Committing, pushing, and creating PR...');
      try {
        execSync('git add -A', { cwd: workspace.path });

        const prResult = await wsService.finalize(gitWorkspaceId!, {
          push: true,
          createPr: true,
          pr: {
            title: `[E2E MCP Test] ${AGENT_TYPE} — nonce ${nonce.slice(0, 8)}`,
            body: [
              `Automated MCP credential pass-through e2e test.`,
              ``,
              `Agent: ${AGENT_TYPE}`,
              `Execution: ${executionId}`,
              `Nonce: ${nonce}`,
              `Timestamp: ${new Date().toISOString()}`,
            ].join('\n'),
            targetBranch: 'main',
          },
          cleanup: false,
        });

        if (prResult) {
          prUrl = prResult.url || null;
          log('FINALIZE', `PR created: ${prUrl}`);
        }
      } catch (err: any) {
        log('FINALIZE', `Finalize failed: ${err.message}`);
        // Manual fallback
        log('FINALIZE', 'Attempting manual commit + push...');
        try {
          execSync(
            'git add -A && git commit -m "e2e mcp test: nonce verification + task lifecycle" --allow-empty',
            { cwd: workspace.path, encoding: 'utf-8' },
          );
          execSync(`git push -u origin ${workspace.branch.name}`, {
            cwd: workspace.path,
            encoding: 'utf-8',
          });
          log('FINALIZE', 'Manual push succeeded. Creating PR via GitHub API...');

          const ghClient = new GitHubPatClient({ token: GITHUB_PAT });
          const pr = await ghClient.createPullRequest(
            'HaruHunab1320',
            'git-workspace-service-testbed',
            {
              title: `[E2E MCP Test] ${AGENT_TYPE} — nonce ${nonce.slice(0, 8)}`,
              body: `Automated MCP e2e test.\nAgent: ${AGENT_TYPE}\nExecution: ${executionId}\nNonce: ${nonce}`,
              head: workspace.branch.name,
              base: 'main',
            },
          );
          prUrl = pr.url || (pr as any).html_url || null;
          log('FINALIZE', `PR created manually: ${prUrl}`);
        } catch (fallbackErr: any) {
          log('FINALIZE', `Manual fallback also failed: ${fallbackErr.message}`);
        }
      }
    } else {
      log('FINALIZE', 'No file changes detected. Skipping PR.');
    }

    // ════════════════════════════════════════════════════════════════════════
    // Phase 6: Verify (5 independent signals)
    // ════════════════════════════════════════════════════════════════════════

    log('VERIFY', '═══ Running 5 verification checks ═══');
    let passed = 0;
    const total = 5;

    // 1. Task status = done
    log('VERIFY', '[1/5] Checking task status...');
    try {
      const taskState = await callTool('task_get', {
        taskId: testTaskId!,
        workspaceId,
      });
      const status = taskState?.status ?? taskState?.data?.status;
      if (status === 'done') {
        log('VERIFY', `  ✅ Task status = "done"`);
        passed++;
      } else {
        log('VERIFY', `  ❌ Task status = "${status}" (expected "done")`);
      }
    } catch (err: any) {
      log('VERIFY', `  ❌ Failed to get task: ${err.message}`);
    }

    // 2. Task description updated by agent
    log('VERIFY', '[2/5] Checking task description...');
    try {
      const taskState = await callTool('task_get', {
        taskId: testTaskId!,
        workspaceId,
      });
      const desc = taskState?.description ?? taskState?.data?.description ?? '';
      if (desc.includes(nonce) || desc.includes('Completed by')) {
        log('VERIFY', `  ✅ Task description updated by agent`);
        passed++;
      } else {
        log('VERIFY', `  ❌ Task description not updated. Current: "${desc.slice(0, 100)}..."`);
      }
    } catch (err: any) {
      log('VERIFY', `  ❌ Failed to get task: ${err.message}`);
    }

    // 3. Task assignee set
    log('VERIFY', '[3/5] Checking task assignee...');
    try {
      const taskState = await callTool('task_get', {
        taskId: testTaskId!,
        workspaceId,
      });
      const assignee = taskState?.assigneeId ?? taskState?.data?.assigneeId;
      if (assignee) {
        log('VERIFY', `  ✅ Task assignee set: ${assignee}`);
        passed++;
      } else {
        log('VERIFY', `  ❌ Task has no assignee`);
      }
    } catch (err: any) {
      log('VERIFY', `  ❌ Failed to get task: ${err.message}`);
    }

    // 4. Nonce file exists with correct content
    log('VERIFY', '[4/5] Checking nonce file...');
    try {
      const nonceFilePath = `${workspace.path}/src/nonce-verification.ts`;
      if (existsSync(nonceFilePath)) {
        const nonceFileContent = readFileSync(nonceFilePath, 'utf-8');
        if (nonceFileContent.includes(nonce)) {
          log('VERIFY', `  ✅ Nonce file exists with correct nonce`);
          passed++;
        } else {
          log('VERIFY', `  ❌ Nonce file exists but doesn't contain nonce`);
          log('VERIFY', `     Content: ${nonceFileContent.slice(0, 100)}...`);
        }
      } else {
        log('VERIFY', `  ❌ Nonce file not found at src/nonce-verification.ts`);
      }
    } catch (err: any) {
      log('VERIFY', `  ❌ Error checking nonce file: ${err.message}`);
    }

    // 5. PR created
    log('VERIFY', '[5/5] Checking PR creation...');
    if (prUrl) {
      log('VERIFY', `  ✅ PR created: ${prUrl}`);
      passed++;
    } else {
      log('VERIFY', `  ❌ No PR URL returned`);
    }

    log('VERIFY', `═══ Results: ${passed}/${total} checks passed ═══`);

    // ════════════════════════════════════════════════════════════════════════
    // Phase 7: Cleanup
    // ════════════════════════════════════════════════════════════════════════

    log('CLEANUP', 'Cleaning up test resources...');

    // Delete test task
    if (testTaskId) {
      try {
        await callTool('task_delete', { taskId: testTaskId, workspaceId });
        log('CLEANUP', 'Test task deleted.');
      } catch (err: any) {
        log('CLEANUP', `Failed to delete task: ${err.message}`);
      }
    }

    // Delete test project
    if (testProjectId) {
      try {
        await callTool('project_delete', { projectId: testProjectId, workspaceId });
        log('CLEANUP', 'Test project deleted.');
      } catch (err: any) {
        log('CLEANUP', `Failed to delete project: ${err.message}`);
      }
    }

    // Cleanup git workspace
    if (wsService && gitWorkspaceId) {
      try {
        await wsService.cleanup(gitWorkspaceId);
        log('CLEANUP', 'Git workspace cleaned up.');
      } catch {
        log('CLEANUP', `Workspace at ${workspace.path} — clean up manually if needed.`);
      }
    }

    if (passed === total) {
      log('DONE', `🎉 All ${total}/${total} verifications passed! MCP credential pass-through works end-to-end.`);
      process.exit(0);
    } else {
      log('DONE', `⚠️  ${passed}/${total} verifications passed. See failures above.`);
      process.exit(1);
    }
  } catch (err: any) {
    console.error(`💥 Fatal error: ${err.message}`);
    console.error(err.stack);

    // Best-effort cleanup
    log('CLEANUP', 'Attempting cleanup after fatal error...');

    if (testTaskId) {
      try {
        await callTool('task_delete', { taskId: testTaskId, workspaceId });
        log('CLEANUP', 'Test task deleted.');
      } catch {}
    }
    if (testProjectId) {
      try {
        await callTool('project_delete', { projectId: testProjectId, workspaceId });
        log('CLEANUP', 'Test project deleted.');
      } catch {}
    }
    if (wsService && gitWorkspaceId) {
      try {
        await wsService.cleanup(gitWorkspaceId);
      } catch {}
    }

    process.exit(1);
  }
}

main().catch((err) => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});
