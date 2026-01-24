---
title: Memory System
sidebar_position: 7
---

# Memory System

The memory system allows the AI agent to remember context, learn from interactions, and provide personalized assistance over time.

## Overview

Memory in Raven Docs works like a knowledge graph:

```
Memory Entry
├── Content (what was remembered)
├── Source (where it came from)
├── Tags (categorization)
├── Entities (linked items)
└── Timestamp (when captured)
```

## Memory Types

### Conversation Memory

Captured from agent chat interactions:

- Questions asked
- Decisions made
- Preferences expressed
- Feedback given

### Activity Memory

Automatically tracked from your usage:

- Pages viewed and edited
- Tasks completed
- Search queries
- Time spent on content

### Ingested Memory

Explicitly stored context:

- Meeting notes
- Project context
- External information
- Manual notes

## How Memory Works

### Ingestion

Memory is captured through multiple channels:

```typescript
// Automatic - from activity
User views page → Memory stored:
  "User viewed 'API Documentation' for 15 minutes"

// Automatic - from chat
User asks question → Memory stored:
  "User asked about OAuth implementation"

// Manual - explicit storage
await agent.memory.ingest({
  content: "Prefers TypeScript over JavaScript",
  source: "user_preference",
  tags: ["coding", "preferences"],
});
```

### Retrieval

The agent queries memory for relevant context:

```typescript
// When you ask about OAuth
Agent retrieves:
  - Previous OAuth discussions
  - Related documentation views
  - Connected tasks
  - Team decisions on auth
```

### Memory Graph

Memories form a connected graph:

```
[OAuth Discussion] ←→ [Auth Module Task]
        ↓                    ↓
[API Security Doc] ←→ [User Preferences]
```

## Configuration

### Memory Settings

Configure memory behavior in workspace settings:

| Setting | Description | Default |
|---------|-------------|---------|
| **Retention Period** | How long memories are kept | 90 days |
| **Auto-capture** | Track activity automatically | Enabled |
| **Memory Limit** | Max memories per workspace | 10,000 |
| **Entity Linking** | Auto-link to tasks/pages | Enabled |

### Per-Space Settings

Override settings for specific spaces:

```typescript
Space Memory Config {
  enabled: true
  retention: "365d"
  autoCapture: true
  sensitiveMode: false // extra privacy
}
```

## Memory Features

### Daily Summaries

Get a digest of memories from any day:

```
You: What did I work on yesterday?

Agent: Yesterday's summary:
- Edited 3 pages in API documentation
- Completed task "Update auth endpoints"
- Had discussion about rate limiting
- Viewed deployment guide twice
```

### Memory Search

Search through stored memories:

```
You: What did we decide about caching?

Agent: On January 10th, you noted:
"Use Redis for session caching, 15-minute TTL"
This was linked to the Architecture space.
```

### User Profile & Behavioral Insights

The agent builds a comprehensive behavioral profile from your activity:

- **Seven Core Traits** - Focus, Execution, Creativity, Communication, Leadership, Learning, Resilience
- **Trait Scores** - Each trait scored 0-10 based on activity patterns
- **Behavioral Patterns** - Completion rate, consistency, diversity, collaboration
- **Trend Analysis** - Track improvement or decline over time
- **AI-generated Insights** - Personalized strengths, challenges, and recommendations

The profile system goes beyond simple activity tracking to provide meaningful behavioral insights that help you understand your work patterns and areas for growth.

[Learn more about User Profiles](/guides/user-profiles)

### Entity Relationships

See how memories connect:

```
Task: "Implement caching"
├── Related memories: 5
│   ├── "Decided on Redis" (Jan 10)
│   ├── "Research on cache strategies" (Jan 8)
│   └── "Discussion with team" (Jan 5)
├── Related pages: 2
│   ├── Architecture Overview
│   └── Performance Guide
└── Related goals: 1
    └── "Improve API performance"
```

## Memory Graph Visualization

### Viewing the Graph

Access the memory graph:

1. Open Agent Settings
2. Click **Memory Graph**
3. Explore connections

### Graph Elements

- **Nodes** - Individual memories
- **Edges** - Relationships between memories
- **Clusters** - Related memory groups
- **Highlights** - Recently accessed memories

### Filtering

Filter the graph by:

- Date range
- Tags
- Source type
- Entity connections

## Privacy & Control

### Viewing Memories

See what's stored:

1. Open Agent Settings
2. Click **Memory**
3. Browse or search memories

### Deleting Memories

Remove specific memories:

```typescript
// Delete a single memory
await agent.memory.delete(memoryId);

// Delete by criteria
await agent.memory.deleteMany({
  olderThan: "30d",
  tags: ["temporary"],
});

// Clear all memories
await agent.memory.clear();
```

### Sensitive Content

Mark spaces as sensitive to limit memory:

- Reduced auto-capture
- Shorter retention
- No cross-space linking

## API Access

### Ingesting Memory

```typescript
await client.agent.memory.ingest({
  workspaceId: 'ws_123',
  content: 'Important project decision',
  source: 'meeting_notes',
  tags: ['project-x', 'decisions'],
  entityLinks: [
    { type: 'task', id: 'task_456' },
    { type: 'page', id: 'page_789' },
  ],
});
```

### Querying Memory

```typescript
const memories = await client.agent.memory.query({
  workspaceId: 'ws_123',
  query: 'caching decisions',
  tags: ['architecture'],
  dateRange: {
    start: '2024-01-01',
    end: '2024-01-31',
  },
  limit: 10,
});
```

### Daily Summary

```typescript
const summary = await client.agent.memory.dailySummary({
  workspaceId: 'ws_123',
  date: '2024-01-15',
});
```

## Best Practices

1. **Tag consistently** - Use standard tags for easy retrieval
2. **Review periodically** - Check stored memories for accuracy
3. **Clean up** - Delete outdated or incorrect memories
4. **Use sources** - Label memory sources for context
5. **Link entities** - Connect memories to tasks and pages

## Troubleshooting

### Memory Not Found

If the agent can't recall something:

- Check if auto-capture was enabled
- Verify the memory wasn't deleted
- Try different search terms
- Check retention period

### Too Much Memory

If responses are slow:

- Reduce retention period
- Delete old memories
- Disable auto-capture for some spaces
- Archive completed projects

## Related

- [User Profiles](/guides/user-profiles) - Behavioral insights system
- [AI Agent](/concepts/agent) - Agent overview
- [MCP Memory Tools](/mcp/tools/memory) - API access
- [Privacy](/guides/permissions) - Access control
