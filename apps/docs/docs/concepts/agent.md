---
title: AI Agent
sidebar_position: 8
---

# AI Agent

Raven Docs includes a powerful AI agent that can assist with planning, task management, research, and documentation. The agent learns from your workspace and provides contextual assistance.

## Overview

The agent operates as an intelligent assistant with access to your workspace:

```
User ←→ Agent Chat ←→ Agent Core
                         ├── Memory System
                         ├── Planning Engine
                         ├── Task Manager
                         └── Research Tools
```

## Agent Chat

### Starting a Conversation

Access the agent chat:

- Click the chat icon in the header
- Use `Cmd/Ctrl + Shift + A`
- Type in the chat panel

### Capabilities

The agent can:

- **Answer questions** about your documentation
- **Create and manage** tasks
- **Generate content** drafts
- **Research topics** from docs and web
- **Plan your day** or week
- **Summarize** long documents

### Example Conversations

```
You: What tasks are due this week?
Agent: You have 5 tasks due this week:
       1. Review API docs (Tomorrow)
       2. Update deployment guide (Wednesday)
       ...

You: Create a task to update the README
Agent: Created task "Update README" in your inbox.
       Would you like to add a due date or link it to a goal?

You: Research best practices for API versioning
Agent: I'll research API versioning. This may take a few minutes.
       [Generates research report]
```

## Agent Planning

### Planning Horizons

The agent can create plans across multiple horizons:

| Horizon | Timeframe | Focus |
|---------|-----------|-------|
| **Daily** | Today | Immediate priorities |
| **Short** | This week | Weekly objectives |
| **Mid** | This month/quarter | Project milestones |
| **Long** | This year+ | Strategic goals |

### Generating Plans

Ask the agent to plan:

```
You: Plan my day
Agent: Based on your tasks and goals, here's a suggested plan:

       Morning:
       - [ ] Review PR #123 (30 min)
       - [ ] Team standup (15 min)

       Afternoon:
       - [ ] Complete API documentation (2 hrs)
       - [ ] Respond to feedback (30 min)

       Would you like me to create these as scheduled tasks?
```

### Plan Cascading

Plans cascade from long-term to daily:

```
Long-term: Launch product
    ↓
Mid-term: Complete beta features
    ↓
Short-term: Finish authentication
    ↓
Daily: Implement OAuth flow
```

## Agent Memory

The agent maintains memory of your workspace:

### What's Remembered

- **Conversations** - Past discussions and decisions
- **Preferences** - Your working patterns
- **Context** - Project details and documentation
- **Activity** - Pages viewed, tasks completed

### Memory Features

- **Contextual recall** - Agent remembers relevant past discussions
- **Learning** - Improves suggestions over time
- **Graph connections** - Links between entities and concepts

See [Memory System](/guides/memory) for detailed configuration.

## Autonomous Mode

### Scheduled Runs

Configure the agent to run autonomously:

| Schedule | When | Purpose |
|----------|------|---------|
| **Daily** | Each morning | Plan the day, surface priorities |
| **Weekly** | Monday morning | Weekly review, plan the week |
| **Monthly** | First of month | Monthly reflection, goal review |

### Autonomous Actions

When running autonomously, the agent can:

- Generate daily plans
- Surface overdue tasks
- Create weekly review pages
- Suggest goal updates

### Approvals

Some actions require approval:

```
Agent: I'd like to create 3 tasks based on your weekly goals.
       [View proposed tasks]

       [Approve] [Modify] [Reject]
```

## Agent Settings

### Configuration Options

| Setting | Description | Default |
|---------|-------------|---------|
| **Autonomy Level** | How independently agent acts | Assisted |
| **Schedule** | When agent runs autonomously | Daily |
| **Timezone** | For scheduling | System |
| **Approval Required** | Actions needing approval | Create, Delete |

### Per-Space Settings

Override settings for specific spaces:

```typescript
Space Settings {
  agentEnabled: true
  autonomyLevel: "full"
  scheduleOverride: "weekly"
}
```

## Agent Suggestions

### Proactive Suggestions

The agent proactively suggests:

- **Task priorities** - "Consider focusing on X today"
- **Missing links** - "This task might relate to goal Y"
- **Content updates** - "This doc hasn't been updated in 30 days"
- **Review reminders** - "Time for your weekly review"

### Reflection Questions

During planning, the agent asks:

- "What's the most important thing to accomplish today?"
- "Are there any blockers I should know about?"
- "How did yesterday's plan work out?"

## Security & Privacy

### Data Access

The agent only accesses:

- Content you have permission to view
- Your own tasks and activity
- Shared workspace knowledge

### Privacy Controls

- Disable agent for specific spaces
- Clear agent memory
- Audit agent actions
- Control data retention

## Best Practices

1. **Be specific** - Clear questions get better answers
2. **Provide context** - Mention relevant projects or goals
3. **Review suggestions** - Agent learns from your feedback
4. **Use approvals** - Keep human oversight for important actions

## Related

- [Memory System](/guides/memory) - Detailed memory configuration
- [Research](/guides/research) - Agent research capabilities
- [GTD System](/concepts/gtd) - Productivity integration
- [MCP Tools](/mcp/tools/agent) - Agent API tools
