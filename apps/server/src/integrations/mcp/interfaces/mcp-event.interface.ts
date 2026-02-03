/**
 * Machine Control Protocol (MCP) Event Interface
 *
 * This file defines the interfaces for real-time MCP events sent over WebSockets
 */

/**
 * Base interface for all MCP events
 */
export interface MCPEvent {
  /**
   * Event type
   */
  type: MCPEventType;

  /**
   * Resource type that was modified
   */
  resource: MCPResourceType;

  /**
   * Operation performed on the resource
   */
  operation: MCPOperationType;

  /**
   * Resource ID that was modified
   */
  resourceId: string;

  /**
   * Timestamp of when the event occurred
   */
  timestamp: string;

  /**
   * Data associated with the event
   */
  data?: any;

  /**
   * User ID of who triggered the event
   */
  userId: string;

  /**
   * Workspace ID where the event occurred
   */
  workspaceId: string;

  /**
   * Space ID where the event occurred (if applicable)
   */
  spaceId?: string;
}

/**
 * Types of MCP events
 */
export enum MCPEventType {
  /**
   * Resource was created
   */
  CREATED = 'created',

  /**
   * Resource was updated
   */
  UPDATED = 'updated',

  /**
   * Resource was deleted
   */
  DELETED = 'deleted',

  /**
   * Resource was moved (e.g., between spaces)
   */
  MOVED = 'moved',

  /**
   * Permission changes on a resource
   */
  PERMISSION_CHANGED = 'permission_changed',

  /**
   * User presence update
   */
  PRESENCE = 'presence',

  /**
   * Navigation event
   */
  NAVIGATION = 'navigation',

  /**
   * Agent access requested
   */
  AGENT_ACCESS_REQUESTED = 'agent_access_requested',

  /**
   * Agent access approved
   */
  AGENT_ACCESS_APPROVED = 'agent_access_approved',

  /**
   * Agent access denied
   */
  AGENT_ACCESS_DENIED = 'agent_access_denied',

  /**
   * Agent access revoked
   */
  AGENT_ACCESS_REVOKED = 'agent_access_revoked',

  /**
   * Agent assigned to project/task
   */
  AGENT_ASSIGNED = 'agent_assigned',

  /**
   * Agent unassigned from project/task
   */
  AGENT_UNASSIGNED = 'agent_unassigned',

  /**
   * Agent activity logged
   */
  AGENT_ACTIVITY = 'agent_activity',

  /**
   * Agent status changed (idle/working/paused)
   */
  AGENT_STATUS_CHANGED = 'agent_status_changed',

  /**
   * Tool/method was executed (for agent activity tracking)
   */
  TOOL_EXECUTED = 'tool_executed',
}

/**
 * Types of resources that can be modified
 */
export enum MCPResourceType {
  PAGE = 'page',
  SPACE = 'space',
  WORKSPACE = 'workspace',
  USER = 'user',
  GROUP = 'group',
  ATTACHMENT = 'attachment',
  COMMENT = 'comment',
  PROJECT = 'project',
  TASK = 'task',
  UI = 'ui',
  AGENT = 'agent',
}

/**
 * Types of operations that can be performed
 */
export enum MCPOperationType {
  CREATE = 'create',
  READ = 'read',
  UPDATE = 'update',
  DELETE = 'delete',
  MOVE = 'move',
  ADD_MEMBER = 'add_member',
  REMOVE_MEMBER = 'remove_member',
  NAVIGATE = 'navigate',
  APPROVE = 'approve',
  DENY = 'deny',
  REVOKE = 'revoke',
  ASSIGN = 'assign',
  UNASSIGN = 'unassign',
  EXECUTE = 'execute',
}

/**
 * Page event data
 */
export interface PageEventData {
  title?: string;
  parentPageId?: string;
  content?: any;
}

/**
 * Comment event data
 */
export interface CommentEventData {
  content?: any;
  pageId?: string;
  parentCommentId?: string;
}

/**
 * User presence event data
 */
export interface PresenceEventData {
  pageId: string;
  status: 'online' | 'offline' | 'idle';
  lastActive: string;
  cursorPosition?: {
    x: number;
    y: number;
  };
}

/**
 * Tool execution event data (for agent activity tracking)
 */
export interface ToolExecutedEventData {
  /** The tool/method that was called (e.g., "page.create") */
  tool: string;
  /** Sanitized input parameters (sensitive data removed) */
  params?: Record<string, any>;
  /** Whether the tool execution succeeded */
  success: boolean;
  /** Execution duration in milliseconds */
  durationMs: number;
  /** Error message if failed */
  error?: string;
  /** Summary of the result (not the full result to avoid large payloads) */
  resultSummary?: string;
  /** Whether the caller is an agent (vs human user) */
  isAgent: boolean;
  /** Agent ID if caller is an agent */
  agentId?: string;
}
