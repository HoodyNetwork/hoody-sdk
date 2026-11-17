// Terminal look presets for the Text and Colours sections: theme JSON per preset (each
// theme's published colours, in the terminal's theme shape) and the font list. A preset writes its JSON; a value
// that matches no preset shows as Custom….
/* Terminal palettes are option values written into the theme JSON, not Hub colours (an exception in exceptions.ts). */

export interface TermTheme {
  readonly foreground: string;
  readonly background: string;
  readonly cursor: string;
  readonly black: string;
  readonly red: string;
  readonly green: string;
  readonly yellow: string;
  readonly blue: string;
  readonly magenta: string;
  readonly cyan: string;
  readonly white: string;
  readonly brightBlack: string;
  readonly brightRed: string;
  readonly brightGreen: string;
  readonly brightYellow: string;
  readonly brightBlue: string;
  readonly brightMagenta: string;
  readonly brightCyan: string;
  readonly brightWhite: string;
}

const theme = (fg: string, bg: string, cursor: string, ansi: readonly string[]): TermTheme => {
  const [black, red, green, yellow, blue, magenta, cyan, white, brightBlack, brightRed, brightGreen, brightYellow, brightBlue, brightMagenta, brightCyan, brightWhite] = ansi as string[];
  return {
    foreground: fg, background: bg, cursor,
    black: black as string, red: red as string, green: green as string, yellow: yellow as string,
    blue: blue as string, magenta: magenta as string, cyan: cyan as string, white: white as string,
    brightBlack: brightBlack as string, brightRed: brightRed as string, brightGreen: brightGreen as string, brightYellow: brightYellow as string,
    brightBlue: brightBlue as string, brightMagenta: brightMagenta as string, brightCyan: brightCyan as string, brightWhite: brightWhite as string,
  };
};

/** Theme presets by id, in menu order (Default = unset comes first in the menu, Custom… last). */
export const TERM_THEMES: Readonly<Record<string, TermTheme>> = {
  hoodyDark: theme('#e6e6e6', '#141414', '#f5c518', ['#1f1f1f', '#f0605a', '#5fcf80', '#f5c518', '#5c9cf5', '#c678dd', '#4fc1c9', '#d0d0d0', '#5c5c5c', '#ff7b72', '#7ee2a0', '#ffd75f', '#7fb4ff', '#d99cf0', '#73d9e0', '#ffffff']),
  hoodyLight: theme('#1f1f1f', '#fafafa', '#b08800', ['#1f1f1f', '#c7322d', '#1f8a4c', '#9a6b00', '#2463c7', '#8a3fb5', '#16808a', '#d9d9d9', '#6b6b6b', '#e0443d', '#27a35c', '#b88200', '#3a7ae0', '#a352d1', '#1c97a3', '#ffffff']),
  solarizedDark: theme('#839496', '#002b36', '#93a1a1', ['#073642', '#dc322f', '#859900', '#b58900', '#268bd2', '#d33682', '#2aa198', '#eee8d5', '#002b36', '#cb4b16', '#586e75', '#657b83', '#839496', '#6c71c4', '#93a1a1', '#fdf6e3']),
  solarizedLight: theme('#657b83', '#fdf6e3', '#586e75', ['#073642', '#dc322f', '#859900', '#b58900', '#268bd2', '#d33682', '#2aa198', '#eee8d5', '#002b36', '#cb4b16', '#586e75', '#657b83', '#839496', '#6c71c4', '#93a1a1', '#fdf6e3']),
  dracula: theme('#f8f8f2', '#282a36', '#f8f8f2', ['#21222c', '#ff5555', '#50fa7b', '#f1fa8c', '#bd93f9', '#ff79c6', '#8be9fd', '#f8f8f2', '#6272a4', '#ff6e6e', '#69ff94', '#ffffa5', '#d6acff', '#ff92df', '#a4ffff', '#ffffff']),
  nord: theme('#d8dee9', '#2e3440', '#d8dee9', ['#3b4252', '#bf616a', '#a3be8c', '#ebcb8b', '#81a1c1', '#b48ead', '#88c0d0', '#e5e9f0', '#4c566a', '#bf616a', '#a3be8c', '#ebcb8b', '#81a1c1', '#b48ead', '#8fbcbb', '#eceff4']),
  gruvboxDark: theme('#ebdbb2', '#282828', '#ebdbb2', ['#282828', '#cc241d', '#98971a', '#d79921', '#458588', '#b16286', '#689d6a', '#a89984', '#928374', '#fb4934', '#b8bb26', '#fabd2f', '#83a598', '#d3869b', '#8ec07c', '#ebdbb2']),
  oneDark: theme('#abb2bf', '#282c34', '#528bff', ['#282c34', '#e06c75', '#98c379', '#e5c07b', '#61afef', '#c678dd', '#56b6c2', '#abb2bf', '#5c6370', '#e06c75', '#98c379', '#e5c07b', '#61afef', '#c678dd', '#56b6c2', '#ffffff']),
};

/** The preset a stored theme equals (same keys and colours), or null. */
export function themePreset(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  for (const [id, t] of Object.entries(TERM_THEMES)) {
    const keys = Object.keys(t);
    if (keys.length === Object.keys(v).length && keys.every((k) => v[k] === t[k as keyof TermTheme])) return id;
  }
  return null;
}

/** Font presets: CSS font lists ending in monospace. Unset means the terminal's own list (Consolas, Liberation Mono, Menlo, Courier, monospace). */
export const TERM_FONTS: Readonly<Record<string, string>> = {
  jetbrains: '"JetBrains Mono", monospace',
  fira: '"Fira Code", monospace',
  cascadia: '"Cascadia Code", monospace',
  menlo: 'Menlo, monospace',
  consolas: 'Consolas, monospace',
  ubuntu: '"Ubuntu Mono", monospace',
};

export function fontPreset(value: unknown): string | null {
  for (const [id, f] of Object.entries(TERM_FONTS)) if (value === f) return id;
  return null;
}

/** What the preview draws with when an option is unset (the terminal's own defaults). */
export const PREVIEW_DEFAULTS = { fontSize: 15, lineHeight: 1, letterSpacing: 0, theme: theme('#ffffff', '#000000', '#ffffff', ['#000000', '#cd3131', '#0dbc79', '#e5e510', '#2472c8', '#bc3fbc', '#11a8cd', '#e5e5e5', '#666666', '#f14c4c', '#23d18b', '#f5f543', '#3b8eea', '#d670d6', '#29b8db', '#e5e5e5']) } as const;

/**
 * The files program's themes as three swatch colours (background, text, accent), from its dark scheme's
 * published tokens (--background-base, --text-base,
 * --text-interactive-base). Display only: the stored value is the theme name.
 */
export const FILES_THEME_SWATCH: Readonly<Record<string, readonly string[]>> = {
  'oc-1': ['#131010', '#b7b1b1', '#89b5ff'],
  aura: ['#15141b', '#edecee', '#b894ff'],
  ayu: ['#0f1419', '#d6dae0', '#57bce3'],
  carbonfox: ['#161616', '#f2f4f8', '#6dacff'],
  catppuccin: ['#1e1e2e', '#cdd6f4', '#a1aae2'],
  dracula: ['#14151f', '#f8f8f2', '#be99f4'],
  gruvbox: ['#282828', '#ebdbb2', '#97b6aa'],
  monokai: ['#23241e', '#f8f8f2', '#bb95ff'],
  nightowl: ['#011627', '#d6deeb', '#88adf9'],
  nord: ['#1f2430', '#e5e9f0', '#86b7c5'],
  onedarkpro: ['#1e222a', '#abb2bf', '#70b5ef'],
  shadesofpurple: ['#1a102b', '#f5f0ff', '#c495f6'],
  solarized: ['#001f27', '#93a1a1', '#9fa6f5'],
  tokyonight: ['#0f111a', '#c0caf5', '#88adfa'],
  vesper: ['#101010', '#ffffff', '#d3a37b'],
};
