# Agentic Roadmap + Project Playbook

This document captures the next-stage vision for Raven Docs agent behavior,
project planning, and memory intelligence. It expands on current autonomy and
proposes a state-of-the-art workflow that blends Agile/Scrum, GTD, and
decision-support best practices.

## Why This Matters

Raven Docs already stores rich context (pages, tasks, projects, goals, journal).
The missing layer is an agentic system that:

- Turns raw activity into durable user understanding.
- Converts project descriptions into structured delivery plans.
- Executes safely via approvals and policy gates.
- Adapts plans based on user traits, constraints, and signals.

This roadmap defines that layer.

## Current State (Baseline)

- Agent chat: responds with guidance, logs memories.
- Planner loop: daily plan + proactive questions, stored as memories.
- Autonomous loop: can apply a small set of MCP actions with policy gating.
- Research jobs: generate reports and logs as pages.

See: `docs/AgentMemoryArchitecture.md`, `docs/Workflows.md`,
`docs/AutonomyQuickstart.md`.

## Target System Overview

We will evolve into a multi-loop, policy-driven system with explicit artifacts:

1) **Memory Intelligence Loop**
   - Distills observations into a stable user model.
   - Surfaces long-term interests, constraints, and risk signals.

2) **Project Playbook Loop**
   - Converts a project brief into a structured delivery plan.
   - Outputs phases, milestones, tasks, risks, and definitions of done.

3) **Planning + Execution Loop**
   - Generates daily/weekly plans using the user model and project plan.
   - Applies actions via MCP only when policy allows or approvals exist.

4) **Review + Learning Loop**
   - Weekly/monthly retrospectives.
   - Updates the playbook, estimates, and user model.

## Memory Intelligence (Deep Use of Vector DB)

### Memory Inputs

We should ingest and embed:
- Pages (including research reports and decisions).
- Tasks and task status changes.
- Journal entries and reflections.
- Agent chat, approvals, and auto-summaries.
- User interactions (high-level signals only).

### Distillation Jobs

Scheduled jobs (daily/weekly) produce durable insights:
- **User profile**: strengths, constraints, preferences, focus areas.
- **Goals**: short/medium/long, with confidence levels.
- **Risks**: blockers, anxiety signals, overload indicators.
- **Interest map**: recurring themes or topics.

These distilled outputs should live as:
- A visible, editable "User Profile" page.
- Structured memory entries for agent queries.

### Retrieval Strategy

Multi-layer retrieval (not just one vector search):
- **Short-term context**: last 7-14 days of memories.
- **Long-term model**: distilled profile + goals.
- **Topic-specific**: query per project/goal tag.
- **Constraint/risk**: negative sentiment, blockers, or burnout signals.

### Decision Rules (Examples)

- If user model signals low confidence in interviews, prioritize practice.
- If workload is high, reduce scope and add recovery blocks.
- If an interest trend is rising, propose a project or goal.

## Project Playbook (First-Class Agile/Scrum + Delivery)

### Core Principles to Encode

- **Agile**: iterative delivery, feedback loops, adaptive planning.
- **Scrum**: backlog, sprints, definition of done/ready.
- **Lean**: eliminate waste, validate assumptions early.
- **GTD**: capture -> clarify -> organize -> reflect -> engage.

### Playbook Artifacts (Outputs)

When a project is created with a solid brief, the system should generate:

1) **Project Brief**
   - Problem statement, success criteria, constraints.

2) **User Stories + Use Cases**
   - Personas, user journeys, acceptance criteria.

3) **Technical Architecture**
   - System diagram, data model, integration map.
   - Non-functional requirements (security, scale, reliability).

4) **Risk + Assumptions**
   - Unknowns, dependencies, mitigation steps.

5) **Delivery Plan**
   - Phases, milestones, estimates, and timeline.

6) **Backlog + Sprint Plan**
   - Epics -> stories -> tasks.
   - Definition of ready and done.

7) **Review Cadence**
   - Weekly review checklist, retrospectives, quality gates.

### Playbook Phases (Template)

1) **Discovery**
   - Validate problem, stakeholders, success metrics.
2) **Architecture**
   - System design, data model, API contracts.
3) **Planning**
   - Scope, estimates, milestones, risks.
4) **Execution**
   - Sprints, backlog grooming, task tracking.
5) **Review**
   - Retrospectives, performance against goals.

### Definition of Done (Example)

- Feature meets acceptance criteria.
- Tests added and passing.
- Docs updated.
- Approved by reviewer (or policy).

### Definition of Ready (Example)

- Clear requirements and acceptance criteria.
- Dependencies identified.
- Estimate provided.

## Agent Decision Model (How It Will Work)

### Inputs
- Project brief and artifacts.
- Memory intelligence outputs.
- Current tasks and goals.
- Policy settings and approvals.

### Outputs
- Structured plan with rationale.
- Proposed tasks or pages.
- Questions to resolve ambiguity.

### Guardrails
- Policy gating (auto/approval/deny).
- Approvals for destructive or sensitive changes.
- Full audit trail logged to memory.

## Proposed Data Model Extensions

We can either add new first-class entities or map them to pages:
- Epic
- Milestone
- Phase
- Sprint
- Risk
- Decision

Short term, map these to pages + tags + relations. Long term, add entities for
better analytics and automation.

## Required MCP + API Expansions

To enable the playbook and memory intelligence, add tools for:

- `project.create` enhancements (brief, goals, constraints)
- `goal.create` and `goal.link`
- `page.create` with templates
- `task.create` with phase/milestone metadata
- `risk.create` / `decision.create` (initially as pages)
- `memory.distill` (job to update user profile)

## Journal as a First-Class Artifact

Add a dedicated Journal page with:
- Fast entry capture (frictionless).
- Daily/weekly reflection templates.
- Auto-distilled insights into the user profile.

## Execution Roadmap (Suggested Phasing)

### Phase 1: Foundations
- Journal page + capture UI.
- Memory distiller job -> User Profile page.
- Multi-layer memory retrieval API.

### Phase 2: Project Playbook MVP
- Project brief template + architecture template.
- Playbook generator (create pages + tasks).
- Policy gating for auto-created artifacts.

### Phase 3: Adaptive Planning
- Planner uses user profile + constraints.
- Project plan feeds daily/weekly plans.
- Confidence and workload adjustments.

### Phase 4: Advanced Autonomy
- Sprint planning automation.
- Risk monitoring + alerts.
- Repo actions behind approvals.

## Status + Task List

### Completed
- Journal daily pages + capture UI.
- Profile distillation job -> User Profile page.
- Insights trait radar (user + people admin view).
- MCP Standard research tools + report appends to host page.
- Inline research block (slash command + page-attached research runs).
- Research outputs organized under a space-level Research page + enriched tags.
- Project Playbook MVP (brief/architecture/delivery/backlog/risk pages + phase tasks).

### In Progress
- Memory profile distillation coverage across users/spaces.
 

### Next Up
- Multi-layer memory retrieval (short-term + long-term + topic-specific).
- Research MCP Standard tooling + deep research UI surface.
- Inline research block that writes back to the current page.
- Agent-initiated research projects with structured storage.
- Project Playbook MVP (brief -> architecture -> backlog -> phases).

## Success Metrics

- Users can create a project and receive a full delivery plan in minutes.
- Plans reflect the user's real constraints and preferences.
- Weekly reviews show measurable progress and improved focus.
- Agent suggestions are trusted because they are auditable and adjustable.

## Open Questions

- Which artifacts should be first-class entities vs pages?
- How much automation is acceptable by default?
- What is the best default sprint length?
- How should we visualize the user model and allow edits?
