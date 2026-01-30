import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Raven Docs',
  tagline: 'AI-native knowledge management for teams',
  favicon: 'img/favicon-for-darkmode.png',

  headTags: [
    {
      tagName: 'link',
      attributes: {
        rel: 'icon',
        href: '/img/favicon-for-lightmode.png',
        media: '(prefers-color-scheme: light)',
      },
    },
    {
      tagName: 'link',
      attributes: {
        rel: 'icon',
        href: '/img/favicon-for-darkmode.png',
        media: '(prefers-color-scheme: dark)',
      },
    },
  ],

  future: {
    v4: true,
  },

  url: 'https://docs.ravendocs.ca',
  baseUrl: '/',

  organizationName: 'raven-docs',
  projectName: 'raven-docs',

  onBrokenLinks: 'throw',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  markdown: {
    mermaid: true,
  },

  themes: ['@docusaurus/theme-mermaid'],

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: '/',
          editUrl: 'https://github.com/HaruHunab1320/raven-docs/tree/main/apps/docs/',
          showLastUpdateTime: true,
          showLastUpdateAuthor: true,
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/social-card.png',

    announcementBar: {
      id: 'alpha',
      content:
        'Raven Docs is currently in alpha — expect breaking changes. <a href="/changelog">View changelog</a>',
      isCloseable: true,
    },

    navbar: {
      title: '',
      logo: {
        alt: 'Raven Docs',
        src: 'img/light-mode-logo.png',
        srcDark: 'img/dark-mode-logo.png',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docs',
          position: 'left',
          label: 'Documentation',
        },
        {
          type: 'docSidebar',
          sidebarId: 'api',
          position: 'left',
          label: 'API Reference',
        },
        {
          type: 'docSidebar',
          sidebarId: 'mcp',
          position: 'left',
          label: 'MCP Server',
        },
        {
          href: 'https://github.com/HaruHunab1320/raven-docs',
          position: 'right',
          className: 'header-github-link',
          'aria-label': 'GitHub repository',
        },
      ],
    },

    footer: {
      style: 'dark',
      links: [
        {
          title: 'Documentation',
          items: [
            { label: 'Getting Started', to: '/getting-started' },
            { label: 'Guides', to: '/guides/overview' },
            { label: 'API Reference', to: '/api/overview' },
            { label: 'MCP Server', to: '/mcp/overview' },
          ],
        },
        {
          title: 'Product',
          items: [
            { label: 'Features', to: '/features' },
            { label: 'Changelog', to: '/changelog' },
            { label: 'Self-Hosting', to: '/self-hosting/overview' },
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'X (@ParallaxPilgrim)',
              href: 'https://x.com/ParallaxPilgrim',
            },
            {
              label: 'GitHub',
              href: 'https://github.com/HaruHunab1320/raven-docs',
            },
          ],
        },
        {
          title: 'Legal',
          items: [
            { label: 'License (AGPL-3.0)', href: 'https://github.com/HaruHunab1320/raven-docs/blob/main/LICENSE' },
            { label: 'Docmost', href: 'https://docmost.com' },
          ],
        },
      ],
      copyright: `Copyright ${new Date().getFullYear()} Raven Docs. Built on <a href="https://docmost.com" target="_blank" rel="noopener noreferrer">Docmost</a>.`,
    },

    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: [
        'bash',
        'json',
        'typescript',
        'python',
        'yaml',
        'toml',
      ],
    },

    colorMode: {
      defaultMode: 'light',
      disableSwitch: false,
      respectPrefersColorScheme: true,
    },

    docs: {
      sidebar: {
        hideable: true,
        autoCollapseCategories: true,
      },
    },

    tableOfContents: {
      minHeadingLevel: 2,
      maxHeadingLevel: 4,
    },

    mermaid: {
      theme: { light: 'neutral', dark: 'dark' },
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
