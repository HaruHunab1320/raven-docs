import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docs: [
    'index',
    'getting-started',
    {
      type: 'category',
      label: 'Core Concepts',
      collapsed: false,
      items: [
        'concepts/workspaces',
        'concepts/spaces',
        'concepts/pages',
        'concepts/tasks',
        'concepts/collaboration',
        'concepts/gtd',
        'concepts/goals',
        'concepts/agent',
      ],
    },
    {
      type: 'category',
      label: 'Guides',
      items: [
        'guides/overview',
        'guides/editor',
        'guides/organizing-content',
        'guides/task-management',
        'guides/permissions',
        'guides/integrations',
        'guides/memory',
        'guides/user-profiles',
        'guides/research',
        'guides/daily-workflow',
      ],
    },
    {
      type: 'category',
      label: 'Self-Hosting',
      items: [
        'self-hosting/overview',
        'self-hosting/docker',
        'self-hosting/kubernetes',
        'self-hosting/configuration',
      ],
    },
    'features',
    'changelog',
  ],

  api: [
    'api/overview',
    'api/authentication',
    {
      type: 'category',
      label: 'Endpoints',
      collapsed: false,
      items: [
        'api/endpoints/workspaces',
        'api/endpoints/spaces',
        'api/endpoints/pages',
        'api/endpoints/tasks',
        'api/endpoints/goals',
        'api/endpoints/users',
        'api/endpoints/comments',
        'api/endpoints/attachments',
        'api/endpoints/search',
        'api/endpoints/research',
      ],
    },
    'api/errors',
    'api/rate-limits',
  ],

  mcp: [
    'mcp/overview',
    'mcp/quickstart',
    {
      type: 'category',
      label: 'Tools',
      collapsed: false,
      items: [
        'mcp/tools/tool-search',
        'mcp/tools/spaces',
        'mcp/tools/pages',
        'mcp/tools/tasks',
        'mcp/tools/goals',
        'mcp/tools/memory',
        'mcp/tools/research',
        'mcp/tools/agent',
      ],
    },
    'mcp/authentication',
    'mcp/examples',
  ],
};

export default sidebars;
