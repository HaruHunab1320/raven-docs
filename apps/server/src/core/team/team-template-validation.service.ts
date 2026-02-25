import { Injectable } from '@nestjs/common';
import { MCPSchemaService } from '../../integrations/mcp/services/mcp-schema.service';

@Injectable()
export class TeamTemplateValidationService {
  private readonly supportedAgentTypes = new Set([
    'claude',
    'claude-code',
    'claudecode',
    'claude_code',
    'codex',
    'gpt-codex',
    'openai-codex',
    'gemini',
    'gemini-cli',
    'gemini_cli',
    'aider',
  ]);

  constructor(private readonly mcpSchema: MCPSchemaService) {}

  validateOrgPatternCapabilities(orgPattern: Record<string, any>) {
    const invalid: Array<{ roleId: string; capability: string; reason: string }> = [];
    const roles = orgPattern?.structure?.roles || {};
    const methodNames = new Set(this.mcpSchema.getAllMethodNames());
    if (methodNames.size === 0) {
      return { valid: true, invalidCapabilities: [] };
    }

    for (const [roleId, roleDef] of Object.entries(roles)) {
      const roleAgentType = String((roleDef as any)?.agentType || '').trim();
      if (
        roleAgentType &&
        !this.supportedAgentTypes.has(roleAgentType.toLowerCase())
      ) {
        invalid.push({
          roleId,
          capability: roleAgentType,
          reason:
            'Unsupported agentType. Use one of: claude, codex, gemini, aider',
        });
      }

      const capabilities = Array.isArray((roleDef as any)?.capabilities)
        ? ((roleDef as any).capabilities as string[])
        : [];

      for (const capability of capabilities) {
        const cap = String(capability || '').trim();
        if (!cap) continue;

        if (cap === '*') continue;
        if (cap === 'context.query') continue; // supported alias

        if (this.isResourceWildcard(cap)) {
          const resourcePrefix = cap.slice(0, -1); // includes trailing '.'
          const hasAny = Array.from(methodNames).some((m) =>
            m.startsWith(resourcePrefix),
          );
          if (!hasAny) {
            invalid.push({
              roleId,
              capability: cap,
              reason: 'No matching MCP methods for wildcard resource',
            });
          }
          continue;
        }

        if (!this.isMethodShape(cap)) {
          invalid.push({
            roleId,
            capability: cap,
            reason: 'Capability must be an MCP method (resource.operation) or resource.*',
          });
          continue;
        }

        if (!methodNames.has(cap)) {
          invalid.push({
            roleId,
            capability: cap,
            reason: 'MCP method does not exist',
          });
        }
      }
    }

    return {
      valid: invalid.length === 0,
      invalidCapabilities: invalid,
    };
  }

  private isMethodShape(value: string) {
    return /^[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+$/.test(value);
  }

  private isResourceWildcard(value: string) {
    return /^[a-zA-Z0-9_]+\.\*$/.test(value);
  }
}
