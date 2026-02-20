---
title: Hypothesis
sidebar_position: 12
---

# Hypothesis Tools

Tools for creating and managing typed hypothesis pages in the research intelligence system.

## Available Tools

### hypothesis_create

Create a hypothesis page with typed metadata.

```json
{
  "name": "hypothesis_create",
  "arguments": {
    "workspaceId": "ws_123",
    "spaceId": "space_456",
    "title": "Caching reduces API latency by 50%",
    "formalStatement": "Adding Redis caching to the /api/search endpoint will reduce p95 latency from 800ms to under 400ms",
    "predictions": [
      "Cache hit rate will exceed 80% after warmup",
      "Memory usage will stay under 512MB"
    ],
    "domainTags": ["performance", "infrastructure"],
    "priority": "high"
  }
}
```

**Arguments:**

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `workspaceId` | string | Yes | Workspace ID |
| `spaceId` | string | Yes | Space ID |
| `title` | string | Yes | Hypothesis title |
| `formalStatement` | string | Yes | Formal statement of the hypothesis |
| `predictions` | string[] | No | Testable predictions |
| `domainTags` | string[] | No | Domain tags for categorization |
| `priority` | string | No | `low`, `medium`, `high`, or `critical` |

**Response:**

```json
{
  "page": {
    "id": "page_hyp_123",
    "title": "Caching reduces API latency by 50%",
    "pageType": "hypothesis",
    "metadata": {
      "status": "proposed",
      "formalStatement": "Adding Redis caching to the /api/search endpoint...",
      "predictions": ["Cache hit rate will exceed 80%..."],
      "domainTags": ["performance", "infrastructure"],
      "priority": "high"
    }
  },
  "graphNode": "created"
}
```

### hypothesis_update

Update a hypothesis status or metadata.

```json
{
  "name": "hypothesis_update",
  "arguments": {
    "workspaceId": "ws_123",
    "pageId": "page_hyp_123",
    "status": "testing",
    "metadata": {
      "priority": "critical"
    }
  }
}
```

**Arguments:**

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `workspaceId` | string | Yes | Workspace ID |
| `pageId` | string | Yes | Hypothesis page ID |
| `status` | string | No | New status (`proposed`, `testing`, `validated`, `refuted`, `inconclusive`) |
| `metadata` | object | No | Metadata fields to update |

### hypothesis_get

Get a hypothesis with its full evidence chain from the research graph.

```json
{
  "name": "hypothesis_get",
  "arguments": {
    "workspaceId": "ws_123",
    "pageId": "page_hyp_123"
  }
}
```

**Response:**

```json
{
  "hypothesis": {
    "id": "page_hyp_123",
    "title": "Caching reduces API latency by 50%",
    "pageType": "hypothesis",
    "metadata": {
      "status": "testing",
      "formalStatement": "Adding Redis caching...",
      "predictions": ["Cache hit rate will exceed 80%..."],
      "domainTags": ["performance", "infrastructure"]
    }
  },
  "evidenceChain": {
    "supporting": [
      {
        "id": "page_exp_456",
        "title": "Redis cache benchmark",
        "type": "VALIDATES",
        "pageType": "experiment"
      }
    ],
    "contradicting": [],
    "related": [
      {
        "id": "page_hyp_789",
        "title": "In-memory caching is sufficient",
        "type": "EXTENDS",
        "pageType": "hypothesis"
      }
    ]
  }
}
```

## Hypothesis Statuses

| Status | Description |
|--------|-------------|
| `proposed` | Initial state — hypothesis has been stated |
| `testing` | Experiments are actively testing this hypothesis |
| `validated` | Evidence supports the hypothesis |
| `refuted` | Evidence contradicts the hypothesis |
| `inconclusive` | Results are mixed or insufficient |
| `superseded` | Replaced by a newer hypothesis |

## Example: Full Hypothesis Lifecycle

```typescript
// 1. Create a hypothesis
const hyp = await mcp.call("hypothesis_create", {
  workspaceId: "ws_123",
  spaceId: "space_456",
  title: "Caching reduces API latency by 50%",
  formalStatement: "Adding Redis caching will reduce p95 latency from 800ms to under 400ms",
  predictions: ["Cache hit rate > 80%", "Memory < 512MB"],
  domainTags: ["performance"],
  priority: "high"
});

// 2. Register an experiment (see Experiment Tools)
const exp = await mcp.call("experiment_register", {
  workspaceId: "ws_123",
  spaceId: "space_456",
  title: "Redis cache benchmark",
  hypothesisId: hyp.page.id,
  method: "Load test with and without Redis caching"
});

// 3. Complete the experiment with results
await mcp.call("experiment_complete", {
  workspaceId: "ws_123",
  pageId: exp.page.id,
  results: { p95Before: 800, p95After: 350, hitRate: 0.87 },
  passedPredictions: true
});

// 4. Check the evidence chain
const evidence = await mcp.call("hypothesis_get", {
  workspaceId: "ws_123",
  pageId: hyp.page.id
});
// evidence.evidenceChain.supporting now includes the experiment
```

## Related

- [Experiment Tools](/mcp/tools/experiment) - Register and complete experiments
- [Relationship Tools](/mcp/tools/relationship) - Manage graph edges
- [Intelligence Tools](/mcp/tools/intelligence) - Query assembled context
- [Research Intelligence Guide](/guides/research-intelligence) - Full system overview
