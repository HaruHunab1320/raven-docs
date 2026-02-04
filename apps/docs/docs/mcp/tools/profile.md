---
title: Profile
sidebar_position: 9
---

# Profile Tools

Tools for understanding user behavior patterns and work preferences.

:::info Personal Profile
User profiles are **personal to each user**. All profile operations are automatically scoped to the authenticated user—agents can only analyze their own behavioral patterns or the patterns of the user they're assisting. This enables personalized productivity insights while maintaining privacy.
:::

## Available Tools

### profile_get

Get the current user's profile summary including behavioral traits and preferences.

```json
{
  "name": "profile_get",
  "arguments": {
    "workspace_id": "ws_123",
    "space_id": "space_456"
  }
}
```

**Response:**

```json
{
  "profile": {
    "userId": "user_789",
    "traits": [
      {
        "trait": "detail_oriented",
        "confidence": 0.85,
        "evidence": "Consistently creates comprehensive documentation"
      },
      {
        "trait": "async_communicator",
        "confidence": 0.72,
        "evidence": "Prefers written updates over meetings"
      }
    ],
    "workPatterns": {
      "peakHours": ["09:00", "10:00", "14:00", "15:00"],
      "preferredTaskSize": "medium",
      "averageSessionLength": 45
    },
    "lastUpdated": "2024-01-15T10:30:00Z"
  }
}
```

### profile_distill

Analyze recent activity to distill behavioral insights and update the user's profile.

```json
{
  "name": "profile_distill",
  "arguments": {
    "workspace_id": "ws_123",
    "space_id": "space_456",
    "lookback_days": 30
  }
}
```

**Response:**

```json
{
  "distillation": {
    "newTraits": [
      {
        "trait": "morning_person",
        "confidence": 0.78,
        "evidence": "80% of task completions occur before noon"
      }
    ],
    "updatedTraits": [
      {
        "trait": "detail_oriented",
        "previousConfidence": 0.75,
        "newConfidence": 0.85,
        "evidence": "Recent documentation shows increased thoroughness"
      }
    ],
    "recommendations": [
      "Schedule complex tasks during morning peak hours",
      "Break large tasks into medium-sized chunks"
    ],
    "activitySummary": {
      "tasksCompleted": 47,
      "pagesCreated": 12,
      "memoriesAdded": 23
    }
  }
}
```

## Profile Traits

Common behavioral traits the system can identify:

| Trait | Description |
|-------|-------------|
| `detail_oriented` | Creates thorough documentation and descriptions |
| `async_communicator` | Prefers written communication over synchronous |
| `morning_person` | Most productive in morning hours |
| `deep_worker` | Prefers long focused sessions |
| `context_switcher` | Handles multiple projects simultaneously |
| `planner` | Creates plans before executing |
| `executor` | Prefers action over planning |

## Example: Personalized Assistance

```typescript
// Get user's current profile
const profile = await mcp.call("profile_get", {
  workspace_id: "ws_123",
  space_id: "space_456"
});

// Check if user prefers morning work
const isMorningPerson = profile.profile.traits
  .find(t => t.trait === "morning_person" && t.confidence > 0.7);

if (isMorningPerson) {
  // Suggest scheduling important tasks for morning
  console.log("Scheduling deep work for morning hours");
}

// Periodically update profile based on recent activity
const distillation = await mcp.call("profile_distill", {
  workspace_id: "ws_123",
  space_id: "space_456",
  lookback_days: 14
});

// Apply recommendations
distillation.distillation.recommendations.forEach(rec => {
  console.log(`Suggestion: ${rec}`);
});
```

## Related

- [User Profiles Guide](/guides/user-profiles) - Understanding profiles
- [Memory Tools](/mcp/tools/memory) - Memory management
- [Insights Tools](/mcp/tools/insights) - Activity insights
