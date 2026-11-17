// Tokens to cells: the one place the kit's scales become terminal values.
// Spacing: the web scale is --sp-0..10 (0..64 px on a 4 px base); a cell is about 8 px wide and 16 px tall.
// This module imports nothing, so build-time scripts can import it.
// Colours: one table per theme (dark, light) and tier, from kit/tokens.css (tokens.contrast.term.test.ts holds the exact
// values to that file and every text/ground pair to 4.5:1). The theme follows the terminal's own background (app/run.ts).
// The theme is one module-level value per process, not per mount: a mount sets it before its first frame and app/run.ts
// puts the previous value back when that mount ends, which is right for one mount at a time; two mounts alive at once in
// one process would share (and overwrite) it.
export type Gap = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

/** --sp-N in pixels. */
export const SP_PX: Readonly<Record<Gap, number>> = { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 7: 32, 8: 40, 9: 48, 10: 64 };

/**
 * THE spacing scale (gap, padding, margin), px to cells. The one source: prim's cols()/rows() and the CSS translator
 * (scripts/term/css-translate/units.ts) both read it. Steps are [upper bound exclusive, cells].
 * Horizontal: 3 px or more is at least one column (zero would glue words); 16 px is 2, 24 px is 3; past 40 px one
 * more column per 16 px. Vertical: under 12 px is no row (4 and 8 px between stacked lines would double every list);
 * 12-20 px is one blank row; 24-40 px is 2; then one more per 24 px.
 */
export const SPACE = {
  CELL_W_PX: 8,
  CELL_H_PX: 16,
  COL_STEPS: [[3, 0], [14, 1], [22, 2], [36, 3], [48, 4]] as ReadonlyArray<readonly [number, number]>,
  /** Above the last step: + 1 column per this many px over 40. */
  COL_TAIL_PX: 16,
  ROW_STEPS: [[12, 0], [24, 1], [48, 2]] as ReadonlyArray<readonly [number, number]>,
  /** Above the last step: + 1 row per this many px over 24. */
  ROW_TAIL_PX: 24,
} as const;

/** Spacing px to cells on one axis ('h' columns, 'v' rows). Negative values mirror the positive scale. */
export function spaceCells(px: number, axis: 'h' | 'v'): number {
  if (px < 0) return -spaceCells(-px, axis);
  if (px === 0) return 0;
  const steps = axis === 'h' ? SPACE.COL_STEPS : SPACE.ROW_STEPS;
  for (const [below, cells] of steps) if (px < below) return cells;
  const last = steps[steps.length - 1]!;
  return axis === 'h' ? last[1] + Math.floor((px - 40) / SPACE.COL_TAIL_PX) : last[1] + Math.floor((px - 24) / SPACE.ROW_TAIL_PX);
}
/** Columns between things side by side, for --sp-N. */
export const cols = (g: Gap): number => spaceCells(SP_PX[g], 'h');
/** Rows between things stacked, for --sp-N. */
export const rows = (g: Gap): number => spaceCells(SP_PX[g], 'v');

export type ColourTier = 'truecolor' | 'ansi16' | 'mono';
export type ThemeMode = 'dark' | 'light';
export type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'info';
/**
 * The colour roles. Grounds: `bg` (the page), `side` (the sidebar), `card` (bars, cards and what floats: menus,
 * dialogs, drawers), `raised` (a tag's plate), `selected` (the current row), `hover` (under the part the pointer is on, truecolor only: prim/Hover.ts). Text: `ink`, `muted`, `faint`, `blueText` (links), `accText` (the accent as
 * words or a mark), `ok` / `warn` / `danger`. Fills and what is written on them: `acc` + `accInk` (the one accent: the
 * primary action and the current nav item), `blue` + `blueInk` (the focused control), `danger` + `dangerInk`, `focus` + `bg`
 * (a focused control's words, a field's caret and its selected text). Lines: `line`,
 * `lineStrong`. The Hoody mark: `markPlate` + `markCut`.
 */
export type Colour =
  | 'ink' | 'muted' | 'faint' | 'bg' | 'side' | 'card' | 'raised' | 'line' | 'lineStrong' | 'selected'
  | 'blue' | 'blueText' | 'blueInk' | 'acc' | 'accInk' | 'accText' | 'ok' | 'warn' | 'danger' | 'dangerInk' | 'focus'
  | 'markPlate' | 'markCut' | 'hover';
type Table = Readonly<Record<Colour, string>>;

/** token name in kit/tokens.css -> value: `dark` from its dark block (:root when that block does not restate the
 *  token), `light` from :root. Translucent web values (line, lineStrong, selected) are flattened over `bg` by hand. */
export const TRUECOLOR: Readonly<Record<ThemeMode, Table>> = {
  dark: {
    ink: '#ededed', muted: '#9d9d9d', faint: '#939399', bg: '#111112', side: '#0b0b0c', card: '#18181a', raised: '#202023',
    line: '#2a2a2b', lineStrong: '#4a4a4b', selected: '#222223', blue: '#2f5fff', blueText: '#8da6ff', blueInk: '#ffffff',
    acc: '#eeff22', accInk: '#101010', accText: '#eeff22', ok: '#6bb998', warn: '#eeff22', danger: '#fe7059', dangerInk: '#111111',
    focus: '#8aa4ff', markPlate: '#eeff22', markCut: '#101010',
    // hover: the web's --hx-hover (white 4%) flattened over `bg`; a step above `bg` and `side`, a step under `selected`.
    hover: '#1a1a1b',
  },
  light: {
    ink: '#272727', muted: '#606060', faint: '#555555', bg: '#f0f0f0', side: '#e8e8e8', card: '#edeaea', raised: '#ffffff',
    line: '#dadada', lineStrong: '#a6a6a6', selected: '#e0dddd', blue: '#0741ff', blueText: '#0741ff', blueInk: '#ffffff',
    // The accent is a fill in both themes; as words on a light ground it is its olive shade (yellow on white cannot be read).
    acc: '#eeff22', accInk: '#101010', accText: '#5b6300', ok: '#006144', warn: '#5b6300', danger: '#b71902', dangerInk: '#ffffff',
    focus: '#0741ff', markPlate: '#101010', markCut: '#eeff22',
    // hover: --hx-hover (ink 4%) flattened over `side`, the darker of the two grounds it lies on, so it shows on both.
    hover: '#dfdfdf',
  },
};
/** The CSS custom property a class style names -> the role it is drawn with (jsx/css-table.ts reads this; the test
 *  holds each to tokens.css, with the grounds and the accent besides). */
export const TOKEN_OF: Partial<Record<Colour, string>> = {
  ink: '--hx-ink', muted: '--hx-muted-text', faint: '--hx-faint', bg: '--hx-bg', blue: '--hx-blue', blueText: '--hx-blue-text',
  ok: '--hx-ok', warn: '--hx-warn-text', danger: '--hx-danger-text', focus: '--hx-focus',
};
/**
 * The 16-colour tier: xterm's default palette values, so a terminal maps them onto its own 16 (a 256-colour terminal
 * gets this tier too, tierFromEnv). Dark uses the bright half for words; light uses the normal half, and black where
 * the palette's yellow and green cannot be read on white (the tone's mark still says which it is).
 */
export const ANSI16: Readonly<Record<ThemeMode, Table>> = {
  dark: {
    ink: '#e5e5e5', muted: '#7f7f7f', faint: '#7f7f7f', bg: '#000000', side: '#000000', card: '#000000', raised: '#000000',
    // selected: the palette's black, never its blue. The 16 colours are the user's theme: on many (Solarized, Dracula,
    // gruvbox, VS Code's default) blue is a mid tone on which the dim words of the current row (bright black) cannot be
    // read. The row keeps its ▌ mark and bold name, which is what says "current" on this tier. Being the ground itself,
    // it is no plate for selected text: fields draw that on `focus` (FieldInput, Compose).
    line: '#7f7f7f', lineStrong: '#7f7f7f', selected: '#000000', blue: '#0000ee', blueText: '#5c5cff', blueInk: '#ffffff',
    acc: '#ffff00', accInk: '#000000', accText: '#ffff00', ok: '#00cd00', warn: '#cdcd00', danger: '#ff0000', dangerInk: '#000000',
    // hover is never drawn on this tier (prim/Hover.ts); the ground's own value keeps the table whole.
    focus: '#5c5cff', markPlate: '#ffff00', markCut: '#000000', hover: '#000000',
  },
  light: {
    ink: '#000000', muted: '#7f7f7f', faint: '#7f7f7f', bg: '#ffffff', side: '#ffffff', card: '#e5e5e5', raised: '#ffffff',
    line: '#7f7f7f', lineStrong: '#7f7f7f', selected: '#e5e5e5', blue: '#0000ee', blueText: '#0000ee', blueInk: '#ffffff',
    acc: '#ffff00', accInk: '#000000', accText: '#000000', ok: '#000000', warn: '#000000', danger: '#cd0000', dangerInk: '#ffffff',
    focus: '#0000ee', markPlate: '#000000', markCut: '#ffff00', hover: '#ffffff',
  },
};

let tier: ColourTier = 'truecolor';
export const colourTier = (): ColourTier => tier;
export function setColourTier(t: ColourTier): void { tier = t; }
let mode: ThemeMode = 'dark';
export const themeMode = (): ThemeMode => mode;
/** Set once per mount, before its first frame (app/run.ts): drawn components read the table as they render. */
export function setThemeMode(m: ThemeMode): void { mode = m; }
/**
 * The theme a terminal's environment names, or null when it says nothing: COLORFGBG ("fg;bg", set by rxvt, Konsole and
 * others) with a light background slot: 7 (white) or 15 (bright white), the only slots that are a light ground in
 * every palette. The bright colours 9-14 are not grounds anyone runs a terminal on, so they read as dark. Asked only
 * when the terminal did not answer for itself.
 */
export function themeFromEnv(env: Readonly<Record<string, string | undefined>>): ThemeMode | null {
  const m = /^\d{1,2};(?:\w+;)?(\d{1,2})$/.exec(env.COLORFGBG ?? '');
  if (!m) return null;
  const slot = Number(m[1]);
  return slot === 7 || slot === 15 ? 'light' : 'dark';
}
/**
 * The tier a terminal's environment asks for. Decided here, never left to the engine: it draws truecolor whatever TERM
 * says, and treats NO_COLOR as "use the 256 palette" (measured on OpenTUI 0.8.4).
 */
export function tierFromEnv(env: Readonly<Record<string, string | undefined>>): ColourTier {
  if ((env.NO_COLOR ?? '') !== '' || env.TERM === 'dumb') return 'mono';
  if (env.HUB_TERM_COLOUR === 'truecolor' || env.HUB_TERM_COLOUR === 'ansi16' || env.HUB_TERM_COLOUR === 'mono') return env.HUB_TERM_COLOUR;
  if (env.COLORTERM === 'truecolor' || env.COLORTERM === '24bit' || /-(direct|truecolor)$/.test(env.TERM ?? '')) return 'truecolor';
  return 'ansi16';
}

/** The colour to draw with at the current tier and theme; undefined (the terminal's own colour) in mono. */
export function colour(c: Colour | undefined): string | undefined {
  if (c === undefined || tier === 'mono') return undefined;
  return (tier === 'ansi16' ? ANSI16 : TRUECOLOR)[mode][c];
}
/** The colour of words and marks: the accent fill named as a text colour is drawn in its text shade. */
export const textColour = (c: Colour | undefined): string | undefined => colour(c === 'acc' ? 'accText' : c);
/** The colour of words that name none: `ink` where the Hub paints the ground under them (they must not depend on the
 *  terminal's own text colour there), else undefined: the terminal's own. */
export const plainInk = (): string | undefined => (tier === 'truecolor' ? TRUECOLOR[mode].ink : undefined);
/**
 * A ground the Hub paints itself (the page, the sidebar): only in truecolor, where every pair on it is known. The
 * 16-colour tier keeps the terminal's own background there (its palette is the user's), mono paints nothing.
 */
export const ground = (c: Colour): Colour | undefined => (tier === 'truecolor' ? c : undefined);
export const TONE_COLOUR: Readonly<Record<Tone, Colour>> = { neutral: 'muted', ok: 'ok', warn: 'warn', danger: 'danger', info: 'blueText' };
/** A mark that carries a tone without colour (mono must still read). */
export const TONE_MARK: Readonly<Record<Tone, string>> = { neutral: '·', ok: '✓', warn: '!', danger: '✗', info: 'i' };
