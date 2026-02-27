#!/usr/bin/env node
/**
 * Raven MCP Bridge
 *
 * A stdio MCP server that proxies tool calls to Raven's HTTP MCP API.
 * This lets Claude Code (and other MCP clients) register Raven tools natively
 * instead of requiring agents to use curl.
 *
 * Environment variables:
 *   MCP_SERVER_URL  - Base URL of the Raven server (e.g. http://localhost:3000)
 *   MCP_API_KEY     - Bearer token for authenticated endpoints
 *   MCP_DEBUG       - Set to "true" for verbose stderr logging
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:3000';
const API_KEY = process.env.MCP_API_KEY || '';
const DEBUG = process.env.MCP_DEBUG === 'true';

function log(...args: any[]) {
  if (DEBUG) {
    process.stderr.write(`[mcp-bridge] ${args.map(String).join(' ')}\n`);
  }
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

async function post(path: string, body?: Record<string, any>, auth = false) {
  const url = `${SERVER_URL}/api/mcp-standard/${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (auth && API_KEY) {
    headers['Authorization'] = `Bearer ${API_KEY}`;
  }

  log(`POST ${url}`);
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: body ? JSON.stringify(body) : '{}',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
  }

  return res.json();
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface RavenTool {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Fetch tools up-front so we can return them on tools/list
  log('Fetching tools from Raven API...');
  let tools: RavenTool[] = [];
  try {
    const result = await post('list_tools');
    tools = result?.tools || [];
    log(`Fetched ${tools.length} tools`);
  } catch (err: any) {
    log(`Failed to fetch tools: ${err.message}`);
  }

  // Add discovery meta-tools
  tools.push(
    {
      name: 'search_tools',
      description:
        'Search for available Raven tools by query, category, or tags. Returns matching tools with relevance scores.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Text search query — matches against name, description, and tags',
          },
          category: {
            type: 'string',
            description: 'Filter by tool category (e.g. page, task, research)',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Filter by tags (any match)',
          },
          limit: {
            type: 'number',
            description: 'Maximum results (default: 20)',
          },
        },
      },
    },
    {
      name: 'list_categories',
      description:
        'List all available tool categories with descriptions and tool counts.',
      inputSchema: { type: 'object', properties: {} },
    },
  );

  // Build tool map for quick lookup on call
  const toolMap = new Map<string, RavenTool>();
  for (const t of tools) {
    toolMap.set(t.name, t);
  }

  // Create low-level server so we can return raw JSON schemas
  const server = new Server(
    { name: 'raven-docs', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  // ── tools/list handler ────────────────────────────────────────────────────

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map(({ name, description, inputSchema }) => ({
      name,
      description,
      inputSchema: inputSchema || { type: 'object', properties: {} },
    })),
  }));

  // ── tools/call handler ────────────────────────────────────────────────────

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    log(`Calling tool: ${name}`);

    // Discovery meta-tools are proxied to their own endpoints
    if (name === 'search_tools') {
      try {
        const result = await post('search_tools', args || {});
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true,
        };
      }
    }

    if (name === 'list_categories') {
      try {
        const result = await post('list_categories');
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true,
        };
      }
    }

    // All other tools go to call_tool
    try {
      const result = await post(
        'call_tool',
        { name, arguments: args || {} },
        true,
      );

      // If the Raven API already returns MCP content format, pass it through
      if (result?.content && Array.isArray(result.content)) {
        return result;
      }

      // Wrap raw results in text content
      return {
        content: [
          {
            type: 'text',
            text:
              typeof result === 'string'
                ? result
                : JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err: any) {
      log(`Tool ${name} failed: ${err.message}`);
      return {
        content: [
          { type: 'text', text: `Error calling ${name}: ${err.message}` },
        ],
        isError: true,
      };
    }
  });

  // Connect via stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log('MCP bridge connected via stdio');
}

main().catch((err) => {
  process.stderr.write(`[mcp-bridge] Fatal: ${err.message}\n${err.stack}\n`);
  process.exit(1);
});
