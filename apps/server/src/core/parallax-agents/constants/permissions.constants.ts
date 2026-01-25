/**
 * Parallax Agent Permission Definitions
 * Defines all available permissions that can be granted to agents
 */

export const AGENT_PERMISSIONS = {
  // Read operations
  'read:pages': 'Read page content',
  'read:tasks': 'Read task details',
  'read:projects': 'Read project information',
  'read:memory': 'Query workspace memory',
  'read:spaces': 'Read space information',
  'read:users': 'Read user profiles',

  // Write operations (higher trust)
  'write:pages': 'Create and edit pages',
  'write:tasks': 'Create and update tasks',
  'write:projects': 'Create and update projects',
  'write:memory': 'Store memories',
  'write:comments': 'Create and edit comments',

  // Advanced operations (highest trust)
  'delete:pages': 'Delete pages',
  'delete:tasks': 'Delete tasks',
  'assign:tasks': 'Assign tasks to others',
  'delegate:agents': 'Delegate work to other agents',
  'execute:research': 'Run research jobs',
} as const;

export type AgentPermission = keyof typeof AGENT_PERMISSIONS;

export const PERMISSION_CATEGORIES = {
  read: ['read:pages', 'read:tasks', 'read:projects', 'read:memory', 'read:spaces', 'read:users'],
  write: ['write:pages', 'write:tasks', 'write:projects', 'write:memory', 'write:comments'],
  advanced: ['delete:pages', 'delete:tasks', 'assign:tasks', 'delegate:agents', 'execute:research'],
} as const;

export const DEFAULT_AGENT_PERMISSIONS: AgentPermission[] = [
  'read:pages',
  'read:tasks',
  'read:projects',
  'read:memory',
];

export const ACTIVITY_RETENTION = {
  // Full detailed records with all metadata
  detailed: 30, // days

  // Aggregated daily summaries (counts, samples)
  summarized: 90, // days

  // Permanently deleted
  purged: 365, // days
} as const;

export const MEMORY_RETENTION = {
  // Full content + embeddings, actively queryable
  active: 90, // days

  // Text only, embeddings removed (saves ~60% space)
  archived: 365, // days

  // Permanently deleted
  purged: 730, // days (2 years)
} as const;

export const AGENT_LIMITS = {
  maxAgentsPerWorkspace: 20,
  maxAgentsPerProject: 10,
  maxActiveAssignmentsPerAgent: 50,
} as const;
