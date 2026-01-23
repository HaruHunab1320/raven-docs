---
title: MCP Examples
sidebar_position: 7
---

# MCP Examples

Code examples for common MCP use cases.

## Basic Agent

A simple agent that can answer questions from your docs:

```typescript
import { MCPClient } from '@modelcontextprotocol/sdk';
import Anthropic from '@anthropic-ai/sdk';

const mcp = new MCPClient({
  serverUrl: 'https://api.ravendocs.com/mcp-standard',
  headers: { 'Authorization': `Bearer ${process.env.RAVEN_API_KEY}` },
});

const anthropic = new Anthropic();

async function askQuestion(question: string) {
  // Search for relevant tools
  const { tools } = await mcp.searchTools({
    query: question,
    limit: 5,
  });

  // Run agent
  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 4096,
    messages: [
      { role: 'user', content: question }
    ],
    tools: tools.map(t => ({
      name: t.tool.name,
      description: t.tool.description,
      input_schema: t.tool.inputSchema,
    })),
  });

  // Handle tool calls
  for (const block of response.content) {
    if (block.type === 'tool_use') {
      const result = await mcp.callTool(block.name, block.input);
      console.log(`Tool ${block.name}:`, result);
    }
  }

  return response;
}

// Usage
await askQuestion('What are the main API endpoints?');
```

## Documentation Bot

A chatbot that answers questions using your docs:

```typescript
async function docBot(userMessage: string, conversationHistory: any[]) {
  const workspaceId = process.env.RAVEN_WORKSPACE_ID;

  // Search docs first
  const searchResults = await mcp.callTool('search_query', {
    workspaceId,
    query: userMessage,
    limit: 5,
  });

  // Build context from search results
  const context = searchResults.content[0].text;

  // Generate response with context
  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    system: `You are a helpful documentation assistant.
Use the following search results to answer questions:

${context}

If you can't find the answer, say so.`,
    messages: [
      ...conversationHistory,
      { role: 'user', content: userMessage }
    ],
  });

  return response.content[0].text;
}
```

## Auto-Documentation Agent

Agent that keeps documentation in sync with code:

```typescript
async function updateApiDocs(apiSchema: any) {
  const workspaceId = process.env.RAVEN_WORKSPACE_ID;

  // Find the API reference page
  const searchResult = await mcp.callTool('page_search', {
    query: 'API Reference',
    limit: 1,
  });

  const pageData = JSON.parse(searchResult.content[0].text);
  const pageId = pageData.data[0]?.id;

  if (!pageId) {
    // Create if doesn't exist
    await mcp.callTool('page_create', {
      workspaceId,
      spaceId: 'space_docs',
      title: 'API Reference',
      content: generateApiContent(apiSchema),
    });
  } else {
    // Update existing
    await mcp.callTool('page_update', {
      pageId,
      workspaceId,
      content: generateApiContent(apiSchema),
    });
  }
}

function generateApiContent(schema: any) {
  return {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 1 },
        content: [{ type: 'text', text: 'API Reference' }]
      },
      // ... generate from schema
    ],
  };
}
```

## Task Management Agent

Agent that creates and manages tasks:

```typescript
async function taskAgent(instruction: string) {
  const workspaceId = process.env.RAVEN_WORKSPACE_ID;

  // Get task-related tools
  const { tools } = await mcp.searchTools({
    category: 'task',
  });

  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    system: `You are a task management assistant.
Help users create, update, and organize tasks.
Workspace ID: ${workspaceId}`,
    messages: [
      { role: 'user', content: instruction }
    ],
    tools: tools.map(t => ({
      name: t.tool.name,
      description: t.tool.description,
      input_schema: t.tool.inputSchema,
    })),
  });

  // Execute tool calls
  for (const block of response.content) {
    if (block.type === 'tool_use') {
      await mcp.callTool(block.name, {
        ...block.input,
        workspaceId,
      });
    }
  }
}

// Usage
await taskAgent('Create a high priority task to review the security docs, due next Friday');
```

## Memory-Enhanced Agent

Agent that remembers context across conversations:

```typescript
async function memoryAgent(userMessage: string, sessionId: string) {
  const workspaceId = process.env.RAVEN_WORKSPACE_ID;

  // Recall relevant memories
  const memories = await mcp.callTool('memory_query', {
    workspaceId,
    query: userMessage,
    limit: 3,
  });

  const memoryContext = JSON.parse(memories.content[0].text);

  // Generate response with memory context
  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    system: `You are a helpful assistant with memory.

Previous context:
${memoryContext.results?.map(m => m.content).join('\n') || 'No relevant memories.'}

Remember important information from this conversation.`,
    messages: [
      { role: 'user', content: userMessage }
    ],
  });

  // Store new memories if needed
  if (shouldRemember(response)) {
    await mcp.callTool('memory_ingest', {
      workspaceId,
      content: extractMemory(response),
      tags: ['conversation', sessionId],
    });
  }

  return response;
}
```

## Batch Operations

Efficiently process multiple items:

```typescript
async function bulkCreatePages(pages: { title: string; content: any }[]) {
  const workspaceId = process.env.RAVEN_WORKSPACE_ID;
  const spaceId = 'space_123';

  const results = await Promise.all(
    pages.map(page =>
      mcp.callTool('page_create', {
        workspaceId,
        spaceId,
        title: page.title,
        content: page.content,
      })
    )
  );

  return results;
}
```

## Error Handling

Robust error handling for production:

```typescript
async function safeToolCall(toolName: string, args: any, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await mcp.callTool(toolName, args);
    } catch (error) {
      if (error.status === 429) {
        // Rate limited - wait and retry
        const delay = Math.pow(2, i) * 1000;
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      if (error.status >= 500) {
        // Server error - retry
        continue;
      }
      // Client error - don't retry
      throw error;
    }
  }
  throw new Error('Max retries exceeded');
}
```

## Related

- [MCP Overview](/mcp/overview) - Introduction
- [Tool Search](/mcp/tools/tool-search) - Finding tools
- [Authentication](/mcp/authentication) - Security
