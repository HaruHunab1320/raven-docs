import { Injectable, OnModuleInit } from '@nestjs/common';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { Logger } from '@nestjs/common';

/**
 * Interface for MCP method schema
 */
export interface MCPMethodSchema {
  name: string;
  description: string;
  category: string;
  parameters: Record<string, any>;
  returns: Record<string, any>;
  errors: Array<{
    code: string;
    message: string;
    resolution: string;
  }>;
  examples: Array<{
    description: string;
    request: any;
    response: any;
  }>;
  relatedMethods: string[];
}

/**
 * Service to manage MCP method schemas for self-describing API
 */
@Injectable()
export class MCPSchemaService implements OnModuleInit {
  private logger = new Logger(MCPSchemaService.name);
  private schemas: Map<string, MCPMethodSchema> = new Map();
  private methodCategories: Map<string, string[]> = new Map();

  /**
   * Initialize schema loading when the module starts
   */
  async onModuleInit() {
    await this.loadSchemas();
  }

  /**
   * Load method schemas from file
   */
  private async loadSchemas() {
    try {
      // Adjust the path to where your schema file is located
      const schemaPath = join(process.cwd(), '../../mcp-method-schemas.json');
      const schemaContent = await readFile(schemaPath, 'utf8');
      const schemaData = JSON.parse(schemaContent);

      // Process and store each method schema
      if (Array.isArray(schemaData.methods)) {
        for (const schema of schemaData.methods) {
          this.schemas.set(schema.name, schema);

          // Organize methods by category
          if (!this.methodCategories.has(schema.category)) {
            this.methodCategories.set(schema.category, []);
          }
          this.methodCategories.get(schema.category).push(schema.name);
        }
        this.logger.log(`Loaded ${this.schemas.size} MCP method schemas`);
      }
    } catch (error: any) {
      this.logger.error(
        `Failed to load method schemas: ${error.message}`,
        error.stack,
      );
      // Initialize with empty schemas rather than fail
      this.schemas = new Map();
      this.methodCategories = new Map();
    }
  }

  /**
   * Get all method names
   */
  getAllMethodNames(): string[] {
    return Array.from(this.schemas.keys());
  }

  /**
   * Get all method categories
   */
  getAllCategories(): string[] {
    return Array.from(this.methodCategories.keys());
  }

  /**
   * Get methods by category
   */
  getMethodsByCategory(category: string): string[] {
    return this.methodCategories.get(category) || [];
  }

  /**
   * Get schema for a specific method
   */
  getMethodSchema(methodName: string): MCPMethodSchema | null {
    return this.schemas.get(methodName) || null;
  }

  /**
   * Get all method schemas
   */
  getAllMethodSchemas(): MCPMethodSchema[] {
    return Array.from(this.schemas.values());
  }

  /**
   * Check if a method exists
   */
  hasMethod(methodName: string): boolean {
    return this.schemas.has(methodName);
  }
}
