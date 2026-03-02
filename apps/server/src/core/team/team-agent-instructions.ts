/**
 * Capability-aware instruction builder for team agents.
 *
 * Generates role-specific workflow guidance based on the agent's capabilities
 * so that CLI-based agents know how and when to use Raven MCP tools.
 *
 * Each capability block includes realistic worked examples so agents
 * understand not just the parameter shapes but what good usage looks like.
 */

export interface AgentInstructionContext {
  role: string;
  targetExperimentId?: string;
  targetTaskId?: string;
  workspaceId: string;
  spaceId?: string;
  /** Team info for messaging instructions. If set, messaging block is included. */
  teamInfo?: {
    isCoordinator: boolean;
    teamMembers: Array<{ role: string; agentId: string }>;
    coordinatorRole?: string;
  };
}

/**
 * Check whether the agent has a given capability.
 * Matches exact, wildcard (`*`), resource wildcard (`experiment.*`),
 * or bare resource name (`experiment` matches `experiment.register`).
 */
export function hasCap(capabilities: string[], cap: string): boolean {
  for (const c of capabilities) {
    if (c === '*') return true;
    if (c === cap) return true;
    // resource wildcard: "experiment.*" matches "experiment.register"
    if (c.endsWith('.*') && cap.startsWith(c.slice(0, -1))) return true;
    // bare resource: "experiment" matches "experiment.register"
    if (!c.includes('.') && !c.includes('*') && cap.startsWith(c + '.')) {
      return true;
    }
  }
  return false;
}

export function buildCapabilityInstructions(
  capabilities: string[],
  ctx: AgentInstructionContext,
): string {
  const blocks: string[] = [];
  const wid = ctx.workspaceId;
  const sid = ctx.spaceId || '<spaceId>';

  // --- Target experiment workflow ---
  if (ctx.targetExperimentId) {
    const eid = ctx.targetExperimentId;
    blocks.push(`## Target Experiment Workflow

You have been assigned experiment **${eid}**.

**Step 1 — Read the experiment:**
\`\`\`
experiment_get({ "pageId": "${eid}" })
\`\`\`

**Step 2 — Do the work** described in the experiment (research, analysis, coding, etc.).

**Step 3 — Save findings as you go.** Don't wait until the end — create pages for intermediate results:
\`\`\`
page_create({
  "workspaceId": "${wid}",
  "spaceId": "${sid}",
  "title": "Analysis: API Rate Limiting Patterns",
  "content": "## Summary\\n\\nTested 3 rate limiting approaches against the staging endpoint...\\n\\n### Findings\\n\\n1. **Token bucket** — handled burst traffic well, p99 latency stayed under 50ms\\n2. **Fixed window** — simple but caused thundering herd at window boundaries\\n3. **Sliding window** — best overall but 2x memory overhead\\n\\n### Recommendation\\n\\nToken bucket with 100 req/s base rate and 200 req burst capacity."
})
\`\`\`

**Step 4 — Complete the experiment** with a summary of results:
\`\`\`
experiment_complete({
  "pageId": "${eid}",
  "results": "Tested 3 rate limiting strategies. Token bucket performed best: p99 <50ms under burst, low memory. Recommend 100 req/s base with 200 burst. Full analysis saved to page.",
  "passed": true
})
\`\`\`
Set \`"passed": false\` if the experiment disproved the hypothesis, with an explanation in results.`);
  }

  // --- Target task workflow ---
  if (ctx.targetTaskId && !ctx.targetExperimentId) {
    const tid = ctx.targetTaskId;
    blocks.push(`## Target Task Workflow

You have been assigned task **${tid}**.

**Step 1 — Read the task:**
\`\`\`
task_get({ "taskId": "${tid}" })
\`\`\`

**Step 2 — Claim it** so the team knows you're working on it:
\`\`\`
task_update({ "taskId": "${tid}", "status": "in_progress" })
\`\`\`

**Step 3 — Do the work** described in the task.

**Step 4 — Mark done** when finished:
\`\`\`
task_update({ "taskId": "${tid}", "status": "done" })
\`\`\``);
  }

  // --- Coordinator responsibilities ---
  if (hasCap(capabilities, 'coordinate')) {
    blocks.push(`## Coordinator Responsibilities

As coordinator, your job is to **plan, delegate, monitor, and synthesize**.

**Break work into subtasks** for team members:
\`\`\`
task_create({
  "workspaceId": "${wid}",
  "spaceId": "${sid}",
  "title": "Analyze competitor pricing models",
  "description": "Research the top 5 competitors' pricing pages. Document tier structures, feature gating, and price points. Save findings as a Raven page."
})
\`\`\`

**Monitor progress** — check on tasks and experiments:
\`\`\`
task_list({ "workspaceId": "${wid}", "spaceId": "${sid}" })
task_get({ "taskId": "<task ID from list>" })
experiment_get({ "pageId": "<experiment ID>" })
\`\`\`

**Synthesize results** — combine findings from team members into a coherent summary:
\`\`\`
page_create({
  "workspaceId": "${wid}",
  "spaceId": "${sid}",
  "title": "Research Summary: Competitive Landscape Q4",
  "content": "## Executive Summary\\n\\nThe team analyzed 5 competitors across pricing, features, and market positioning.\\n\\n### Key Findings\\n\\n1. **Pricing:** Average entry tier is $29/mo, enterprise starts at $199/mo\\n2. **Feature gaps:** No competitor offers real-time collaboration + AI together\\n3. **Opportunity:** Mid-market segment ($49-99/mo) is underserved\\n\\n### Recommendations\\n\\n- Launch a $49/mo tier targeting teams of 5-20\\n- Emphasize AI + collaboration as differentiator\\n\\n### Source Experiments\\n\\n- Pricing analysis: exp-abc123\\n- Feature comparison: exp-def456"
})
\`\`\`

Use \`search_tools\` if you need tools beyond what's shown above.`);
  }

  // --- Team messaging ---
  if (ctx.teamInfo) {
    if (ctx.teamInfo.isCoordinator) {
      const memberList = ctx.teamInfo.teamMembers
        .map((m) => `- **${m.role}** — Reports to you`)
        .join('\n');
      blocks.push(`## Team Communication

You lead a team of agents. Use messaging to assign work and collect results.

**Your team:**
${memberList || '(No workers assigned yet)'}

**Assign work:**
\`\`\`
team_send_message({ "to": "${ctx.teamInfo.teamMembers[0]?.role || 'worker'}", "message": "Research the top 5 competitors and save findings to a Raven page." })
\`\`\`

**Check for replies:**
\`\`\`
team_read_messages({ "unreadOnly": true })
\`\`\`

**View team status:**
\`\`\`
team_list_team({})
\`\`\`

After assigning tasks, continue doing your own work. Periodically check \`team_read_messages()\` to see if workers have reported back. Once all workers have replied, synthesize results and complete the experiment/task.`);
    } else {
      const coordRole = ctx.teamInfo.coordinatorRole || 'coordinator';
      blocks.push(`## Team Communication

You report to the **${coordRole}** agent. You will receive task assignments as messages.

**Report results back:**
\`\`\`
team_send_message({ "to": "${coordRole}", "message": "Completed research. Findings saved to page <pageId>." })
\`\`\`

**Check for new assignments:**
\`\`\`
team_read_messages({ "unreadOnly": true })
\`\`\`

After completing assigned work, send your results back to your coordinator and check for additional messages before finishing.`);
    }
  }

  // --- Experiment registration ---
  if (hasCap(capabilities, 'experiment.register')) {
    blocks.push(`## Registering New Experiments

When your research identifies something that should be tested separately, register it as an experiment:
\`\`\`
experiment_register({
  "workspaceId": "${wid}",
  "spaceId": "${sid}",
  "title": "Test whether caching reduces API latency by >30%",
  "description": "Add Redis caching to the /api/search endpoint. Measure p50/p95/p99 latency before and after with 1000 concurrent users. Success criteria: >30% reduction in p95 latency.",
  "hypothesisId": "<linked hypothesis ID if any>"
})
\`\`\`

Write clear success criteria in the description so whoever runs the experiment knows what "done" looks like. Link to a hypothesis when the experiment tests a specific claim.`);
  }

  // --- Hypothesis create/update ---
  if (
    hasCap(capabilities, 'hypothesis.create') ||
    hasCap(capabilities, 'hypothesis.update')
  ) {
    blocks.push(`## Working with Hypotheses

Hypotheses are testable claims. Lifecycle: draft → proposed → testing → validated/invalidated/revised.

**Create a hypothesis:**
\`\`\`
hypothesis_create({
  "workspaceId": "${wid}",
  "spaceId": "${sid}",
  "title": "Redis caching will reduce search latency by >30%",
  "formalStatement": "Adding a Redis cache layer with 5-minute TTL to the /api/search endpoint will reduce p95 latency from ~800ms to <560ms under concurrent load of 1000 users.",
  "predictions": [
    "p95 latency drops below 560ms with cache enabled",
    "Cache hit rate exceeds 70% after 10 minutes of steady traffic",
    "Memory usage increases by less than 500MB"
  ],
  "status": "proposed"
})
\`\`\`
The \`formalStatement\` must be a precise, testable claim — specific enough that someone can design an experiment to prove or disprove it.

**Update as evidence accumulates:**
\`\`\`
hypothesis_update({
  "pageId": "<hypothesis ID>",
  "status": "validated",
  "confidence": 0.85
})
\`\`\`
Status options: \`proposed\`, \`testing\`, \`validated\`, \`refuted\`, \`inconclusive\`, \`superseded\`. Confidence ranges from 0 to 1.`);
  }

  // --- Context/intelligence query ---
  if (
    hasCap(capabilities, 'context.query') ||
    hasCap(capabilities, 'intelligence.query')
  ) {
    blocks.push(`## Querying Research Intelligence

Before starting new work, always check what the team has already documented:
\`\`\`
intelligence_query({
  "workspaceId": "${wid}",
  "query": "What do we know about API rate limiting approaches?"
})
\`\`\`

Search for specific pages, experiments, or hypotheses:
\`\`\`
search_query({
  "workspaceId": "${wid}",
  "query": "rate limiting Redis cache"
})
\`\`\`

This avoids duplicating work another team member has already done.`);
  }

  // --- Task create/update ---
  if (
    hasCap(capabilities, 'task.create') ||
    hasCap(capabilities, 'task.update')
  ) {
    blocks.push(`## Managing Tasks

**Create a task:**
\`\`\`
task_create({
  "workspaceId": "${wid}",
  "spaceId": "${sid}",
  "title": "Benchmark Redis vs Memcached for search caching",
  "description": "Run equivalent load tests against both cache backends. Measure latency, throughput, and memory usage. Document results as a comparison table in a Raven page."
})
\`\`\`

**Update task status:**
\`\`\`
task_update({ "taskId": "<task ID>", "status": "in_progress" })
\`\`\`

**Complete a task:**
\`\`\`
task_complete({ "taskId": "<task ID>" })
\`\`\``);
  }

  // --- Page management (always included — all agents need to store findings) ---
  blocks.push(`## Storing Findings in Raven Docs

Your working directory is temporary scratch — it gets deleted on team reset/teardown. **All findings must be saved to Raven Docs.**

**Create a page** with well-structured markdown:
\`\`\`
page_create({
  "workspaceId": "${wid}",
  "spaceId": "${sid}",
  "title": "Analysis: Database Connection Pooling",
  "content": "## Overview\\n\\nInvestigated connection pooling strategies for PostgreSQL under high concurrency.\\n\\n## Methodology\\n\\nTested 3 pool sizes (10, 25, 50) with 200 concurrent requests over 5 minutes.\\n\\n## Results\\n\\n| Pool Size | Avg Latency | p99 Latency | Errors |\\n|-----------|-------------|-------------|--------|\\n| 10        | 45ms        | 320ms       | 2.1%   |\\n| 25        | 28ms        | 89ms        | 0.1%   |\\n| 50        | 31ms        | 95ms        | 0.0%   |\\n\\n## Conclusion\\n\\nPool size of 25 offers the best latency/resource tradeoff. Going to 50 eliminates errors but doesn't improve latency."
})
\`\`\`

**Update an existing page:**
\`\`\`
page_update({
  "pageId": "<pageId>",
  "content": "<updated markdown with new findings appended>"
})
\`\`\`

**Read a page:**
\`\`\`
page_get({ "pageId": "<pageId>" })
\`\`\`

**List pages in the space:**
\`\`\`
page_list({ "workspaceId": "${wid}", "spaceId": "${sid}" })
\`\`\`

Write clear titles that describe the content. Structure with headings, tables, and bullet points so other team members can quickly scan your findings.`);

  // --- Comments ---
  if (hasCap(capabilities, 'comment.create') || hasCap(capabilities, 'comment')) {
    blocks.push(`## Adding Comments

Leave feedback or observations on existing pages:
\`\`\`
comment_create({
  "pageId": "<pageId>",
  "content": "The p99 numbers here look promising but we should also check memory pressure — high pool sizes can cause OOM under sustained load. Can we add memory metrics to the next test run?"
})
\`\`\`

**List comments on a page:**
\`\`\`
comment_list({ "pageId": "<pageId>" })
\`\`\``);
  }

  // --- Search ---
  if (hasCap(capabilities, 'search') || hasCap(capabilities, 'search.query')) {
    blocks.push(`## Searching Content

Find existing work across the workspace before starting something new:
\`\`\`
search_query({
  "workspaceId": "${wid}",
  "query": "connection pooling PostgreSQL"
})
\`\`\`

This returns matching pages, experiments, tasks, and hypotheses. Check results before creating duplicate content.`);
  }

  // --- Completion block (always included) ---
  const messagingStep = ctx.teamInfo && !ctx.teamInfo.isCoordinator
    ? `\n3. **Notify your coordinator** — call \`team_send_message\` to report completion and results`
    : '';
  blocks.push(`## Completion Checklist

When your work is done:
1. **Save all findings** — write results to Raven Docs using \`page_create\` or \`page_update\`
2. **Update your target** —${ctx.targetExperimentId ? ` call \`experiment_complete\` with pageId "${ctx.targetExperimentId}"` : ctx.targetTaskId ? ` call \`task_update\` with taskId "${ctx.targetTaskId}" and status "done"` : ' update the experiment or task you worked on'}${messagingStep}
${ctx.teamInfo && !ctx.teamInfo.isCoordinator ? '4' : '3'}. **Stop** — once results are saved and your target is marked complete, your work is done

Do NOT continue exploring after completing your target. Save results and finish.`);

  if (blocks.length === 0) return '';

  return '\n\n# Agent Workflow Guide\n\n' + blocks.join('\n\n');
}
