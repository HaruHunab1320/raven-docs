export const TEAM_AGENT_TYPE_OPTIONS = [
  { value: "claude", label: "Claude Code" },
  { value: "codex", label: "Codex" },
  { value: "gemini", label: "Gemini CLI" },
  { value: "aider", label: "Aider" },
];

export function getProviderKeyForAgentType(agentType: string): "claude" | "codex" | "gemini" | "aider" {
  const normalized = String(agentType || "")
    .trim()
    .toLowerCase();

  if (normalized === "claude" || normalized === "claude-code") {
    return "claude";
  }
  if (normalized === "codex" || normalized === "openai-codex" || normalized === "gpt-codex") {
    return "codex";
  }
  if (normalized === "gemini" || normalized === "gemini-cli") {
    return "gemini";
  }
  return "aider";
}
