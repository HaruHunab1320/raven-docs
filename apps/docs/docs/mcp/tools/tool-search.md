---
title: Tool Search
sidebar_position: 1
---

# Tool Search

The tool search feature allows agents to discover relevant tools without loading the entire 100+ tool catalog.

## Why Tool Search?

Instead of dumping all tools into the context window:

- **Reduce token usage** - Only load tools you need
- **Improve accuracy** - Agent focuses on relevant tools
- **Better performance** - Faster response times

## Endpoints

### Search Tools

<span className="api-method api-method--post">POST</span> `/mcp-standard/search_tools`

Search for tools by query, category, or tags.

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `query` | string | Text search (name, description, tags) |
| `category` | string | Filter by category |
| `tags` | string[] | Filter by tags (any match) |
| `limit` | number | Max results (default: 20) |

#### Example Request

```bash
curl -X POST "http://localhost:3000/api/mcp-standard/search_tools" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "create page",
    "limit": 5
  }'
```

#### Example Response

```json
{
  "tools": [
    {
      "tool": {
        "name": "page_create",
        "description": "Create a new page",
        "inputSchema": { ... },
        "category": "page",
        "tags": ["create", "write", "new", "document"]
      },
      "score": 85,
      "matchedOn": ["name", "description", "tags (create)"]
    },
    {
      "tool": {
        "name": "project_create_page",
        "description": "Create a page linked to a project",
        "inputSchema": { ... },
        "category": "project",
        "tags": ["create", "page", "document", "link"]
      },
      "score": 45,
      "matchedOn": ["tags (create, page)"]
    }
  ],
  "totalMatches": 3,
  "categories": [...]
}
```

### List Categories

<span className="api-method api-method--post">POST</span> `/mcp-standard/list_categories`

Get all tool categories with counts.

#### Example Response

```json
{
  "categories": [
    {
      "id": "space",
      "name": "Space Management",
      "description": "Create, update, delete spaces and manage members",
      "toolCount": 10
    },
    {
      "id": "page",
      "name": "Page Management",
      "description": "Create, read, update, delete pages and history",
      "toolCount": 14
    },
    {
      "id": "task",
      "name": "Task Management",
      "description": "Create, update, assign, and track tasks",
      "toolCount": 11
    }
  ]
}
```

### Get Tools by Category

<span className="api-method api-method--post">POST</span> `/mcp-standard/get_tools_by_category`

Get all tools in a specific category.

#### Example Request

```json
{
  "category": "task"
}
```

## Categories

| Category | Description | Tools |
|----------|-------------|-------|
| `space` | Space CRUD and permissions | 10 |
| `page` | Page CRUD, history, search | 14 |
| `project` | Project management | 7 |
| `task` | Task management | 11 |
| `user` | User management | 3 |
| `comment` | Comments | 6 |
| `group` | Group management | 7 |
| `workspace` | Workspace and invites | 17 |
| `attachment` | File attachments | 5 |
| `search` | Full-text search | 2 |
| `import_export` | Import and export | 4 |
| `approval` | Approval workflows | 2 |
| `ai` | AI generation | 1 |
| `memory` | Agent memory | 4 |
| `research` | Research jobs | 3 |
| `navigation` | UI navigation | 1 |
| `system` | API discovery | 4 |
| `context` | Session context | 5 |

## Scoring Algorithm

Tool search uses relevance scoring:

| Match Type | Score |
|------------|-------|
| Exact name match | +100 |
| Name contains query | +50 |
| Partial name match | +20 per word |
| Description match | +30 (full) / +10 (partial) |
| Tag match | +15 per tag |
| Category match | +10 |

Results are sorted by score descending.

## Best Practices

### For Agent Developers

1. **Start with search** - Don't load all tools upfront
2. **Use categories** - If you know the domain, filter by category
3. **Combine filters** - Use query + category for precision

### Example Agent Flow

```typescript
async function findRelevantTools(userQuery: string) {
  // First, understand the domain
  const categories = await mcp.listCategories();

  // Search for relevant tools
  const { tools } = await mcp.searchTools({
    query: userQuery,
    limit: 10,
  });

  // Return only the tools the agent needs
  return tools.map(t => t.tool);
}
```

### Using the tool_search Tool

The `tool_search` tool is available directly:

```json
{
  "name": "tool_search",
  "arguments": {
    "query": "assign task",
    "category": "task"
  }
}
```

## Related

- [MCP Overview](/mcp/overview) - Introduction
- [Examples](/mcp/examples) - Code examples
