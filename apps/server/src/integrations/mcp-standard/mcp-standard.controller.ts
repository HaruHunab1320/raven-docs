import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  UseGuards,
  Get,
  Headers,
  Query,
} from '@nestjs/common';
import { MCPStandardService, ToolSearchParams } from './mcp-standard.service';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { MCPApiKeyGuard } from '../mcp/guards/mcp-api-key.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { User } from '@raven-docs/db/types/entity.types';
import { ToolCategory } from './tool-catalog';

/**
 * Standard Model Context Protocol (MCP) Controller
 *
 * This controller implements the standard MCP protocol as defined by Anthropic.
 * It translates standard MCP requests to our internal Master Control Program API.
 */
@Controller('mcp-standard')
@SkipTransform()
export class MCPStandardController {
  private readonly logger = new Logger(MCPStandardController.name);

  constructor(private readonly mcpStandardService: MCPStandardService) {}

  /**
   * List available tools (MCP standard endpoint)
   *
   * Returns all tools. For efficient discovery with large tool sets,
   * use search_tools or list_categories instead.
   */
  @Post('list_tools')
  @Public()
  @HttpCode(HttpStatus.OK)
  async listTools(@Body() body?: { category?: ToolCategory }) {
    this.logger.debug('Listing MCP tools');
    return this.mcpStandardService.listTools(body);
  }

  /**
   * Search for tools (Tool Discovery endpoint)
   *
   * Enables efficient tool discovery without loading the entire catalog.
   * Supports text search, category filtering, and tag filtering.
   *
   * @example
   * POST /mcp-standard/search_tools
   * { "query": "create page", "limit": 10 }
   *
   * @example
   * POST /mcp-standard/search_tools
   * { "category": "task", "tags": ["assign"] }
   */
  @Post('search_tools')
  @Public()
  @HttpCode(HttpStatus.OK)
  async searchTools(@Body() params: ToolSearchParams) {
    this.logger.debug('Searching MCP tools');
    return this.mcpStandardService.searchTools(params);
  }

  /**
   * List tool categories (Tool Discovery endpoint)
   *
   * Returns all available categories with descriptions and tool counts.
   * Useful for understanding the available tool domains.
   */
  @Post('list_categories')
  @Public()
  @HttpCode(HttpStatus.OK)
  async listCategories() {
    this.logger.debug('Listing MCP tool categories');
    return this.mcpStandardService.listCategories();
  }

  /**
   * Get tools by category (Tool Discovery endpoint)
   *
   * Returns all tools in a specific category.
   */
  @Post('get_tools_by_category')
  @Public()
  @HttpCode(HttpStatus.OK)
  async getToolsByCategory(@Body() body: { category: ToolCategory }) {
    this.logger.debug(`Getting tools for category: ${body.category}`);
    return this.mcpStandardService.getToolsByCategory(body.category);
  }

  /**
   * Call a tool (MCP standard endpoint)
   */
  @Post('call_tool')
  @UseGuards(MCPApiKeyGuard)
  @HttpCode(HttpStatus.OK)
  async callTool(
    @Body() body: any,
    @AuthUser() user: User,
  ) {
    this.logger.debug(`Calling tool: ${body.name}`);
    
    return this.mcpStandardService.callTool(
      body.name,
      body.arguments || {},
      user,
    );
  }

  /**
   * Initialize connection (MCP standard endpoint)
   */
  @Post('initialize')
  @Public()
  @HttpCode(HttpStatus.OK)
  async initialize(@Body() body: any) {
    this.logger.debug('Initializing MCP connection');
    return this.mcpStandardService.initialize(body);
  }

  /**
   * List resources (MCP standard endpoint)
   */
  @Post('list_resources')
  @UseGuards(MCPApiKeyGuard)
  @HttpCode(HttpStatus.OK)
  async listResources() {
    this.logger.debug('Listing MCP resources');
    return this.mcpStandardService.listResources();
  }

  /**
   * Read resource (MCP standard endpoint)
   */
  @Post('read_resource')
  @UseGuards(MCPApiKeyGuard)
  @HttpCode(HttpStatus.OK)
  async readResource(@Body() body: any, @AuthUser() user: User) {
    this.logger.debug(`Reading resource: ${body.uri}`);
    
    return this.mcpStandardService.readResource(body.uri, user);
  }

  /**
   * Subscribe to resource (MCP standard endpoint)
   */
  @Post('subscribe')
  @UseGuards(MCPApiKeyGuard)
  @HttpCode(HttpStatus.OK)
  async subscribe(@Body() body: any, @AuthUser() user: User) {
    this.logger.debug(`Subscribing to: ${body.uri}`);
    
    return this.mcpStandardService.subscribe(body.uri, user);
  }

  /**
   * Unsubscribe from resource (MCP standard endpoint)
   */
  @Post('unsubscribe')
  @UseGuards(MCPApiKeyGuard)
  @HttpCode(HttpStatus.OK)
  async unsubscribe(@Body() body: any, @AuthUser() user: User) {
    this.logger.debug(`Unsubscribing from: ${body.uri}`);
    
    return this.mcpStandardService.unsubscribe(body.uri, user);
  }

  /**
   * Complete text (MCP standard endpoint)
   */
  @Post('complete')
  @UseGuards(MCPApiKeyGuard)
  @HttpCode(HttpStatus.OK)
  async complete(@Body() body: any, @AuthUser() user: User) {
    this.logger.debug('Completing text');
    
    return this.mcpStandardService.complete(body, user);
  }

  /**
   * List prompts (MCP standard endpoint)
   */
  @Post('list_prompts')
  @UseGuards(MCPApiKeyGuard)
  @HttpCode(HttpStatus.OK)
  async listPrompts() {
    this.logger.debug('Listing prompts');
    return this.mcpStandardService.listPrompts();
  }

  /**
   * Get prompt (MCP standard endpoint)
   */
  @Post('get_prompt')
  @UseGuards(MCPApiKeyGuard)
  @HttpCode(HttpStatus.OK)
  async getPrompt(@Body() body: any) {
    this.logger.debug(`Getting prompt: ${body.name}`);
    return this.mcpStandardService.getPrompt(body.name, body.arguments);
  }
}