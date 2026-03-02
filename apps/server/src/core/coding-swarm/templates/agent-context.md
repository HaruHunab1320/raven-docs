# Raven Docs — Agent Context

## Your Task
{{taskDescription}}

## Execution Info
- Execution ID: {{executionId}}
- Workspace ID: {{workspaceId}}

## Raven MCP Tools

You have **native MCP tools** for interacting with Raven Docs. Call them directly like any other tool — no curl or HTTP needed.

Your tools are already loaded and ready to use. Your workflow guide (in the task description above) shows the specific tools and usage patterns for your role — **start there, do not search for tools first**.

### Tool Discovery
- **`search_tools`** — Search for tools by keyword. Only use this if you need a tool not already shown in your workflow guide.
- **`list_categories`** — List all tool categories with descriptions and tool counts.

### Available Tool Categories
{{toolCategories}}

{{#teamStructure}}
## Team Structure

You are part of a team. Use `team_send_message`, `team_read_messages`, and `team_list_team` to communicate with your team.

{{{teamStructure}}}
{{/teamStructure}}

## Guidelines
- Call tools directly as MCP tools — do NOT use curl or HTTP requests
- Your workflow guide (in the task description) shows the specific tools and flows for your role — use them directly
- Do NOT commit API keys or injected config files
- Stay on the current git branch
