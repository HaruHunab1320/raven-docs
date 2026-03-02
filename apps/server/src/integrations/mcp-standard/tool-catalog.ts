/**
 * MCP Tool Catalog
 *
 * Defines all available MCP tools with metadata for search and discovery.
 * This enables agents to find relevant tools without loading the entire catalog.
 */

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  category: ToolCategory;
  tags: string[];
}

export type ToolCategory =
  | 'space'
  | 'page'
  | 'project'
  | 'task'
  | 'user'
  | 'comment'
  | 'group'
  | 'workspace'
  | 'attachment'
  | 'search'
  | 'import_export'
  | 'approval'
  | 'ai'
  | 'memory'
  | 'research'
  | 'navigation'
  | 'system'
  | 'context'
  | 'coding_swarm'
  | 'github_issues'
  | 'team_messaging';

export interface ToolCategoryInfo {
  id: ToolCategory;
  name: string;
  description: string;
  toolCount: number;
}

/**
 * Category metadata for discovery
 */
export const TOOL_CATEGORIES: Record<ToolCategory, { name: string; description: string }> = {
  space: {
    name: 'Space Management',
    description: 'Create, update, delete spaces and manage space members and permissions',
  },
  page: {
    name: 'Page Management',
    description: 'Create, read, update, delete pages, manage page hierarchy and history',
  },
  project: {
    name: 'Project Management',
    description: 'Create and manage projects within spaces',
  },
  task: {
    name: 'Task Management',
    description: 'Create, update, assign, and track tasks',
  },
  user: {
    name: 'User Management',
    description: 'List and manage workspace users',
  },
  comment: {
    name: 'Comments',
    description: 'Add, edit, delete, and resolve comments on pages',
  },
  group: {
    name: 'Group Management',
    description: 'Create and manage user groups for permissions',
  },
  workspace: {
    name: 'Workspace Management',
    description: 'Manage workspaces, members, invitations, and settings',
  },
  attachment: {
    name: 'Attachments',
    description: 'Upload, download, and manage file attachments',
  },
  search: {
    name: 'Search',
    description: 'Full-text search across pages and content',
  },
  import_export: {
    name: 'Import & Export',
    description: 'Import content and export pages or spaces',
  },
  approval: {
    name: 'Approvals',
    description: 'Request and manage approval workflows',
  },
  ai: {
    name: 'AI Generation',
    description: 'AI-powered content generation',
  },
  memory: {
    name: 'Agent Memory',
    description: 'Store and retrieve agent context and memory',
  },
  research: {
    name: 'Research',
    description: 'Create and manage research jobs',
  },
  navigation: {
    name: 'Navigation',
    description: 'UI navigation commands',
  },
  system: {
    name: 'System',
    description: 'API discovery and system information',
  },
  context: {
    name: 'Context',
    description: 'Session context key-value storage',
  },
  coding_swarm: {
    name: 'Coding Swarm',
    description: 'Spawn coding agents in isolated git workspaces to write and execute code',
  },
  github_issues: {
    name: 'GitHub Issues',
    description: 'Create, read, update, and comment on GitHub issues',
  },
  team_messaging: {
    name: 'Team Messaging',
    description: 'Send messages to team members, read incoming messages, and view team roster',
  },
};

/**
 * Complete tool catalog with categories and tags
 */
export const TOOL_CATALOG: MCPToolDefinition[] = [
  // ==========================================================================
  // SPACE MANAGEMENT
  // ==========================================================================
  {
    name: 'space_list',
    description: 'List all spaces in a workspace',
    category: 'space',
    tags: ['list', 'read', 'browse', 'spaces'],
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        page: { type: 'number', description: 'Page number for pagination' },
        limit: { type: 'number', description: 'Number of items per page' },
      },
      required: ['workspaceId'],
    },
  },
  {
    name: 'space_create',
    description: 'Create a new space',
    category: 'space',
    tags: ['create', 'write', 'new'],
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the space' },
        description: { type: 'string', description: 'Description of the space' },
        slug: { type: 'string', description: 'URL slug for the space' },
        workspaceId: { type: 'string', description: 'ID of the workspace' },
      },
      required: ['name', 'workspaceId'],
    },
  },
  {
    name: 'space_get',
    description: 'Get a space by ID',
    category: 'space',
    tags: ['read', 'get', 'details'],
    inputSchema: {
      type: 'object',
      properties: {
        spaceId: { type: 'string', description: 'ID of the space' },
        workspaceId: { type: 'string', description: 'ID of the workspace' },
      },
      required: ['spaceId', 'workspaceId'],
    },
  },
  {
    name: 'space_update',
    description: 'Update an existing space',
    category: 'space',
    tags: ['update', 'write', 'edit', 'modify'],
    inputSchema: {
      type: 'object',
      properties: {
        spaceId: { type: 'string', description: 'ID of the space' },
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        name: { type: 'string', description: 'New name for the space' },
        description: { type: 'string', description: 'New description' },
        slug: { type: 'string', description: 'New URL slug' },
      },
      required: ['spaceId', 'workspaceId'],
    },
  },
  {
    name: 'space_update_permissions',
    description: 'Update space permissions for a user or group',
    category: 'space',
    tags: ['permissions', 'access', 'security', 'role'],
    inputSchema: {
      type: 'object',
      properties: {
        spaceId: { type: 'string', description: 'ID of the space' },
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        targetId: { type: 'string', description: 'User or group ID' },
        role: { type: 'string', description: 'Role to assign' },
        isGroup: { type: 'boolean', description: 'True when targetId refers to a group' },
      },
      required: ['spaceId', 'workspaceId', 'targetId', 'role'],
    },
  },
  {
    name: 'space_members',
    description: 'List members of a space',
    category: 'space',
    tags: ['members', 'list', 'users', 'access'],
    inputSchema: {
      type: 'object',
      properties: {
        spaceId: { type: 'string', description: 'ID of the space' },
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        page: { type: 'number', description: 'Page number for pagination' },
        limit: { type: 'number', description: 'Number of items per page' },
        query: { type: 'string', description: 'Search query' },
      },
      required: ['spaceId', 'workspaceId'],
    },
  },
  {
    name: 'space_members_add',
    description: 'Add members to a space',
    category: 'space',
    tags: ['members', 'add', 'invite', 'access'],
    inputSchema: {
      type: 'object',
      properties: {
        spaceId: { type: 'string', description: 'ID of the space' },
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        userIds: { type: 'array', description: 'User IDs to add', items: { type: 'string' } },
        groupIds: { type: 'array', description: 'Group IDs to add', items: { type: 'string' } },
        role: { type: 'string', description: 'Role to assign' },
      },
      required: ['spaceId', 'workspaceId'],
    },
  },
  {
    name: 'space_members_remove',
    description: 'Remove a member from a space',
    category: 'space',
    tags: ['members', 'remove', 'revoke', 'access'],
    inputSchema: {
      type: 'object',
      properties: {
        spaceId: { type: 'string', description: 'ID of the space' },
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        userId: { type: 'string', description: 'User ID to remove' },
        groupId: { type: 'string', description: 'Group ID to remove' },
      },
      required: ['spaceId', 'workspaceId'],
    },
  },
  {
    name: 'space_change_member_role',
    description: 'Change a space member role',
    category: 'space',
    tags: ['members', 'role', 'permissions', 'update'],
    inputSchema: {
      type: 'object',
      properties: {
        spaceId: { type: 'string', description: 'ID of the space' },
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        userId: { type: 'string', description: 'User ID' },
        role: { type: 'string', description: 'New role' },
      },
      required: ['spaceId', 'workspaceId', 'userId', 'role'],
    },
  },
  {
    name: 'space_delete',
    description: 'Delete a space',
    category: 'space',
    tags: ['delete', 'remove', 'destroy'],
    inputSchema: {
      type: 'object',
      properties: {
        spaceId: { type: 'string', description: 'ID of the space to delete' },
        workspaceId: { type: 'string', description: 'ID of the workspace' },
      },
      required: ['spaceId', 'workspaceId'],
    },
  },

  // ==========================================================================
  // PAGE MANAGEMENT
  // ==========================================================================
  {
    name: 'page_list',
    description: 'List pages in a space',
    category: 'page',
    tags: ['list', 'read', 'browse', 'documents'],
    inputSchema: {
      type: 'object',
      properties: {
        spaceId: { type: 'string', description: 'ID of the space' },
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        page: { type: 'number', description: 'Page number for pagination' },
        limit: { type: 'number', description: 'Number of items per page' },
      },
      required: ['spaceId', 'workspaceId'],
    },
  },
  {
    name: 'page_get',
    description: 'Get a page by ID',
    category: 'page',
    tags: ['read', 'get', 'details', 'content'],
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'ID of the page' },
      },
      required: ['pageId'],
    },
  },
  {
    name: 'page_create',
    description: 'Create a new page',
    category: 'page',
    tags: ['create', 'write', 'new', 'document'],
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Title of the page' },
        content: {
          type: 'object',
          description: 'Page content in ProseMirror format',
          properties: { type: { type: 'string' }, content: { type: 'array', items: {} } },
        },
        spaceId: { type: 'string', description: 'ID of the space' },
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        parentId: { type: 'string', description: 'ID of the parent page' },
      },
      required: ['title', 'content', 'spaceId', 'workspaceId'],
    },
  },
  {
    name: 'page_update',
    description: 'Update an existing page',
    category: 'page',
    tags: ['update', 'write', 'edit', 'modify', 'content'],
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'ID of the page' },
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        title: { type: 'string', description: 'New title' },
        content: {
          type: 'object',
          description: 'New content in ProseMirror format',
          properties: { type: { type: 'string' }, content: { type: 'array', items: {} } },
        },
        parentId: { type: 'string', description: 'New parent page ID' },
      },
      required: ['pageId', 'workspaceId'],
    },
  },
  {
    name: 'page_delete',
    description: 'Delete a page',
    category: 'page',
    tags: ['delete', 'remove', 'destroy'],
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'ID of the page to delete' },
        workspaceId: { type: 'string', description: 'ID of the workspace' },
      },
      required: ['pageId', 'workspaceId'],
    },
  },
  {
    name: 'page_move',
    description: 'Move a page to a different location',
    category: 'page',
    tags: ['move', 'reorganize', 'hierarchy', 'parent'],
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'ID of the page to move' },
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        parentId: { type: ['string', 'null'], description: 'New parent page ID' },
        spaceId: { type: 'string', description: 'Target space ID' },
      },
      required: ['pageId', 'workspaceId'],
    },
  },
  {
    name: 'page_search',
    description: 'Search pages by content or title',
    category: 'page',
    tags: ['search', 'find', 'query', 'lookup'],
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        spaceId: { type: 'string', description: 'Optional space ID' },
        page: { type: 'number', description: 'Page number for pagination' },
        limit: { type: 'number', description: 'Number of items per page' },
      },
      required: ['query'],
    },
  },
  {
    name: 'page_get_history',
    description: 'Get page revision history',
    category: 'page',
    tags: ['history', 'versions', 'revisions', 'changes'],
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'ID of the page' },
        page: { type: 'number', description: 'Page number for pagination' },
        limit: { type: 'number', description: 'Number of items per page' },
      },
      required: ['pageId'],
    },
  },
  {
    name: 'page_history_info',
    description: 'Get details of a specific page version',
    category: 'page',
    tags: ['history', 'version', 'revision', 'details'],
    inputSchema: {
      type: 'object',
      properties: {
        historyId: { type: 'string', description: 'History version ID' },
      },
      required: ['historyId'],
    },
  },
  {
    name: 'page_restore',
    description: 'Restore a page to a previous version',
    category: 'page',
    tags: ['restore', 'revert', 'history', 'undo'],
    inputSchema: {
      type: 'object',
      properties: {
        historyId: { type: 'string', description: 'Page history version ID' },
      },
      required: ['historyId'],
    },
  },
  {
    name: 'page_recent',
    description: 'List recently viewed or edited pages',
    category: 'page',
    tags: ['recent', 'history', 'activity', 'browse'],
    inputSchema: {
      type: 'object',
      properties: {
        spaceId: { type: 'string', description: 'Optional space ID' },
        page: { type: 'number', description: 'Page number for pagination' },
        limit: { type: 'number', description: 'Number of items per page' },
      },
    },
  },
  {
    name: 'page_breadcrumbs',
    description: 'Get page breadcrumb navigation path',
    category: 'page',
    tags: ['navigation', 'hierarchy', 'path', 'breadcrumbs'],
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'ID of the page' },
      },
      required: ['pageId'],
    },
  },
  {
    name: 'page_sidebar_pages',
    description: 'Get pages for sidebar navigation',
    category: 'page',
    tags: ['navigation', 'sidebar', 'tree', 'hierarchy'],
    inputSchema: {
      type: 'object',
      properties: {
        spaceId: { type: 'string', description: 'ID of the space' },
        workspaceId: { type: 'string', description: 'ID of the workspace' },
      },
      required: ['spaceId', 'workspaceId'],
    },
  },
  {
    name: 'page_move_to_space',
    description: 'Move a page to a different space',
    category: 'page',
    tags: ['move', 'transfer', 'space', 'reorganize'],
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'ID of the page' },
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        targetSpaceId: { type: 'string', description: 'Target space ID' },
      },
      required: ['pageId', 'workspaceId', 'targetSpaceId'],
    },
  },

  // ==========================================================================
  // PROJECT MANAGEMENT
  // ==========================================================================
  {
    name: 'project_list',
    description: 'List all projects in a space',
    category: 'project',
    tags: ['list', 'read', 'browse'],
    inputSchema: {
      type: 'object',
      properties: {
        spaceId: { type: 'string', description: 'ID of the space' },
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        page: { type: 'number', description: 'Page number for pagination' },
        limit: { type: 'number', description: 'Number of items per page' },
      },
      required: ['spaceId', 'workspaceId'],
    },
  },
  {
    name: 'project_get',
    description: 'Get a project by ID',
    category: 'project',
    tags: ['read', 'get', 'details'],
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'ID of the project' },
        workspaceId: { type: 'string', description: 'ID of the workspace' },
      },
      required: ['projectId', 'workspaceId'],
    },
  },
  {
    name: 'project_create',
    description: 'Create a new project',
    category: 'project',
    tags: ['create', 'write', 'new'],
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the project' },
        description: { type: 'string', description: 'Description of the project' },
        spaceId: { type: 'string', description: 'ID of the space' },
        workspaceId: { type: 'string', description: 'ID of the workspace' },
      },
      required: ['name', 'spaceId', 'workspaceId'],
    },
  },
  {
    name: 'project_update',
    description: 'Update an existing project',
    category: 'project',
    tags: ['update', 'write', 'edit', 'modify'],
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'ID of the project' },
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        name: { type: 'string', description: 'New name' },
        description: { type: 'string', description: 'New description' },
      },
      required: ['projectId', 'workspaceId'],
    },
  },
  {
    name: 'project_archive',
    description: 'Archive a project',
    category: 'project',
    tags: ['archive', 'hide', 'close'],
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'ID of the project' },
        workspaceId: { type: 'string', description: 'ID of the workspace' },
      },
      required: ['projectId', 'workspaceId'],
    },
  },
  {
    name: 'project_delete',
    description: 'Delete a project',
    category: 'project',
    tags: ['delete', 'remove', 'destroy'],
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'ID of the project' },
        workspaceId: { type: 'string', description: 'ID of the workspace' },
      },
      required: ['projectId', 'workspaceId'],
    },
  },
  {
    name: 'project_create_page',
    description: 'Create a page linked to a project',
    category: 'project',
    tags: ['create', 'page', 'document', 'link'],
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'ID of the project' },
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        title: { type: 'string', description: 'Page title' },
        content: { type: 'object', description: 'Page content' },
      },
      required: ['projectId', 'workspaceId', 'title'],
    },
  },

  // ==========================================================================
  // TASK MANAGEMENT
  // ==========================================================================
  {
    name: 'task_list',
    description: 'List tasks with optional filters',
    category: 'task',
    tags: ['list', 'read', 'browse', 'todo', 'issues'],
    inputSchema: {
      type: 'object',
      properties: {
        spaceId: { type: 'string', description: 'Filter by space ID' },
        projectId: { type: 'string', description: 'Filter by project ID' },
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        assigneeId: { type: 'string', description: 'Filter by assignee' },
        status: { type: 'string', description: 'Filter by status' },
        page: { type: 'number', description: 'Page number for pagination' },
        limit: { type: 'number', description: 'Number of items per page' },
      },
      required: ['workspaceId'],
    },
  },
  {
    name: 'task_get',
    description: 'Get a task by ID',
    category: 'task',
    tags: ['read', 'get', 'details', 'todo'],
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'ID of the task' },
        workspaceId: { type: 'string', description: 'ID of the workspace' },
      },
      required: ['taskId', 'workspaceId'],
    },
  },
  {
    name: 'task_create',
    description: 'Create a new task',
    category: 'task',
    tags: ['create', 'write', 'new', 'todo', 'issue'],
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Task title' },
        description: { type: 'string', description: 'Task description' },
        spaceId: { type: 'string', description: 'ID of the space' },
        projectId: { type: 'string', description: 'ID of the project' },
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        assigneeId: { type: 'string', description: 'Assignee user ID' },
        dueDate: { type: 'string', description: 'Due date (ISO 8601)' },
        priority: { type: 'string', description: 'Priority level' },
      },
      required: ['title', 'workspaceId'],
    },
  },
  {
    name: 'task_update',
    description: 'Update an existing task',
    category: 'task',
    tags: ['update', 'write', 'edit', 'modify', 'todo'],
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'ID of the task' },
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        title: { type: 'string', description: 'New title' },
        description: { type: 'string', description: 'New description' },
        status: { type: 'string', description: 'New status' },
        assigneeId: { type: 'string', description: 'New assignee' },
        dueDate: { type: 'string', description: 'New due date' },
        priority: { type: 'string', description: 'New priority' },
        bucket: { type: 'string', description: 'Triage bucket' },
      },
      required: ['taskId', 'workspaceId'],
    },
  },
  {
    name: 'task_delete',
    description: 'Delete a task',
    category: 'task',
    tags: ['delete', 'remove', 'destroy'],
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'ID of the task' },
        workspaceId: { type: 'string', description: 'ID of the workspace' },
      },
      required: ['taskId', 'workspaceId'],
    },
  },
  {
    name: 'task_complete',
    description: 'Mark a task as complete',
    category: 'task',
    tags: ['complete', 'done', 'finish', 'close'],
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'ID of the task' },
        workspaceId: { type: 'string', description: 'ID of the workspace' },
      },
      required: ['taskId', 'workspaceId'],
    },
  },
  {
    name: 'task_assign',
    description: 'Assign a task to a user',
    category: 'task',
    tags: ['assign', 'delegate', 'owner', 'assignee'],
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'ID of the task' },
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        assigneeId: { type: 'string', description: 'User ID to assign' },
      },
      required: ['taskId', 'workspaceId', 'assigneeId'],
    },
  },
  {
    name: 'task_move_to_project',
    description: 'Move a task to a different project',
    category: 'task',
    tags: ['move', 'transfer', 'project', 'reorganize'],
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'ID of the task' },
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        projectId: { type: 'string', description: 'Target project ID' },
      },
      required: ['taskId', 'workspaceId', 'projectId'],
    },
  },
  {
    name: 'task_bucket_set',
    description: 'Set task triage bucket',
    category: 'task',
    tags: ['triage', 'bucket', 'categorize', 'organize'],
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'ID of the task' },
        bucket: { type: 'string', description: 'Bucket name' },
      },
      required: ['taskId', 'bucket'],
    },
  },
  {
    name: 'task_bucket_clear',
    description: 'Clear task triage bucket',
    category: 'task',
    tags: ['triage', 'bucket', 'clear', 'reset'],
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'ID of the task' },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'task_triage_summary',
    description: 'Get task triage summary by bucket',
    category: 'task',
    tags: ['triage', 'summary', 'report', 'statistics'],
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        spaceId: { type: 'string', description: 'Optional space filter' },
      },
      required: ['workspaceId'],
    },
  },

  // ==========================================================================
  // USER MANAGEMENT
  // ==========================================================================
  {
    name: 'user_list',
    description: 'List users in a workspace',
    category: 'user',
    tags: ['list', 'read', 'browse', 'members', 'people'],
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        page: { type: 'number', description: 'Page number for pagination' },
        limit: { type: 'number', description: 'Number of items per page' },
        query: { type: 'string', description: 'Search query' },
      },
      required: ['workspaceId'],
    },
  },
  {
    name: 'user_get',
    description: 'Get a user by ID',
    category: 'user',
    tags: ['read', 'get', 'details', 'profile'],
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'ID of the user' },
      },
      required: ['userId'],
    },
  },
  {
    name: 'user_update',
    description: 'Update user profile',
    category: 'user',
    tags: ['update', 'write', 'edit', 'profile'],
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'ID of the user' },
        name: { type: 'string', description: 'Display name' },
        avatarUrl: { type: 'string', description: 'Avatar URL' },
      },
      required: ['userId'],
    },
  },

  // ==========================================================================
  // COMMENT MANAGEMENT
  // ==========================================================================
  {
    name: 'comment_create',
    description: 'Add a comment to a page',
    category: 'comment',
    tags: ['create', 'write', 'new', 'feedback', 'discussion'],
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'ID of the page' },
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        text: { type: 'string', description: 'Comment text' },
        parentId: { type: 'string', description: 'Parent comment ID for replies' },
      },
      required: ['pageId', 'workspaceId', 'text'],
    },
  },
  {
    name: 'comment_list',
    description: 'List comments on a page',
    category: 'comment',
    tags: ['list', 'read', 'browse', 'discussion'],
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'ID of the page' },
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        page: { type: 'number', description: 'Page number for pagination' },
        limit: { type: 'number', description: 'Number of items per page' },
      },
      required: ['pageId', 'workspaceId'],
    },
  },
  {
    name: 'comment_get',
    description: 'Get a comment by ID',
    category: 'comment',
    tags: ['read', 'get', 'details'],
    inputSchema: {
      type: 'object',
      properties: {
        commentId: { type: 'string', description: 'ID of the comment' },
        workspaceId: { type: 'string', description: 'ID of the workspace' },
      },
      required: ['commentId', 'workspaceId'],
    },
  },
  {
    name: 'comment_update',
    description: 'Edit a comment',
    category: 'comment',
    tags: ['update', 'write', 'edit', 'modify'],
    inputSchema: {
      type: 'object',
      properties: {
        commentId: { type: 'string', description: 'ID of the comment' },
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        text: { type: 'string', description: 'New comment text' },
      },
      required: ['commentId', 'workspaceId', 'text'],
    },
  },
  {
    name: 'comment_delete',
    description: 'Delete a comment',
    category: 'comment',
    tags: ['delete', 'remove', 'destroy'],
    inputSchema: {
      type: 'object',
      properties: {
        commentId: { type: 'string', description: 'ID of the comment' },
        workspaceId: { type: 'string', description: 'ID of the workspace' },
      },
      required: ['commentId', 'workspaceId'],
    },
  },
  {
    name: 'comment_resolve',
    description: 'Resolve or unresolve a comment thread',
    category: 'comment',
    tags: ['resolve', 'close', 'done', 'complete'],
    inputSchema: {
      type: 'object',
      properties: {
        commentId: { type: 'string', description: 'ID of the comment' },
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        resolved: { type: 'boolean', description: 'Resolve status' },
      },
      required: ['commentId', 'workspaceId', 'resolved'],
    },
  },

  // ==========================================================================
  // GROUP MANAGEMENT
  // ==========================================================================
  {
    name: 'group_create',
    description: 'Create a new user group',
    category: 'group',
    tags: ['create', 'write', 'new', 'team'],
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Group name' },
        description: { type: 'string', description: 'Group description' },
        workspaceId: { type: 'string', description: 'ID of the workspace' },
      },
      required: ['name', 'workspaceId'],
    },
  },
  {
    name: 'group_list',
    description: 'List all groups in a workspace',
    category: 'group',
    tags: ['list', 'read', 'browse', 'teams'],
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        page: { type: 'number', description: 'Page number for pagination' },
        limit: { type: 'number', description: 'Number of items per page' },
      },
      required: ['workspaceId'],
    },
  },
  {
    name: 'group_get',
    description: 'Get a group by ID',
    category: 'group',
    tags: ['read', 'get', 'details'],
    inputSchema: {
      type: 'object',
      properties: {
        groupId: { type: 'string', description: 'ID of the group' },
        workspaceId: { type: 'string', description: 'ID of the workspace' },
      },
      required: ['groupId', 'workspaceId'],
    },
  },
  {
    name: 'group_update',
    description: 'Update a group',
    category: 'group',
    tags: ['update', 'write', 'edit', 'modify'],
    inputSchema: {
      type: 'object',
      properties: {
        groupId: { type: 'string', description: 'ID of the group' },
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        name: { type: 'string', description: 'New name' },
        description: { type: 'string', description: 'New description' },
      },
      required: ['groupId', 'workspaceId'],
    },
  },
  {
    name: 'group_delete',
    description: 'Delete a group',
    category: 'group',
    tags: ['delete', 'remove', 'destroy'],
    inputSchema: {
      type: 'object',
      properties: {
        groupId: { type: 'string', description: 'ID of the group' },
        workspaceId: { type: 'string', description: 'ID of the workspace' },
      },
      required: ['groupId', 'workspaceId'],
    },
  },
  {
    name: 'group_addMember',
    description: 'Add a user to a group',
    category: 'group',
    tags: ['add', 'member', 'join', 'invite'],
    inputSchema: {
      type: 'object',
      properties: {
        groupId: { type: 'string', description: 'ID of the group' },
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        userId: { type: 'string', description: 'User ID to add' },
      },
      required: ['groupId', 'workspaceId', 'userId'],
    },
  },
  {
    name: 'group_remove_member',
    description: 'Remove a user from a group',
    category: 'group',
    tags: ['remove', 'member', 'leave', 'kick'],
    inputSchema: {
      type: 'object',
      properties: {
        groupId: { type: 'string', description: 'ID of the group' },
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        userId: { type: 'string', description: 'User ID to remove' },
      },
      required: ['groupId', 'workspaceId', 'userId'],
    },
  },

  // ==========================================================================
  // WORKSPACE MANAGEMENT
  // ==========================================================================
  {
    name: 'workspace_list',
    description: 'List workspaces the user belongs to',
    category: 'workspace',
    tags: ['list', 'read', 'browse'],
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'number', description: 'Page number for pagination' },
        limit: { type: 'number', description: 'Number of items per page' },
      },
    },
  },
  {
    name: 'workspace_get',
    description: 'Get a workspace by ID',
    category: 'workspace',
    tags: ['read', 'get', 'details'],
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'ID of the workspace' },
      },
      required: ['workspaceId'],
    },
  },
  {
    name: 'workspace_create',
    description: 'Create a new workspace',
    category: 'workspace',
    tags: ['create', 'write', 'new'],
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Workspace name' },
        hostname: { type: 'string', description: 'Workspace hostname/subdomain' },
        description: { type: 'string', description: 'Workspace description' },
      },
      required: ['name', 'hostname'],
    },
  },
  {
    name: 'workspace_update',
    description: 'Update workspace settings',
    category: 'workspace',
    tags: ['update', 'write', 'edit', 'settings'],
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        name: { type: 'string', description: 'New name' },
        description: { type: 'string', description: 'New description' },
        settings: { type: 'object', description: 'Settings object' },
      },
      required: ['workspaceId'],
    },
  },
  {
    name: 'workspace_delete',
    description: 'Delete a workspace',
    category: 'workspace',
    tags: ['delete', 'remove', 'destroy'],
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'ID of the workspace' },
      },
      required: ['workspaceId'],
    },
  },
  {
    name: 'workspace_add_member',
    description: 'Add a member to a workspace',
    category: 'workspace',
    tags: ['member', 'add', 'invite'],
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        userId: { type: 'string', description: 'User ID to add' },
        role: { type: 'string', description: 'Role to assign' },
      },
      required: ['workspaceId', 'userId', 'role'],
    },
  },
  {
    name: 'workspace_remove_member',
    description: 'Remove a member from a workspace',
    category: 'workspace',
    tags: ['member', 'remove', 'kick'],
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        userId: { type: 'string', description: 'User ID to remove' },
      },
      required: ['workspaceId', 'userId'],
    },
  },
  {
    name: 'workspace_members',
    description: 'List workspace members',
    category: 'workspace',
    tags: ['members', 'list', 'users'],
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        page: { type: 'number', description: 'Page number for pagination' },
        limit: { type: 'number', description: 'Number of items per page' },
        query: { type: 'string', description: 'Search query' },
      },
      required: ['workspaceId'],
    },
  },
  {
    name: 'workspace_change_member_role',
    description: 'Change a workspace member role',
    category: 'workspace',
    tags: ['member', 'role', 'permissions'],
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        userId: { type: 'string', description: 'User ID' },
        role: { type: 'string', description: 'New role' },
      },
      required: ['workspaceId', 'userId', 'role'],
    },
  },
  {
    name: 'workspace_delete_member',
    description: 'Delete a workspace member',
    category: 'workspace',
    tags: ['member', 'delete', 'remove'],
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        userId: { type: 'string', description: 'User ID to delete' },
      },
      required: ['workspaceId', 'userId'],
    },
  },
  {
    name: 'workspace_invites',
    description: 'List pending workspace invitations',
    category: 'workspace',
    tags: ['invites', 'list', 'pending'],
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        page: { type: 'number', description: 'Page number for pagination' },
        limit: { type: 'number', description: 'Number of items per page' },
      },
      required: ['workspaceId'],
    },
  },
  {
    name: 'workspace_invite_info',
    description: 'Get invitation details',
    category: 'workspace',
    tags: ['invite', 'details', 'info'],
    inputSchema: {
      type: 'object',
      properties: {
        inviteId: { type: 'string', description: 'ID of the invitation' },
      },
      required: ['inviteId'],
    },
  },
  {
    name: 'workspace_invite_create',
    description: 'Create a new workspace invitation',
    category: 'workspace',
    tags: ['invite', 'create', 'send', 'email'],
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        email: { type: 'string', description: 'Email to invite' },
        role: { type: 'string', description: 'Role to assign' },
      },
      required: ['workspaceId', 'email', 'role'],
    },
  },
  {
    name: 'workspace_invite_resend',
    description: 'Resend a workspace invitation',
    category: 'workspace',
    tags: ['invite', 'resend', 'email'],
    inputSchema: {
      type: 'object',
      properties: {
        inviteId: { type: 'string', description: 'ID of the invitation' },
        workspaceId: { type: 'string', description: 'ID of the workspace' },
      },
      required: ['inviteId', 'workspaceId'],
    },
  },
  {
    name: 'workspace_invite_revoke',
    description: 'Revoke a pending invitation',
    category: 'workspace',
    tags: ['invite', 'revoke', 'cancel'],
    inputSchema: {
      type: 'object',
      properties: {
        inviteId: { type: 'string', description: 'ID of the invitation' },
        workspaceId: { type: 'string', description: 'ID of the workspace' },
      },
      required: ['inviteId', 'workspaceId'],
    },
  },
  {
    name: 'workspace_invite_link',
    description: 'Generate a shareable invite link',
    category: 'workspace',
    tags: ['invite', 'link', 'share'],
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        role: { type: 'string', description: 'Role for invited users' },
        expiresIn: { type: 'number', description: 'Expiration time in seconds' },
      },
      required: ['workspaceId', 'role'],
    },
  },
  {
    name: 'workspace_check_hostname',
    description: 'Check if a hostname is available',
    category: 'workspace',
    tags: ['hostname', 'check', 'available', 'subdomain'],
    inputSchema: {
      type: 'object',
      properties: {
        hostname: { type: 'string', description: 'Hostname to check' },
      },
      required: ['hostname'],
    },
  },

  // ==========================================================================
  // ATTACHMENT MANAGEMENT
  // ==========================================================================
  {
    name: 'attachment_list',
    description: 'List attachments on a page',
    category: 'attachment',
    tags: ['list', 'read', 'files', 'media'],
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'ID of the page' },
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        page: { type: 'number', description: 'Page number for pagination' },
        limit: { type: 'number', description: 'Number of items per page' },
      },
      required: ['pageId', 'workspaceId'],
    },
  },
  {
    name: 'attachment_get',
    description: 'Get attachment metadata',
    category: 'attachment',
    tags: ['read', 'get', 'details', 'file'],
    inputSchema: {
      type: 'object',
      properties: {
        attachmentId: { type: 'string', description: 'ID of the attachment' },
        workspaceId: { type: 'string', description: 'ID of the workspace' },
      },
      required: ['attachmentId', 'workspaceId'],
    },
  },
  {
    name: 'attachment_upload',
    description: 'Upload a file attachment',
    category: 'attachment',
    tags: ['upload', 'create', 'file', 'media'],
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'ID of the page' },
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        filename: { type: 'string', description: 'File name' },
        contentType: { type: 'string', description: 'MIME type' },
        data: { type: 'string', description: 'Base64-encoded file data' },
      },
      required: ['pageId', 'workspaceId', 'filename', 'contentType', 'data'],
    },
  },
  {
    name: 'attachment_download',
    description: 'Download an attachment',
    category: 'attachment',
    tags: ['download', 'read', 'file', 'get'],
    inputSchema: {
      type: 'object',
      properties: {
        attachmentId: { type: 'string', description: 'ID of the attachment' },
        workspaceId: { type: 'string', description: 'ID of the workspace' },
      },
      required: ['attachmentId', 'workspaceId'],
    },
  },
  {
    name: 'attachment_delete',
    description: 'Delete an attachment',
    category: 'attachment',
    tags: ['delete', 'remove', 'file'],
    inputSchema: {
      type: 'object',
      properties: {
        attachmentId: { type: 'string', description: 'ID of the attachment' },
        workspaceId: { type: 'string', description: 'ID of the workspace' },
      },
      required: ['attachmentId', 'workspaceId'],
    },
  },

  // ==========================================================================
  // SEARCH
  // ==========================================================================
  {
    name: 'search_query',
    description: 'Full-text search across all content',
    category: 'search',
    tags: ['search', 'find', 'query', 'fulltext'],
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        spaceId: { type: 'string', description: 'Optional space filter' },
        types: {
          type: 'array',
          description: 'Content types to search',
          items: { type: 'string' },
        },
        page: { type: 'number', description: 'Page number for pagination' },
        limit: { type: 'number', description: 'Number of items per page' },
      },
      required: ['query', 'workspaceId'],
    },
  },
  {
    name: 'search_suggest',
    description: 'Get search suggestions/autocomplete',
    category: 'search',
    tags: ['search', 'suggest', 'autocomplete', 'typeahead'],
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Partial search query' },
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        limit: { type: 'number', description: 'Number of suggestions' },
      },
      required: ['query', 'workspaceId'],
    },
  },

  // ==========================================================================
  // IMPORT & EXPORT
  // ==========================================================================
  {
    name: 'import_request_upload',
    description: 'Request an upload URL for import',
    category: 'import_export',
    tags: ['import', 'upload', 'request'],
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        filename: { type: 'string', description: 'File name' },
        contentType: { type: 'string', description: 'MIME type' },
      },
      required: ['workspaceId', 'filename', 'contentType'],
    },
  },
  {
    name: 'import_page',
    description: 'Import a page from external format',
    category: 'import_export',
    tags: ['import', 'page', 'convert'],
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        spaceId: { type: 'string', description: 'ID of the space' },
        format: { type: 'string', description: 'Source format (markdown, html, etc.)' },
        content: { type: 'string', description: 'Content to import' },
        title: { type: 'string', description: 'Page title' },
      },
      required: ['workspaceId', 'spaceId', 'format', 'content'],
    },
  },
  {
    name: 'export_page',
    description: 'Export a page to a specific format',
    category: 'import_export',
    tags: ['export', 'page', 'download', 'convert'],
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'ID of the page' },
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        format: { type: 'string', description: 'Export format (markdown, html, pdf)' },
      },
      required: ['pageId', 'workspaceId', 'format'],
    },
  },
  {
    name: 'export_space',
    description: 'Export an entire space',
    category: 'import_export',
    tags: ['export', 'space', 'download', 'backup'],
    inputSchema: {
      type: 'object',
      properties: {
        spaceId: { type: 'string', description: 'ID of the space' },
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        format: { type: 'string', description: 'Export format' },
        includeAttachments: {
          type: 'boolean',
          description: 'Include attachments in export',
        },
      },
      required: ['spaceId', 'workspaceId', 'format'],
    },
  },

  // ==========================================================================
  // APPROVAL WORKFLOW
  // ==========================================================================
  {
    name: 'approval_request',
    description: 'Request approval for an action',
    category: 'approval',
    tags: ['approval', 'request', 'workflow', 'permission'],
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        action: { type: 'string', description: 'Action requiring approval' },
        resourceType: { type: 'string', description: 'Type of resource' },
        resourceId: { type: 'string', description: 'ID of the resource' },
        message: { type: 'string', description: 'Approval request message' },
      },
      required: ['workspaceId', 'action', 'resourceType', 'resourceId'],
    },
  },
  {
    name: 'approval_confirm',
    description: 'Confirm or reject an approval request',
    category: 'approval',
    tags: ['approval', 'confirm', 'reject', 'workflow'],
    inputSchema: {
      type: 'object',
      properties: {
        approvalId: { type: 'string', description: 'ID of the approval request' },
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        approved: { type: 'boolean', description: 'Approval decision' },
        message: { type: 'string', description: 'Response message' },
      },
      required: ['approvalId', 'workspaceId', 'approved'],
    },
  },

  // ==========================================================================
  // AI GENERATION
  // ==========================================================================
  {
    name: 'ai_generate',
    description: 'Generate content using AI',
    category: 'ai',
    tags: ['ai', 'generate', 'llm', 'content', 'write'],
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Generation prompt' },
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        context: { type: 'string', description: 'Additional context' },
        maxTokens: { type: 'number', description: 'Maximum tokens to generate' },
      },
      required: ['prompt', 'workspaceId'],
    },
  },

  // ==========================================================================
  // AGENT MEMORY
  // ==========================================================================
  {
    name: 'memory_ingest',
    description: 'Store information in agent memory',
    category: 'memory',
    tags: ['memory', 'store', 'save', 'remember'],
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        content: { type: 'string', description: 'Content to store' },
        metadata: { type: 'object', description: 'Additional metadata' },
        tags: { type: 'array', description: 'Tags for categorization', items: { type: 'string' } },
      },
      required: ['workspaceId', 'content'],
    },
  },
  {
    name: 'memory_query',
    description: 'Query agent memory',
    category: 'memory',
    tags: ['memory', 'query', 'recall', 'search'],
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Maximum results' },
        tags: { type: 'array', description: 'Filter by tags', items: { type: 'string' } },
      },
      required: ['workspaceId', 'query'],
    },
  },
  {
    name: 'memory_daily',
    description: 'Get daily memory summary',
    category: 'memory',
    tags: ['memory', 'daily', 'summary', 'digest'],
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        date: { type: 'string', description: 'Date (ISO 8601)' },
      },
      required: ['workspaceId'],
    },
  },
  {
    name: 'memory_days',
    description: 'List days with memory entries',
    category: 'memory',
    tags: ['memory', 'list', 'days', 'calendar'],
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        startDate: { type: 'string', description: 'Start date (ISO 8601)' },
        endDate: { type: 'string', description: 'End date (ISO 8601)' },
      },
      required: ['workspaceId'],
    },
  },

  // ==========================================================================
  // RESEARCH
  // ==========================================================================
  {
    name: 'research_create',
    description: 'Create a new research job',
    category: 'research',
    tags: ['research', 'create', 'job', 'analysis'],
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        topic: { type: 'string', description: 'Research topic' },
        sources: { type: 'array', description: 'Source URLs or IDs', items: { type: 'string' } },
        instructions: { type: 'string', description: 'Research instructions' },
      },
      required: ['workspaceId', 'topic'],
    },
  },
  {
    name: 'research_list',
    description: 'List research jobs',
    category: 'research',
    tags: ['research', 'list', 'jobs'],
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        status: { type: 'string', description: 'Filter by status' },
        page: { type: 'number', description: 'Page number for pagination' },
        limit: { type: 'number', description: 'Number of items per page' },
      },
      required: ['workspaceId'],
    },
  },
  {
    name: 'research_info',
    description: 'Get research job details',
    category: 'research',
    tags: ['research', 'get', 'details', 'status'],
    inputSchema: {
      type: 'object',
      properties: {
        researchId: { type: 'string', description: 'ID of the research job' },
        workspaceId: { type: 'string', description: 'ID of the workspace' },
      },
      required: ['researchId', 'workspaceId'],
    },
  },

  // ==========================================================================
  // RESEARCH INTELLIGENCE (hypothesis, experiment, relationships)
  // ==========================================================================
  {
    name: 'hypothesis_create',
    description: 'Create a hypothesis page with typed metadata. Hypotheses are testable claims that experiments can validate or contradict.',
    category: 'research',
    tags: ['hypothesis', 'create', 'research', 'science', 'claim'],
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Hypothesis title' },
        spaceId: { type: 'string', description: 'Space to create the hypothesis in' },
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        formalStatement: { type: 'string', description: 'Formal, precise testable statement of the hypothesis' },
        content: { type: 'string', description: 'Rich text content/description of the hypothesis' },
        parentPageId: { type: 'string', description: 'Optional parent page ID for nesting' },
        status: { type: 'string', description: 'Status: draft, proposed, testing, validated, invalidated, revised (default: draft)' },
        confidence: { type: 'number', description: 'Confidence level 0-1' },
        domainTags: { type: 'array', items: { type: 'string' }, description: 'Domain/topic tags' },
        predictions: { type: 'array', items: { type: 'string' }, description: 'Testable predictions derived from this hypothesis' },
      },
      required: ['title', 'spaceId', 'workspaceId', 'formalStatement'],
    },
  },
  {
    name: 'hypothesis_update',
    description: 'Update hypothesis status, confidence, and metadata',
    category: 'research',
    tags: ['hypothesis', 'update', 'research', 'status'],
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'ID of the hypothesis page to update' },
        status: { type: 'string', description: 'New status: proposed, testing, validated, refuted, inconclusive, superseded' },
        confidence: { type: 'number', description: 'Updated confidence level 0-1' },
        title: { type: 'string', description: 'Updated title' },
        content: { type: 'string', description: 'Updated content' },
        predictions: { type: 'array', items: { type: 'string' }, description: 'Updated testable predictions' },
      },
      required: ['pageId'],
    },
  },
  {
    name: 'hypothesis_get',
    description: 'Get a hypothesis page with its evidence chain (linked experiments, validations, contradictions)',
    category: 'research',
    tags: ['hypothesis', 'get', 'read', 'evidence'],
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'ID of the hypothesis page' },
      },
      required: ['pageId'],
    },
  },
  {
    name: 'experiment_get',
    description: 'Get an experiment page with its metadata, status, and content',
    category: 'research',
    tags: ['experiment', 'get', 'read', 'research'],
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'ID of the experiment page' },
      },
      required: ['pageId'],
    },
  },
  {
    name: 'experiment_register',
    description: 'Register a new experiment page, optionally linked to a hypothesis. Creates the experiment with planned status and sets up the TESTS_HYPOTHESIS relationship.',
    category: 'research',
    tags: ['experiment', 'create', 'register', 'research', 'test'],
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Experiment title' },
        spaceId: { type: 'string', description: 'Space to create the experiment in' },
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        hypothesisId: { type: 'string', description: 'Optional hypothesis page ID this experiment tests' },
        content: { type: 'string', description: 'Experiment description/protocol' },
        parentPageId: { type: 'string', description: 'Optional parent page ID' },
        method: { type: 'string', description: 'Methodology description' },
        metrics: { type: 'object', description: 'Key metrics to track' },
        status: { type: 'string', description: 'Initial status: planned, running, completed, failed (default: planned)' },
        codeRef: { type: 'string', description: 'Optional reference to code (e.g. git SHA, file path)' },
        domainTags: { type: 'array', items: { type: 'string' }, description: 'Domain/topic tags' },
      },
      required: ['title', 'spaceId', 'workspaceId'],
    },
  },
  {
    name: 'experiment_complete',
    description: 'Complete an experiment with results. Records findings, creates VALIDATES or CONTRADICTS edges to the linked hypothesis based on passed/failed outcome.',
    category: 'research',
    tags: ['experiment', 'complete', 'results', 'evidence', 'findings'],
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'ID of the experiment page' },
        results: { type: 'object', description: 'Experiment results data' },
        passed: { type: 'boolean', description: 'Whether the experiment validated (true) or contradicted (false) the hypothesis' },
        unexpectedObservations: { type: 'array', items: { type: 'string' }, description: 'Any unexpected findings' },
        suggestedFollowUps: { type: 'array', items: { type: 'string' }, description: 'Suggested follow-up experiments' },
      },
      required: ['pageId', 'results'],
    },
  },
  {
    name: 'experiment_update',
    description: 'Update experiment status, methodology, metrics, or content',
    category: 'research',
    tags: ['experiment', 'update', 'status', 'methodology'],
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'ID of the experiment page to update' },
        title: { type: 'string', description: 'Updated title' },
        content: { type: 'string', description: 'Updated content' },
        status: { type: 'string', description: 'New status: planned, running, completed, failed' },
        method: { type: 'string', description: 'Updated methodology' },
        metrics: { type: 'object', description: 'Updated metrics' },
        codeRef: { type: 'string', description: 'Updated code reference' },
      },
      required: ['pageId'],
    },
  },
  {
    name: 'intelligence_query',
    description: 'Query the research intelligence graph to assemble a context bundle — finds related hypotheses, experiments, evidence, and knowledge relevant to a query',
    category: 'research',
    tags: ['intelligence', 'query', 'context', 'knowledge', 'graph', 'evidence'],
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural language query to search the knowledge graph' },
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        spaceId: { type: 'string', description: 'Optional space ID to scope the search' },
        limit: { type: 'number', description: 'Maximum results (default: 10)' },
      },
      required: ['query', 'workspaceId'],
    },
  },
  {
    name: 'relationship_create',
    description: 'Create a typed relationship between two pages in the research graph (e.g. TESTS_HYPOTHESIS, VALIDATES, CONTRADICTS, BUILDS_ON, RELATED_TO)',
    category: 'research',
    tags: ['relationship', 'create', 'graph', 'edge', 'link'],
    inputSchema: {
      type: 'object',
      properties: {
        fromPageId: { type: 'string', description: 'Source page ID' },
        toPageId: { type: 'string', description: 'Target page ID' },
        type: { type: 'string', description: 'Relationship type: TESTS_HYPOTHESIS, VALIDATES, CONTRADICTS, BUILDS_ON, RELATED_TO' },
        metadata: { type: 'object', description: 'Optional metadata for the relationship' },
      },
      required: ['fromPageId', 'toPageId', 'type'],
    },
  },
  {
    name: 'relationship_remove',
    description: 'Remove a relationship between two pages in the research graph',
    category: 'research',
    tags: ['relationship', 'remove', 'delete', 'graph', 'edge'],
    inputSchema: {
      type: 'object',
      properties: {
        fromPageId: { type: 'string', description: 'Source page ID' },
        toPageId: { type: 'string', description: 'Target page ID' },
        type: { type: 'string', description: 'Relationship type to remove' },
      },
      required: ['fromPageId', 'toPageId', 'type'],
    },
  },
  {
    name: 'relationship_list',
    description: 'List relationships for a page in the research graph',
    category: 'research',
    tags: ['relationship', 'list', 'graph', 'edges', 'connections'],
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'Page ID to list relationships for' },
        type: { type: 'string', description: 'Optional filter by relationship type' },
        direction: { type: 'string', description: 'Filter by direction: outgoing, incoming, both (default: both)' },
      },
      required: ['pageId'],
    },
  },

  // ==========================================================================
  // NAVIGATION
  // ==========================================================================
  {
    name: 'ui_navigate',
    description: 'Navigate to a specific UI location',
    category: 'navigation',
    tags: ['navigate', 'ui', 'goto', 'open'],
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'URL path to navigate to' },
        params: { type: 'object', description: 'Navigation parameters' },
      },
      required: ['path'],
    },
  },

  // ==========================================================================
  // SYSTEM
  // ==========================================================================
  {
    name: 'tool_search',
    description:
      'Search for available tools by query, category, or tags. Use this to find relevant tools without loading the entire catalog.',
    category: 'system',
    tags: ['system', 'discovery', 'search', 'tools', 'find'],
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Text search query - matches tool names, descriptions, and tags',
        },
        category: {
          type: 'string',
          description:
            'Filter by category (space, page, project, task, user, comment, group, workspace, attachment, search, import_export, approval, ai, memory, research, navigation, system, context)',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by tags (any match)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (default: 20)',
        },
      },
    },
  },
  {
    name: 'tool_categories',
    description:
      'List all available tool categories with descriptions and tool counts. Use this to understand available tool domains.',
    category: 'system',
    tags: ['system', 'discovery', 'categories', 'tools', 'browse'],
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'system_list_methods',
    description: 'List all available API methods',
    category: 'system',
    tags: ['system', 'api', 'methods', 'discovery'],
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Filter by category' },
      },
    },
  },
  {
    name: 'system_get_method_schema',
    description: 'Get schema for a specific method',
    category: 'system',
    tags: ['system', 'api', 'schema', 'documentation'],
    inputSchema: {
      type: 'object',
      properties: {
        method: { type: 'string', description: 'Method name' },
      },
      required: ['method'],
    },
  },

  // ==========================================================================
  // CONTEXT (Session Key-Value Storage)
  // ==========================================================================
  {
    name: 'context_set',
    description: 'Store a context value for the session',
    category: 'context',
    tags: ['context', 'set', 'store', 'session'],
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Context key' },
        value: { description: 'Value to store' },
        ttlSeconds: { type: 'number', description: 'Time-to-live in seconds' },
      },
      required: ['key', 'value'],
    },
  },
  {
    name: 'context_get',
    description: 'Get a context value by key',
    category: 'context',
    tags: ['context', 'get', 'retrieve', 'session'],
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Context key' },
      },
      required: ['key'],
    },
  },
  {
    name: 'context_delete',
    description: 'Delete a context key',
    category: 'context',
    tags: ['context', 'delete', 'remove', 'session'],
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Context key' },
      },
      required: ['key'],
    },
  },
  {
    name: 'context_list',
    description: 'List context keys',
    category: 'context',
    tags: ['context', 'list', 'keys', 'session'],
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'context_clear',
    description: 'Clear all context values for the session',
    category: 'context',
    tags: ['context', 'clear', 'reset', 'session'],
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  // ==========================================================================
  // CODING SWARM
  // ==========================================================================
  {
    name: 'swarm_execute',
    description: 'Start a coding swarm — spawns a coding agent in an isolated git workspace to write code',
    category: 'coding_swarm',
    tags: ['swarm', 'code', 'agent', 'execute', 'spawn', 'git', 'experiment'],
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        repoUrl: { type: 'string', description: 'Git repository URL to clone' },
        taskDescription: { type: 'string', description: 'What the coding agent should do' },
        experimentId: { type: 'string', description: 'Optional experiment page ID to link results' },
        spaceId: { type: 'string', description: 'Optional space ID' },
        agentType: { type: 'string', description: 'Agent type: claude-code, aider, codex, gemini-cli (default: claude-code)' },
        baseBranch: { type: 'string', description: 'Base branch to fork from (default: main)' },
        taskContext: { type: 'object', description: 'Additional context for the coding task' },
      },
      required: ['workspaceId', 'repoUrl', 'taskDescription'],
    },
  },
  {
    name: 'swarm_status',
    description: 'Get the status of a coding swarm execution',
    category: 'coding_swarm',
    tags: ['swarm', 'status', 'get', 'monitor'],
    inputSchema: {
      type: 'object',
      properties: {
        executionId: { type: 'string', description: 'ID of the swarm execution' },
      },
      required: ['executionId'],
    },
  },
  {
    name: 'swarm_list',
    description: 'List coding swarm executions in a workspace',
    category: 'coding_swarm',
    tags: ['swarm', 'list', 'browse', 'executions'],
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        status: { type: 'string', description: 'Filter by status' },
        experimentId: { type: 'string', description: 'Filter by experiment' },
        limit: { type: 'number', description: 'Max results to return' },
      },
      required: ['workspaceId'],
    },
  },
  {
    name: 'swarm_stop',
    description: 'Stop a running coding swarm execution',
    category: 'coding_swarm',
    tags: ['swarm', 'stop', 'cancel', 'terminate'],
    inputSchema: {
      type: 'object',
      properties: {
        executionId: { type: 'string', description: 'ID of the swarm execution to stop' },
      },
      required: ['executionId'],
    },
  },
  {
    name: 'swarm_logs',
    description: 'Get terminal output logs from a coding swarm execution',
    category: 'coding_swarm',
    tags: ['swarm', 'logs', 'terminal', 'output'],
    inputSchema: {
      type: 'object',
      properties: {
        executionId: { type: 'string', description: 'ID of the swarm execution' },
        limit: { type: 'number', description: 'Max log entries to return (default: 100)' },
      },
      required: ['executionId'],
    },
  },

  // ==========================================================================
  // GITHUB ISSUES
  // ==========================================================================
  {
    name: 'github_issue_create',
    description: 'Create a new GitHub issue in a repository',
    category: 'github_issues',
    tags: ['github', 'issue', 'create', 'bug', 'feature'],
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        repoUrl: { type: 'string', description: 'GitHub repository URL' },
        title: { type: 'string', description: 'Issue title' },
        body: { type: 'string', description: 'Issue body/description' },
        labels: { type: 'array', items: { type: 'string' }, description: 'Labels to apply' },
        assignees: { type: 'array', items: { type: 'string' }, description: 'GitHub usernames to assign' },
      },
      required: ['workspaceId', 'repoUrl', 'title'],
    },
  },
  {
    name: 'github_issue_get',
    description: 'Get a GitHub issue by number',
    category: 'github_issues',
    tags: ['github', 'issue', 'get', 'read', 'details'],
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        repoUrl: { type: 'string', description: 'GitHub repository URL' },
        issueNumber: { type: 'number', description: 'Issue number' },
      },
      required: ['workspaceId', 'repoUrl', 'issueNumber'],
    },
  },
  {
    name: 'github_issue_list',
    description: 'List GitHub issues for a repository',
    category: 'github_issues',
    tags: ['github', 'issue', 'list', 'browse'],
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        repoUrl: { type: 'string', description: 'GitHub repository URL' },
        state: { type: 'string', description: 'Filter by state: open, closed, all (default: open)' },
        labels: { type: 'array', items: { type: 'string' }, description: 'Filter by labels' },
        assignee: { type: 'string', description: 'Filter by assignee username' },
      },
      required: ['workspaceId', 'repoUrl'],
    },
  },
  {
    name: 'github_issue_update',
    description: 'Update a GitHub issue (title, body, labels, assignees, state)',
    category: 'github_issues',
    tags: ['github', 'issue', 'update', 'edit', 'modify'],
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        repoUrl: { type: 'string', description: 'GitHub repository URL' },
        issueNumber: { type: 'number', description: 'Issue number' },
        title: { type: 'string', description: 'New title' },
        body: { type: 'string', description: 'New body' },
        state: { type: 'string', description: 'New state: open or closed' },
        labels: { type: 'array', items: { type: 'string' }, description: 'New labels' },
        assignees: { type: 'array', items: { type: 'string' }, description: 'New assignees' },
      },
      required: ['workspaceId', 'repoUrl', 'issueNumber'],
    },
  },
  {
    name: 'github_issue_comment',
    description: 'Add a comment to a GitHub issue',
    category: 'github_issues',
    tags: ['github', 'issue', 'comment', 'discuss'],
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        repoUrl: { type: 'string', description: 'GitHub repository URL' },
        issueNumber: { type: 'number', description: 'Issue number' },
        body: { type: 'string', description: 'Comment body' },
      },
      required: ['workspaceId', 'repoUrl', 'issueNumber', 'body'],
    },
  },
  {
    name: 'github_issue_close',
    description: 'Close a GitHub issue',
    category: 'github_issues',
    tags: ['github', 'issue', 'close', 'resolve', 'done'],
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'ID of the workspace' },
        repoUrl: { type: 'string', description: 'GitHub repository URL' },
        issueNumber: { type: 'number', description: 'Issue number' },
      },
      required: ['workspaceId', 'repoUrl', 'issueNumber'],
    },
  },
  // --- Team Messaging ---
  {
    name: 'team_send_message',
    description: 'Send a message to another team member by agent ID or role name. Used to assign work, report results, or coordinate. Messages are delivered to the target agent — if the agent is not running, it will be spawned automatically.',
    category: 'team_messaging',
    tags: ['team', 'message', 'send', 'communicate', 'assign', 'coordinate'],
    inputSchema: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          description: 'Target agent ID or role name (e.g. "researcher", "analyst"). Role names resolve to the first available agent of that role.',
        },
        message: {
          type: 'string',
          description: 'The message to send. For task assignments, be specific about what needs to be done and where to save results.',
        },
      },
      required: ['to', 'message'],
    },
  },
  {
    name: 'team_read_messages',
    description: 'Read messages sent to you by other team members. Returns an array of messages with sender info. Use unreadOnly=true to only see new messages.',
    category: 'team_messaging',
    tags: ['team', 'message', 'read', 'inbox', 'check', 'poll'],
    inputSchema: {
      type: 'object',
      properties: {
        unreadOnly: {
          type: 'boolean',
          description: 'If true, only return unread messages. Defaults to false.',
        },
      },
    },
  },
  {
    name: 'team_list_team',
    description: 'List your team members with their roles, statuses, and whether you can message them. Useful for understanding your team structure before assigning work.',
    category: 'team_messaging',
    tags: ['team', 'roster', 'list', 'members', 'status', 'org'],
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

/**
 * Get tools by category
 */
export function getToolsByCategory(category: ToolCategory): MCPToolDefinition[] {
  return TOOL_CATALOG.filter((tool) => tool.category === category);
}

/**
 * Get category info with tool counts
 */
export function getCategoryInfo(): ToolCategoryInfo[] {
  return Object.entries(TOOL_CATEGORIES).map(([id, info]) => ({
    id: id as ToolCategory,
    name: info.name,
    description: info.description,
    toolCount: TOOL_CATALOG.filter((t) => t.category === id).length,
  }));
}
