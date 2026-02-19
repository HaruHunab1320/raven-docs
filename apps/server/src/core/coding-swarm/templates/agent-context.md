# Raven Docs — Agent Context

## Your Task
{{taskDescription}}

## Execution Info
- Execution ID: {{executionId}}
- Workspace ID: {{workspaceId}}

## Raven API Access

You have access to Raven's tool API for interacting with the platform.

**Base URL:** {{serverUrl}}/api/mcp-standard
**Auth:** `Authorization: Bearer $MCP_API_KEY` (available as env var)

### Discover Tools (no auth required)
```
POST {{serverUrl}}/api/mcp-standard/search_tools
{"query": "your search term"}

POST {{serverUrl}}/api/mcp-standard/list_categories
```

### Call a Tool (auth required)
```
POST {{serverUrl}}/api/mcp-standard/call_tool
Authorization: Bearer $MCP_API_KEY
Content-Type: application/json

{"name": "tool_name", "arguments": {...}}
```

### Available Tool Categories
{{toolCategories}}

Use `search_tools` to find the specific tool you need.

## Guidelines
- Do NOT commit API keys or injected config files
- Stay on the current git branch
