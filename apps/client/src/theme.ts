import {
  createTheme,
  CSSVariablesResolver,
  MantineColorsTuple,
} from "@mantine/core";

// Flag to track active theme
let activeThemeId = "default-light";

// Default Raven Docs blue
const blue: MantineColorsTuple = [
  "#e7f3ff",
  "#d0e4ff",
  "#a1c6fa",
  "#6ea6f6",
  "#458bf2",
  "#2b7af1",
  "#0b60d8",
  "#1b72f2",
  "#0056c1",
  "#004aac",
];

// Default Raven Docs red
const red: MantineColorsTuple = [
  "#ffebeb",
  "#fad7d7",
  "#eeadad",
  "#e3807f",
  "#da5a59",
  "#d54241",
  "#d43535",
  "#bc2727",
  "#a82022",
  "#93151b",
];

// Soothing Green
const green: MantineColorsTuple = [
  "#eafaef",
  "#d6f5de",
  "#a8eabc",
  "#76de99",
  "#4fd07e",
  "#38c86d",
  "#2bc365",
  "#1eac57",
  "#12964b",
  "#007f3e",
];

// Vibrant Purple
const purple: MantineColorsTuple = [
  "#f2e6ff",
  "#e3d0ff",
  "#c9a7fa",
  "#ad7df5",
  "#985df1",
  "#8c4ded",
  "#8644eb",
  "#7437d1",
  "#6830b7",
  "#57239e",
];

// Warm Orange
const orange: MantineColorsTuple = [
  "#fff2e6",
  "#ffe2cc",
  "#ffc599",
  "#ffa666",
  "#ff913d",
  "#ff8426",
  "#ff7d1a",
  "#e56600",
  "#cc5a00",
  "#b34e00",
];

// Teal - Refined, softer cyan-green
const teal: MantineColorsTuple = [
  "#f0fdfa",
  "#ccfbf1",
  "#99f6e4",
  "#5eead4",
  "#2dd4bf",
  "#14b8a6",
  "#0d9488",
  "#0f766e",
  "#115e59",
  "#134e4a",
];

// Slate - Neutral, professional gray-blue
const slate: MantineColorsTuple = [
  "#f8fafc",
  "#f1f5f9",
  "#e2e8f0",
  "#cbd5e1",
  "#94a3b8",
  "#64748b",
  "#475569",
  "#334155",
  "#1e293b",
  "#0f172a",
];

// Rose - Soft, warm pink tones
const rose: MantineColorsTuple = [
  "#fff1f2",
  "#ffe4e6",
  "#fecdd3",
  "#fda4af",
  "#fb7185",
  "#f43f5e",
  "#e11d48",
  "#be123c",
  "#9f1239",
  "#881337",
];

// Indigo - Deep, sophisticated blue-purple
const indigo: MantineColorsTuple = [
  "#eef2ff",
  "#e0e7ff",
  "#c7d2fe",
  "#a5b4fc",
  "#818cf8",
  "#6366f1",
  "#4f46e5",
  "#4338ca",
  "#3730a3",
  "#312e81",
];

// Sage - Muted, calming green
const sage: MantineColorsTuple = [
  "#f6f7f6",
  "#e3e7e4",
  "#c8d1ca",
  "#a8b5ab",
  "#889a8c",
  "#6b8070",
  "#566859",
  "#445248",
  "#333d36",
  "#232926",
];

// ============================================
// RAVEN DOCS SIGNATURE PALETTES
// Inspired by ravens - intelligent, collecting shiny things
// ============================================

// Obsidian - Deep iridescent black with purple undertones (raven feathers)
const obsidian: MantineColorsTuple = [
  "#f5f3f7",
  "#e8e4ed",
  "#d0c9da",
  "#b5aac4",
  "#9a8eb0",
  "#7f739c",
  "#665d82",
  "#504969",
  "#3b3650",
  "#262238",
];

// Moonstone - Cool luminous silver-blue (shiny things ravens collect)
const moonstone: MantineColorsTuple = [
  "#f8f9fc",
  "#eef1f7",
  "#dde3ef",
  "#c5cee0",
  "#a8b5cc",
  "#8b9ab8",
  "#6e7fa3",
  "#566689",
  "#404d6b",
  "#2c3650",
];

// Midnight - Deep sophisticated navy (night sky, intelligence)
const midnight: MantineColorsTuple = [
  "#f0f4f8",
  "#d9e2ec",
  "#bcccdc",
  "#9fb3c8",
  "#829ab1",
  "#627d98",
  "#486581",
  "#334e68",
  "#243b53",
  "#102a43",
];

// Carbon - Modern dark with cool steel undertones (sleek, futuristic)
const carbon: MantineColorsTuple = [
  "#f7f8f9",
  "#e8ebee",
  "#d1d6dc",
  "#b4bcc5",
  "#95a0ad",
  "#778594",
  "#5e6b78",
  "#48535e",
  "#343d46",
  "#21272d",
];

// Ivory - Warm premium white (quality paper, sophisticated light)
const ivory: MantineColorsTuple = [
  "#fdfcfb",
  "#faf8f5",
  "#f5f2ed",
  "#ece7df",
  "#ded7cc",
  "#c9c0b3",
  "#a89f93",
  "#827a70",
  "#5c564f",
  "#3a3632",
];

// All available color names
type RavenColorName =
  | "blue"
  | "green"
  | "purple"
  | "orange"
  | "teal"
  | "slate"
  | "rose"
  | "indigo"
  | "sage"
  | "obsidian"
  | "moonstone"
  | "midnight"
  | "carbon"
  | "ivory";

// Theme interface for our custom themes
export interface RavenDocsTheme {
  id: string;
  name: string;
  description: string;
  primaryColor: RavenColorName;
  secondaryColor?: RavenColorName | "red";
  isDark?: boolean;
  fontFamily?: string;
  headingFontFamily?: string;
  bodyBg?: string;
  surfaceBg?: string;
  mutedBg?: string;
  textColor?: string;
  borderColor?: string;
  isSignature?: boolean; // Marks Raven Docs signature themes
}

// Available themes
export const RAVEN_DOCS_THEMES: RavenDocsTheme[] = [
  // ============================================
  // RAVEN DOCS SIGNATURE THEMES
  // Premium themes that embody the brand identity
  // ============================================
  {
    id: "raven-obsidian",
    name: "Obsidian",
    description: "Deep iridescent dark, like raven feathers",
    primaryColor: "obsidian",
    secondaryColor: "moonstone",
    isDark: true,
    isSignature: true,
    bodyBg: "#18161c",
    surfaceBg: "#201e26",
    mutedBg: "#2a2732",
    textColor: "#e8e4ed",
    borderColor: "#3b3650",
  },
  {
    id: "raven-moonstone",
    name: "Moonstone",
    description: "Luminous silver-blue, like treasures ravens collect",
    primaryColor: "moonstone",
    secondaryColor: "obsidian",
    isDark: false,
    isSignature: true,
    bodyBg: "#f8f9fc",
    surfaceBg: "#ffffff",
    mutedBg: "#eef1f7",
    textColor: "#2c3650",
    borderColor: "#dde3ef",
  },
  {
    id: "raven-midnight",
    name: "Midnight",
    description: "Deep navy for focused, intelligent work",
    primaryColor: "midnight",
    secondaryColor: "ivory",
    isDark: true,
    isSignature: true,
    bodyBg: "#102a43",
    surfaceBg: "#1a3a52",
    mutedBg: "#243b53",
    textColor: "#d9e2ec",
    borderColor: "#334e68",
  },
  {
    id: "raven-paper",
    name: "Paper",
    description: "Warm ivory, like premium stationery",
    primaryColor: "ivory",
    secondaryColor: "midnight",
    isDark: false,
    isSignature: true,
    bodyBg: "#faf8f5",
    surfaceBg: "#fdfcfb",
    mutedBg: "#f5f2ed",
    textColor: "#3a3632",
    borderColor: "#ece7df",
  },
  {
    id: "raven-carbon",
    name: "Carbon",
    description: "Sleek modern dark with cool steel tones",
    primaryColor: "carbon",
    secondaryColor: "blue",
    isDark: true,
    isSignature: true,
    bodyBg: "#1a1d21",
    surfaceBg: "#22262b",
    mutedBg: "#2c3138",
    textColor: "#e8ebee",
    borderColor: "#3a4149",
  },
  // ============================================
  // STANDARD THEMES
  // ============================================
  {
    id: "default-light",
    name: "Default Light",
    description: "The default Raven Docs light theme",
    primaryColor: "blue",
    secondaryColor: "red",
    isDark: false,
    bodyBg: "#f7f7f9",
    surfaceBg: "#ffffff",
    mutedBg: "#f1f3f5",
    textColor: "#1f2933",
    borderColor: "#e4e7eb",
  },
  {
    id: "default-dark",
    name: "Default Dark",
    description: "The default Raven Docs dark theme",
    primaryColor: "blue",
    secondaryColor: "red",
    isDark: true,
    bodyBg: "#111315",
    surfaceBg: "#161a1d",
    mutedBg: "#1f2327",
    textColor: "#e5e7eb",
    borderColor: "#2a2f35",
  },
  {
    id: "green-light",
    name: "Emerald Light",
    description: "A calming green theme",
    primaryColor: "green",
    secondaryColor: "orange",
    isDark: false,
    bodyBg: "#f3fbf6",
    surfaceBg: "#ffffff",
    mutedBg: "#e7f5ec",
    textColor: "#1e2b22",
    borderColor: "#d8eadf",
  },
  {
    id: "green-dark",
    name: "Emerald Dark",
    description: "A calming green theme in dark mode",
    primaryColor: "green",
    secondaryColor: "orange",
    isDark: true,
    bodyBg: "#0f1713",
    surfaceBg: "#141c17",
    mutedBg: "#1a231d",
    textColor: "#e3efe7",
    borderColor: "#27332d",
  },
  {
    id: "purple-light",
    name: "Amethyst Light",
    description: "A creative purple theme",
    primaryColor: "purple",
    secondaryColor: "teal",
    isDark: false,
    bodyBg: "#f7f3ff",
    surfaceBg: "#ffffff",
    mutedBg: "#eee6ff",
    textColor: "#2a1f3b",
    borderColor: "#e2d7f6",
  },
  {
    id: "purple-dark",
    name: "Amethyst Dark",
    description: "A creative purple theme in dark mode",
    primaryColor: "purple",
    secondaryColor: "teal",
    isDark: true,
    bodyBg: "#161020",
    surfaceBg: "#1c1627",
    mutedBg: "#231c32",
    textColor: "#efe9ff",
    borderColor: "#31283e",
  },
  {
    id: "orange-light",
    name: "Amber Light",
    description: "A warm, energetic theme",
    primaryColor: "orange",
    secondaryColor: "blue",
    isDark: false,
    bodyBg: "#fff6ed",
    surfaceBg: "#ffffff",
    mutedBg: "#ffe8d1",
    textColor: "#3b2a1a",
    borderColor: "#f3dcc3",
  },
  {
    id: "orange-dark",
    name: "Amber Dark",
    description: "A warm, energetic theme in dark mode",
    primaryColor: "orange",
    secondaryColor: "blue",
    isDark: true,
    bodyBg: "#1b140f",
    surfaceBg: "#221a13",
    mutedBg: "#2a2118",
    textColor: "#f6e5d7",
    borderColor: "#3a2c21",
  },
  {
    id: "teal-light",
    name: "Aqua Light",
    description: "A fresh, cool theme",
    primaryColor: "teal",
    secondaryColor: "purple",
    isDark: false,
    bodyBg: "#effcf9",
    surfaceBg: "#ffffff",
    mutedBg: "#dff7f1",
    textColor: "#1f2f2c",
    borderColor: "#d1eee6",
  },
  {
    id: "teal-dark",
    name: "Aqua Dark",
    description: "A fresh, cool theme in dark mode",
    primaryColor: "teal",
    secondaryColor: "purple",
    isDark: true,
    bodyBg: "#0f1716",
    surfaceBg: "#141d1c",
    mutedBg: "#1b2422",
    textColor: "#e3f1ee",
    borderColor: "#2a3431",
  },
  // Refined professional themes
  {
    id: "slate-light",
    name: "Slate Light",
    description: "Clean, neutral and professional",
    primaryColor: "slate",
    secondaryColor: "blue",
    isDark: false,
    bodyBg: "#f8fafc",
    surfaceBg: "#ffffff",
    mutedBg: "#f1f5f9",
    textColor: "#1e293b",
    borderColor: "#e2e8f0",
  },
  {
    id: "slate-dark",
    name: "Slate Dark",
    description: "Clean, neutral and professional",
    primaryColor: "slate",
    secondaryColor: "blue",
    isDark: true,
    bodyBg: "#0f172a",
    surfaceBg: "#1e293b",
    mutedBg: "#334155",
    textColor: "#f1f5f9",
    borderColor: "#334155",
  },
  {
    id: "rose-light",
    name: "Rose Light",
    description: "Warm and inviting",
    primaryColor: "rose",
    secondaryColor: "slate",
    isDark: false,
    bodyBg: "#fefcfc",
    surfaceBg: "#ffffff",
    mutedBg: "#fff1f2",
    textColor: "#3f3f46",
    borderColor: "#fecdd3",
  },
  {
    id: "rose-dark",
    name: "Rose Dark",
    description: "Warm and inviting",
    primaryColor: "rose",
    secondaryColor: "slate",
    isDark: true,
    bodyBg: "#18181b",
    surfaceBg: "#27272a",
    mutedBg: "#3f3f46",
    textColor: "#fafafa",
    borderColor: "#52525b",
  },
  {
    id: "indigo-light",
    name: "Indigo Light",
    description: "Sophisticated and focused",
    primaryColor: "indigo",
    secondaryColor: "rose",
    isDark: false,
    bodyBg: "#fafafc",
    surfaceBg: "#ffffff",
    mutedBg: "#eef2ff",
    textColor: "#312e81",
    borderColor: "#e0e7ff",
  },
  {
    id: "indigo-dark",
    name: "Indigo Dark",
    description: "Sophisticated and focused",
    primaryColor: "indigo",
    secondaryColor: "rose",
    isDark: true,
    bodyBg: "#0f0f23",
    surfaceBg: "#1a1a2e",
    mutedBg: "#25253d",
    textColor: "#e0e7ff",
    borderColor: "#3730a3",
  },
  {
    id: "sage-light",
    name: "Sage Light",
    description: "Natural and calming",
    primaryColor: "sage",
    secondaryColor: "orange",
    isDark: false,
    bodyBg: "#fafbfa",
    surfaceBg: "#ffffff",
    mutedBg: "#f6f7f6",
    textColor: "#333d36",
    borderColor: "#e3e7e4",
  },
  {
    id: "sage-dark",
    name: "Sage Dark",
    description: "Natural and calming",
    primaryColor: "sage",
    secondaryColor: "orange",
    isDark: true,
    bodyBg: "#1a1d1b",
    surfaceBg: "#232926",
    mutedBg: "#333d36",
    textColor: "#e3e7e4",
    borderColor: "#445248",
  },
];

// Function to get a theme by ID
export const getThemeById = (themeId: string): RavenDocsTheme => {
  const theme = RAVEN_DOCS_THEMES.find((theme) => theme.id === themeId);
  if (!theme) {
    console.warn(`Theme ${themeId} not found, using default theme`);
    return RAVEN_DOCS_THEMES[0];
  }
  return theme;
};

// Function to get the active theme ID
export const getActiveThemeId = (): string => {
  return activeThemeId;
};

// Function to set the active theme ID
export const setActiveThemeId = (themeId: string): void => {
  activeThemeId = themeId;

  // Also update document root properties
  const theme = getThemeById(themeId);
  document.documentElement.setAttribute("data-theme", themeId);
  document.documentElement.setAttribute(
    "data-theme-primary",
    theme.primaryColor
  );
  document.documentElement.setAttribute(
    "data-theme-secondary",
    theme.secondaryColor || "red"
  );
};

// Base theme with all color definitions
export const theme = createTheme({
  primaryColor: "blue",
  colors: {
    blue,
    red,
    green,
    purple,
    orange,
    teal,
    slate,
    rose,
    indigo,
    sage,
    // Raven Docs signature colors
    obsidian,
    moonstone,
    midnight,
    carbon,
    ivory,
  },

  // Increase font sizes for better readability
  fontSizes: {
    xs: "0.9rem", // 14.4px - slightly larger than default
    sm: "1rem", // 16px - readable small text
    md: "1.125rem", // 18px - increased body text
    lg: "1.25rem", // 20px - larger text
    xl: "1.45rem", // 23.2px - larger headlines
  },

  components: {
    Button: {
      defaultProps: {
        variant: "filled",
      },
    },
    ActionIcon: {
      defaultProps: {
        variant: "subtle",
      },
    },
    // Increase text size for Input descriptions and labels
    Input: {
      styles: {
        description: {
          fontSize: "var(--mantine-font-size-sm)", // Larger description text
        },
        label: {
          fontSize: "var(--mantine-font-size-sm)", // Larger labels
        },
      },
    },
    // Increase text size for Tabs
    Tabs: {
      styles: {
        tab: {
          fontSize: "var(--mantine-font-size-sm)", // Larger tab labels
        },
      },
    },
    // Increase text size for Select components
    Select: {
      styles: {
        label: {
          fontSize: "var(--mantine-font-size-sm)",
        },
        description: {
          fontSize: "var(--mantine-font-size-sm)",
        },
      },
    },
    // Make MultiSelect text larger
    MultiSelect: {
      styles: {
        label: {
          fontSize: "var(--mantine-font-size-sm)",
        },
        description: {
          fontSize: "var(--mantine-font-size-sm)",
        },
      },
    },
  },
});

export const mantineCssResolver: CSSVariablesResolver = (theme) => ({
  variables: {
    "--mantine-input-error-size": theme.fontSizes.sm,
    "--raven-docs-primary-color": `var(--mantine-color-${theme.primaryColor}-filled)`,
    "--raven-docs-primary-hover": `var(--mantine-color-${theme.primaryColor}-filled-hover)`,
    "--raven-docs-primary-light": `var(--mantine-color-${theme.primaryColor}-light)`,
    "--raven-docs-primary-light-hover": `var(--mantine-color-${theme.primaryColor}-light-hover)`,
    // Add new text size variables
    "--raven-docs-text-size-small": theme.fontSizes.sm,
    "--raven-docs-text-size-description": theme.fontSizes.sm,
  },
  light: {
    "[data-theme='project89-tron'] .mantine-Button-root": {
      border: "none",
      boxShadow: "none",
    },
    // Global overrides for specific button classes to ensure no border/shadow
    ".add-cover-button, .task-drawer-component .mantine-Button-root.add-cover-button":
      {
        border: "none !important",
        boxShadow: "none !important",
        "--button-bd": "none !important",
        "--button-shadow": "none !important",
        backgroundColor: "transparent !important",
        color: `var(--mantine-color-${theme.primaryColor}-6) !important`,
      },
    // Emoji picker styling
    ".task-drawer-component .mantine-ActionIcon-root[aria-label='Add emoji']": {
      color: `var(--mantine-color-${theme.primaryColor}-6) !important`,
    },
    ".task-drawer-component .mantine-ActionIcon-root svg": {
      color: `var(--mantine-color-${theme.primaryColor}-6) !important`,
    },
    ".task-emoji-picker .mantine-ActionIcon-root": {
      color: `var(--mantine-color-${theme.primaryColor}-6) !important`,
    },
    ".task-emoji-picker .mantine-ActionIcon-root svg": {
      color: `var(--mantine-color-${theme.primaryColor}-6) !important`,
    },
    // Comment section styling
    ".task-drawer-component .mantine-Paper-root": {
      border: "none !important",
      boxShadow: "none !important",
      backgroundColor: "transparent !important",
    },
    ".task-drawer-component .mantine-TextInput-wrapper, .task-drawer-component .mantine-TextInput-input":
      {
        backgroundColor: "transparent !important",
        border: "none !important",
        boxShadow: "none !important",
      },
  },
  dark: {
    "[data-theme='project89-tron'] .mantine-Button-root": {
      border: "none",
      boxShadow: "none",
    },
    // Global overrides for specific button classes to ensure no border/shadow
    ".add-cover-button, .task-drawer-component .mantine-Button-root.add-cover-button":
      {
        border: "none !important",
        boxShadow: "none !important",
        "--button-bd": "none !important",
        "--button-shadow": "none !important",
        backgroundColor: "transparent !important",
        color: `var(--mantine-color-${theme.primaryColor}-6) !important`,
      },
    // Emoji picker styling
    ".task-drawer-component .mantine-ActionIcon-root[aria-label='Add emoji']": {
      color: `var(--mantine-color-${theme.primaryColor}-6) !important`,
    },
    ".task-drawer-component .mantine-ActionIcon-root svg": {
      color: `var(--mantine-color-${theme.primaryColor}-6) !important`,
    },
    ".task-emoji-picker .mantine-ActionIcon-root": {
      color: `var(--mantine-color-${theme.primaryColor}-6) !important`,
    },
    ".task-emoji-picker .mantine-ActionIcon-root svg": {
      color: `var(--mantine-color-${theme.primaryColor}-6) !important`,
    },
    // Comment section styling
    ".task-drawer-component .mantine-Paper-root": {
      border: "none !important",
      boxShadow: "none !important",
      backgroundColor: "transparent !important",
    },
    ".task-drawer-component .mantine-TextInput-wrapper, .task-drawer-component .mantine-TextInput-input":
      {
        backgroundColor: "transparent !important",
        border: "none !important",
        boxShadow: "none !important",
      },
  },
});
