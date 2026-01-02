import { Injectable } from '@nestjs/common';
import {
  MCPMethodSchema,
  MCPSchemaService,
} from '../services/mcp-schema.service';

/**
 * System handler for MCP system-level operations
 * Provides methods for API self-description and discovery
 */
@Injectable()
export class SystemHandler {
  constructor(private readonly schemaService: MCPSchemaService) {}

  /**
   * List all available MCP methods with their documentation
   * Allows API consumers to discover available functionality
   */
  async listMethods(): Promise<{
    methods: string[];
    categories: Record<string, string[]>;
  }> {
    const allMethods = this.schemaService.getAllMethodNames();
    const categories = this.schemaService.getAllCategories();

    // Build category mapping
    const categoryMap: Record<string, string[]> = {};
    for (const category of categories) {
      categoryMap[category] = this.schemaService.getMethodsByCategory(category);
    }

    return {
      methods: allMethods,
      categories: categoryMap,
    };
  }

  /**
   * Get detailed schema information for a specific method
   * @param methodName Name of the method to retrieve schema for
   */
  async getMethodSchema(params: {
    methodName: string;
  }): Promise<MCPMethodSchema | { error: string }> {
    const { methodName } = params;

    if (!methodName) {
      return { error: 'Method name is required' };
    }

    const schema = this.schemaService.getMethodSchema(methodName);

    if (!schema) {
      return { error: `Method '${methodName}' not found` };
    }

    return schema;
  }
}
