---
title: MCP Quickstart
sidebar_position: 2
---

# MCP Quickstart

Get connected to the Raven Docs MCP server in 5 minutes.

## Prerequisites

- A Raven Docs account with API access
- An MCP-compatible AI client (Claude, custom agent, etc.)

## Step 1: Get an API Key

1. Go to **Settings** → **API Keys**
2. Click **Create API Key**
3. Name it (e.g., "MCP Agent")
4. Copy the key

## Step 2: Configure Your Client

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "raven-docs": {
      "url": "http://localhost:3000/api/mcp-standard",
      "transport": "http",
      "headers": {
        "Authorization": "Bearer raven_sk_your_key_here"
      }
    }
  }
}
```

### Custom MCP Client

```typescript
import { MCPClient } from '@modelcontextprotocol/sdk';

const client = new MCPClient({
  serverUrl: 'http://localhost:3000/api/mcp-standard',
  headers: {
    'Authorization': `Bearer ${process.env.RAVEN_API_KEY}`,
  },
});

// Initialize connection
await client.initialize();

// List available tools
const tools = await client.listTools();
```

## Step 3: Test the Connection

### List Categories

```bash
curl -X POST "http://localhost:3000/api/mcp-standard/list_categories" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

Expected response:

```json
{
  "categories": [
    { "id": "page", "name": "Page Management", "toolCount": 14 },
    { "id": "task", "name": "Task Management", "toolCount": 11 },
    ...
  ]
}
```

### Search for Tools

```bash
curl -X POST "http://localhost:3000/api/mcp-standard/search_tools" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "query": "create page" }'
```

### Call a Tool

```bash
curl -X POST "http://localhost:3000/api/mcp-standard/call_tool" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "space_list",
    "arguments": {
      "workspaceId": "ws_your_workspace_id"
    }
  }'
```

## Step 4: Use with an Agent

### Simple Example

```typescript
import { MCPClient } from '@modelcontextprotocol/sdk';
import Anthropic from '@anthropic-ai/sdk';

const mcp = new MCPClient({
  serverUrl: 'http://localhost:3000/api/mcp-standard',
  headers: { 'Authorization': `Bearer ${RAVEN_API_KEY}` },
});

const anthropic = new Anthropic();

// Get available tools
const { tools } = await mcp.listTools();

// Run agent with tools
const response = await anthropic.messages.create({
  model: 'claude-3-5-sonnet-20241022',
  messages: [
    { role: 'user', content: 'List all spaces in my workspace' }
  ],
  tools: tools.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  })),
});

// Handle tool calls
for (const block of response.content) {
  if (block.type === 'tool_use') {
    const result = await mcp.callTool(block.name, block.input);
    console.log(result);
  }
}
```

## Environment Variables

We recommend using environment variables for credentials:

```bash
# .env
RAVEN_API_KEY=raven_sk_your_key_here
RAVEN_WORKSPACE_ID=ws_your_workspace_id
```

```typescript
const mcp = new MCPClient({
  serverUrl: 'http://localhost:3000/api/mcp-standard',
  headers: {
    'Authorization': `Bearer ${process.env.RAVEN_API_KEY}`,
  },
});
```

## Common Issues

### 401 Unauthorized

- Check that your API key is correct
- Ensure the key hasn't been revoked
- Verify the Authorization header format

### 403 Forbidden

- The user who created the API key may lack permissions
- Check workspace membership

### Tool Not Found

- Use `search_tools` to find the correct tool name
- Tool names use underscores (e.g., `page_create` not `pageCreate`)

## Next Steps

- [Tool Search](/mcp/tools/tool-search) - Discover available tools
- [Examples](/mcp/examples) - More code examples
- [Authentication](/mcp/authentication) - Advanced auth options
