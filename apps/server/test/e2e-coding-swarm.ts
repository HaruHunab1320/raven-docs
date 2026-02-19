/**
 * E2E test: Full coding swarm pipeline
 *
 * Clone testbed repo → spawn agent → write code → commit → push → create PR
 *
 * Usage: npx tsx test/e2e-coding-swarm.ts [agent-type]
 *   agent-type: claude | codex | gemini | aider (default: claude)
 */

import { resolve } from 'path';
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

// Config
const REPO_URL = 'https://github.com/HaruHunab1320/git-workspace-service-testbed';
const AGENT_TYPE = process.argv[2] || 'claude';
const GITHUB_PAT = process.env.GITHUB_PAT;
const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes max

if (!GITHUB_PAT) {
  console.error('❌ GITHUB_PAT env var is required');
  process.exit(1);
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function log(phase: string, msg: string) {
  const ts = new Date().toISOString().split('T')[1].slice(0, 12);
  console.log(`[${ts}] [${phase}] ${msg}`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  log('INIT', `Starting e2e test with agent: ${AGENT_TYPE}`);
  log('INIT', `Target repo: ${REPO_URL}`);

  const executionId = `e2e-${Date.now().toString(36)}`;

  // ── Phase 1: Provision git workspace ──────────────────────────────────────

  log('PROVISION', 'Setting up git-workspace-service...');

  const baseDir = `/tmp/raven-e2e-${executionId}`;

  const credService = new CredentialService({
    defaultTtlSeconds: 3600,
    maxTtlSeconds: 7200,
  });

  const wsService = new GitWsService({
    config: {
      baseDir,
      branchPrefix: 'e2e-test',
    },
    credentialService: credService,
  });

  log('PROVISION', 'Cloning and provisioning workspace...');

  const workspace = await wsService.provision({
    repo: REPO_URL,
    strategy: 'clone',
    branchStrategy: 'feature_branch',
    baseBranch: 'main',
    execution: {
      id: executionId,
      patternName: 'e2e-test',
    },
    task: {
      id: executionId,
      role: 'coding-agent',
      slug: executionId.slice(0, 8),
    },
    userCredentials: {
      type: 'pat' as const,
      token: GITHUB_PAT,
    },
  });

  const workspaceId = workspace.id; // git-workspace-service internal UUID (needed for finalize)
  log('PROVISION', `Workspace ready at: ${workspace.path}`);
  log('PROVISION', `Workspace ID (gitWsId): ${workspaceId}`);
  log('PROVISION', `Branch: ${workspace.branch.name}`);

  // Ensure .git-workspace directory is gitignored (it contains credential-context.json)
  const { writeFileSync, existsSync, appendFileSync } = require('fs');
  const gitignorePath = `${workspace.path}/.gitignore`;
  const gitignoreEntry = '.git-workspace/\n';
  if (existsSync(gitignorePath)) {
    const content = require('fs').readFileSync(gitignorePath, 'utf-8');
    if (!content.includes('.git-workspace')) {
      appendFileSync(gitignorePath, `\n${gitignoreEntry}`);
    }
  } else {
    writeFileSync(gitignorePath, gitignoreEntry);
  }
  log('PROVISION', 'Added .git-workspace/ to .gitignore');

  // ── Phase 1.5: Prepare workspace — write memory file + MCP env ──────────

  log('PREPARE', 'Writing agent memory file...');

  const MCP_SERVER_URL = process.env.APP_URL || 'http://localhost:3000';
  const MCP_API_KEY = process.env.MCP_API_KEY || ''; // Optional for e2e

  const TOOL_CATEGORIES_SUMMARY = [
    '- **Space Management** (`space`): Create, update, delete spaces',
    '- **Page Management** (`page`): Create, read, update, delete pages',
    '- **Search** (`search`): Full-text search across pages and content',
    '- **Coding Swarm** (`coding_swarm`): Spawn coding agents',
    '- **GitHub Issues** (`github_issues`): Manage GitHub issues',
  ].join('\n');

  const agentContextContent = `# Raven Docs — Agent Context

## Your Task
Create a new file called "src/hello.ts" with a simple TypeScript function.

## Execution Info
- Execution ID: ${executionId}
- Workspace ID: e2e-test

## Raven API Access

You have access to Raven's tool API for interacting with the platform.

**Base URL:** ${MCP_SERVER_URL}/api/mcp-standard
**Auth:** \`Authorization: Bearer $MCP_API_KEY\` (available as env var)

### Discover Tools (no auth required)
\`\`\`
POST ${MCP_SERVER_URL}/api/mcp-standard/search_tools
{"query": "your search term"}
\`\`\`

### Available Tool Categories
${TOOL_CATEGORIES_SUMMARY}

## Guidelines
- Do NOT commit API keys or injected config files
- Stay on the current git branch
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

  writeFileSync(memoryFilePath, agentContextContent);
  log('PREPARE', `Wrote ${memoryFileName} to workspace`);

  // Update .gitignore to exclude the memory file
  if (existsSync(gitignorePath)) {
    const gitignoreContent = require('fs').readFileSync(gitignorePath, 'utf-8');
    if (!gitignoreContent.includes(memoryFileName)) {
      appendFileSync(gitignorePath, `${memoryFileName}\n`);
    }
  } else {
    writeFileSync(gitignorePath, `${gitignoreEntry}${memoryFileName}\n`);
  }
  log('PREPARE', `Added ${memoryFileName} to .gitignore`);

  // ── Phase 2: Spawn coding agent ──────────────────────────────────────────

  log('AGENT', 'Initializing PTYManager...');

  const ptyManager = new PTYManager({
    maxLogLines: 5000,
    stallDetectionEnabled: true,
    stallTimeoutMs: 60000,
  });

  // Register all adapters
  for (const adapter of createAllAdapters()) {
    ptyManager.registerAdapter(adapter);
  }

  // Set up event monitoring
  let sessionReady = false;
  let sessionDone = false;
  let sessionError: string | null = null;
  let loginRequired = false;

  ptyManager.on('session_ready', (session) => {
    log('EVENT', `✅ session_ready: ${session.id}`);
    sessionReady = true;
  });

  ptyManager.on('session_stopped', (session, reason) => {
    log('EVENT', `🛑 session_stopped: ${session.id} reason=${reason} exitCode=${session.exitCode}`);
    sessionDone = true;
  });

  ptyManager.on('session_error', (session, error) => {
    log('EVENT', `❌ session_error: ${session.id} — ${error}`);
    sessionError = String(error);
  });

  ptyManager.on('login_required', (session, instructions, url) => {
    log('EVENT', `🔑 login_required: ${session.id}`);
    log('EVENT', `   Instructions: ${instructions}`);
    if (url) log('EVENT', `   URL: ${url}`);
    loginRequired = true;
  });

  ptyManager.on('blocking_prompt', (session, detection) => {
    log('EVENT', `⚠️  blocking_prompt: type=${detection.type} prompt="${detection.prompt}"`);
    if (detection.canAutoRespond) {
      log('EVENT', `   Auto-responding: "${detection.suggestedResponse}"`);
    }
  });

  ptyManager.on('message', (session, msg) => {
    // Log agent messages (truncated)
    const text = typeof msg === 'string' ? msg : JSON.stringify(msg);
    if (text.length > 200) {
      log('MSG', text.slice(0, 200) + '...');
    } else {
      log('MSG', text);
    }
  });

  log('AGENT', `Spawning ${AGENT_TYPE} agent in ${workspace.path}...`);

  // Override env vars that prevent nesting (PTYManager merges with process.env)
  // Also pass MCP env vars so the agent can call Raven's API
  const nestingOverrides: Record<string, string> = {
    CLAUDECODE: '',
    CLAUDE_CODE_SESSION: '',
    CLAUDE_CODE_ENTRYPOINT: '',
    ...(MCP_SERVER_URL ? { MCP_SERVER_URL } : {}),
    ...(MCP_API_KEY ? { MCP_API_KEY } : {}),
    RAVEN_WORKSPACE_ID: 'e2e-test',
    RAVEN_EXECUTION_ID: executionId,
  };

  // Track output for detecting when the input prompt is ready
  let outputBuffer = '';
  let inputReady = false;

  const session = await ptyManager.spawn({
    type: AGENT_TYPE,
    name: `e2e-${AGENT_TYPE}`,
    workdir: workspace.path,
    env: nestingOverrides,
    adapterConfig: {
      interactive: true,
    },
  });

  log('AGENT', `Session spawned: ${session.id}`);

  // Attach to terminal output to detect when input prompt is ready
  const terminal = ptyManager.attachTerminal(session.id);
  if (terminal) {
    terminal.onData((data: string) => {
      outputBuffer += data;
      // Keep buffer manageable — only last 2000 chars matter
      if (outputBuffer.length > 4000) {
        outputBuffer = outputBuffer.slice(-2000);
      }
      // Detect the actual input prompt — Claude Code shows ❯ or "for shortcuts"
      // when the input field is ready to accept text
      const stripped = outputBuffer.replace(/\x1b\[[^m]*m/g, '').replace(/\r/g, '');
      if (
        !inputReady &&
        sessionReady &&
        (stripped.includes('for shortcuts') ||
          stripped.includes('❯') ||
          /Try ".*"/.test(stripped))
      ) {
        inputReady = true;
        log('AGENT', '📝 Input prompt detected — ready for task');
      }
    });
  }

  // Wait for session to be ready
  log('AGENT', 'Waiting for agent to be ready...');
  const readyStart = Date.now();
  while (!sessionReady && !sessionError && !sessionDone && !loginRequired) {
    if (Date.now() - readyStart > 60000) {
      log('AGENT', '⏰ Timed out waiting for session_ready (60s)');
      break;
    }
    await sleep(500);
  }

  if (loginRequired) {
    log('AGENT', '🔑 Agent requires authentication. Please authenticate the CLI and re-run.');
    await ptyManager.shutdown();
    // Don't clean up workspace so user can debug
    process.exit(2);
  }

  if (sessionError) {
    log('AGENT', `Agent errored during startup: ${sessionError}`);
    await ptyManager.shutdown();
    process.exit(1);
  }

  if (!sessionReady) {
    log('AGENT', 'Agent did not reach ready state. Check logs above.');
    // Try to get logs
    try {
      const logs: string[] = [];
      for await (const line of ptyManager.logs(session.id)) {
        logs.push(line);
        if (logs.length >= 50) break;
      }
      log('AGENT', `Last ${logs.length} log lines:`);
      logs.forEach((l) => console.log(`  ${l}`));
    } catch {}
    await ptyManager.shutdown();
    process.exit(1);
  }

  // ── Phase 3: Send task ────────────────────────────────────────────────────

  const task = `Create a new file called "src/hello.ts" with a simple TypeScript function that returns a greeting message. The function should be called "greet" and take a name parameter. Also create a "src/index.ts" that exports the greet function. Keep it simple — just those two files.`;

  // Wait for the TUI input prompt to be ready (not just session_ready)
  log('TASK', 'Waiting for input prompt...');
  const promptStart = Date.now();
  while (!inputReady && !sessionDone && !sessionError) {
    if (Date.now() - promptStart > 30000) {
      log('TASK', '⏰ Timed out waiting for input prompt (30s). Sending anyway...');
      break;
    }
    await sleep(300);
  }

  // Brief settle time after prompt detected
  if (inputReady) {
    await sleep(1000);
  }

  if (!sessionDone) {
    log('TASK', 'Sending coding task to agent...');
    log('TASK', task);
    ptyManager.send(session.id, task);
  }

  // Wait for agent to finish
  log('TASK', 'Waiting for agent to complete (up to 5 minutes)...');
  const taskStart = Date.now();
  while (!sessionDone && !sessionError) {
    if (Date.now() - taskStart > TIMEOUT_MS) {
      log('TASK', '⏰ Agent timed out after 5 minutes. Stopping...');
      await ptyManager.stop(session.id);
      break;
    }
    await sleep(1000);

    // Print periodic status
    const elapsed = Math.round((Date.now() - taskStart) / 1000);
    if (elapsed % 15 === 0 && elapsed > 0) {
      log('TASK', `Still running... (${elapsed}s elapsed)`);
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

  // Shutdown PTYManager
  await ptyManager.shutdown();

  if (sessionError) {
    log('TASK', `Agent failed: ${sessionError}`);
    process.exit(1);
  }

  // ── Phase 4: Check results ────────────────────────────────────────────────

  log('VERIFY', 'Checking workspace for new files...');

  const { execSync } = require('child_process');
  const gitStatus = execSync('git status --porcelain', {
    cwd: workspace.path,
    encoding: 'utf-8',
  });

  log('VERIFY', `git status:\n${gitStatus || '(no changes)'}`);

  if (!gitStatus.trim()) {
    log('VERIFY', '⚠️  No file changes detected. Agent may not have written files.');
    // Still try to finalize to test the flow
  }

  const lsResult = execSync('find . -name "*.ts" -not -path "*/node_modules/*" | head -20', {
    cwd: workspace.path,
    encoding: 'utf-8',
  });
  log('VERIFY', `TypeScript files:\n${lsResult || '(none)'}`);

  // ── Phase 5: Finalize — commit, push, create PR ──────────────────────────

  log('FINALIZE', 'Committing, pushing, and creating PR...');

  try {
    // Stage all changes first
    execSync('git add -A', { cwd: workspace.path });

    const prResult = await wsService.finalize(workspaceId, {
      push: true,
      createPr: true,
      pr: {
        title: `[E2E Test] ${AGENT_TYPE} agent — greet function`,
        body: `Automated e2e test of the coding swarm pipeline.\n\nAgent: ${AGENT_TYPE}\nExecution: ${executionId}\nTimestamp: ${new Date().toISOString()}`,
        targetBranch: 'main',
      },
      cleanup: false,
    });

    if (prResult) {
      log('FINALIZE', `✅ PR created: ${prResult.url}`);
      log('FINALIZE', `   PR #${prResult.number}`);
    } else {
      log('FINALIZE', 'Finalize completed but no PR info returned.');
    }
  } catch (err: any) {
    log('FINALIZE', `❌ Finalize failed: ${err.message}`);
    // Try manual commit + push as fallback
    log('FINALIZE', 'Attempting manual commit + push...');
    try {
      execSync('git add -A && git commit -m "e2e test: add greet function" --allow-empty', {
        cwd: workspace.path,
        encoding: 'utf-8',
      });
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
          title: `[E2E Test] ${AGENT_TYPE} agent — greet function`,
          body: `Automated e2e test.\nAgent: ${AGENT_TYPE}\nExecution: ${executionId}`,
          head: workspace.branch.name,
          base: 'main',
        },
      );
      log('FINALIZE', `✅ PR created manually: ${pr.url || pr.html_url}`);
    } catch (fallbackErr: any) {
      log('FINALIZE', `Manual fallback also failed: ${fallbackErr.message}`);
    }
  }

  // ── Phase 6: Cleanup ─────────────────────────────────────────────────────

  log('CLEANUP', 'Cleaning up workspace...');
  try {
    await wsService.cleanup(workspaceId);
    log('CLEANUP', 'Workspace cleaned up.');
  } catch {
    log('CLEANUP', `Workspace at ${workspace.path} — clean up manually if needed.`);
  }

  log('DONE', '🎉 E2E test complete!');
}

main().catch((err) => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});
