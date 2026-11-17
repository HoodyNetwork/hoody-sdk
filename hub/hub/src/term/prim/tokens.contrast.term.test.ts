// The colour roles (prim/tokens.ts), both themes.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | Every text role reads on every ground the Hub paints, 4.5:1 or better, dark and light | 'truecolor <theme>: every text role on every ground' |
// | 2 | What is written on a fill reads on it, 4.5:1 or better | 'truecolor <theme>: words on fills' |
// | 3 | A role moved to a failing pair fails the check (the check is not vacuous) | 'a failing pair is caught' |
// | 4 | The exact roles are the values of kit/tokens.css, each theme from its own block | 'held to tokens.css <theme>' |
// | 5 | 16 colours (xterm's default palette): words reach 3:1 on the terminal ground, the bar and the current row | 'ansi16 <theme>' |
// | 6 | The accent named as a text colour is drawn in its text shade; fills keep the accent | 'accent as words' |
// | 7 | Grounds are painted only in truecolor, and only there do words that name no colour become ink; mono names no colour at all | 'ground', 'mono' |
// | 8 | The theme a terminal's environment names | 'themeFromEnv' |
import { afterEach, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { ANSI16, TOKEN_OF, TRUECOLOR, colour, ground, plainInk, setColourTier, setThemeMode, textColour, themeFromEnv, type Colour, type ThemeMode } from './tokens';

afterEach(() => { setColourTier('truecolor'); setThemeMode('dark'); });

/** Roles drawn as words or marks. */
export const TEXT: readonly Colour[] = ['ink', 'muted', 'faint', 'blueText', 'accText', 'ok', 'warn', 'danger'];
/** Grounds words stand on. */
export const GROUNDS: readonly Colour[] = ['bg', 'side', 'card', 'raised', 'selected', 'hover'];
/** [words, fill]: the primary action, the focused control (both forms; `bg` on `focus` is also a field's selected
 *  text), a solid danger button, inverse words, the mark. */
export const ON_FILL: ReadonlyArray<readonly [Colour, Colour]> = [['accInk', 'acc'], ['blueInk', 'blue'], ['bg', 'focus'], ['dangerInk', 'danger'], ['bg', 'ink'], ['markCut', 'markPlate']];
const THEMES: readonly ThemeMode[] = ['dark', 'light'];

const lin = (v: number): number => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
function luminance(hex: string): number {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(hex);
  if (!m) throw new Error(`not a #rrggbb colour: ${hex}`);
  const [r, g, b] = [m[1]!, m[2]!, m[3]!].map((x) => lin(parseInt(x, 16) / 255)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** WCAG 2 contrast ratio. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
/** Pairs of `table` under `min`, as "words on ground = ratio". */
function failing(table: Readonly<Record<Colour, string>>, pairs: ReadonlyArray<readonly [Colour, Colour]>, min: number): string[] {
  return pairs.filter(([a, g]) => contrast(table[a], table[g]) < min).map(([a, g]) => `${a} on ${g} = ${contrast(table[a], table[g]).toFixed(2)}`);
}
const TEXT_ON_GROUND = TEXT.flatMap((a) => GROUNDS.map((g) => [a, g] as const));

for (const theme of THEMES) {
  test(`truecolor ${theme}: every text role on every ground`, () => {
    expect(failing(TRUECOLOR[theme], TEXT_ON_GROUND, 4.5)).toEqual([]);
  });
  test(`truecolor ${theme}: words on fills`, () => {
    expect(failing(TRUECOLOR[theme], ON_FILL, 4.5)).toEqual([]);
  });
  test(`ansi16 ${theme}`, () => {
    const pairs = TEXT.flatMap((a) => (['bg', 'card', 'selected'] as const).map((g) => [a, g] as const));
    expect(failing(ANSI16[theme], [...pairs, ...ON_FILL], 3)).toEqual([]);
    // The current row's ground is never one of the palette's colours (a theme's blue under dim words): black on dark.
    if (theme === 'dark') expect(ANSI16.dark.selected).toBe(ANSI16.dark.bg);
  });
  test(`held to tokens.css ${theme}`, () => {
    const css = fs.readFileSync(path.join(import.meta.dir, '../../kit/tokens.css'), 'utf8');
    const at = css.indexOf(':root[data-hx-theme="dark"]');
    expect(at).toBeGreaterThan(0);
    const root = css.slice(0, at);
    const dark = css.slice(at, css.indexOf('\n}', at));
    const raw = (block: string, name: string): string | undefined => new RegExp(`${name}:\\s*([^;]+);`).exec(block)?.[1]?.trim();
    const read = (name: string): string | undefined => {
      let v = (theme === 'dark' ? raw(dark, name) : undefined) ?? raw(root, name);
      const ref = /^var\((--[\w-]+)\)$/.exec(v ?? '');
      if (ref) v = read(ref[1]!);
      const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(v ?? '');
      return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase() : v?.toLowerCase();
    };
    // TOKEN_OF (what class styles name), and the grounds and the accent, which tokens.css states exactly too.
    const held: Partial<Record<Colour, string>> = { ...TOKEN_OF, side: '--hx-sidebar', card: '--hx-card', raised: '--hx-raised', acc: '--hx-acc', accInk: '--hx-acc-ink' };
    const off = Object.entries(held).filter(([role, token]) => read(token!) !== TRUECOLOR[theme][role as Colour])
      .map(([role, token]) => `${role}: tokens.ts ${TRUECOLOR[theme][role as Colour]}, ${token} is ${read(token!)} (set tokens.ts TRUECOLOR.${theme}.${role} to it; the pair tests then judge it)`);
    expect(off).toEqual([]);
  });
}

test('a failing pair is caught', () => {
  // The web's muted FILL grey as words on the light page: 3.3:1 there (tokens.css says so), never text.
  const bad = { ...TRUECOLOR.light, muted: '#848484' };
  expect(failing(bad, TEXT_ON_GROUND, 4.5).some((l) => l.startsWith('muted on bg'))).toBe(true);
  // The accent yellow as words on a light ground.
  expect(failing({ ...TRUECOLOR.light, accText: TRUECOLOR.light.acc }, TEXT_ON_GROUND, 4.5).length).toBe(GROUNDS.length);
  // White on the dark theme's danger fill (what a solid danger button drew before `dangerInk`).
  expect(failing({ ...TRUECOLOR.dark, dangerInk: '#ffffff' }, ON_FILL, 4.5)).toEqual(['dangerInk on danger = 2.74']);
});

test('accent as words', () => {
  for (const theme of THEMES) {
    setThemeMode(theme);
    expect(textColour('acc')).toBe(TRUECOLOR[theme].accText);
    expect(colour('acc')).toBe(TRUECOLOR[theme].acc);
    expect(textColour('muted')).toBe(TRUECOLOR[theme].muted);
  }
  expect(textColour(undefined)).toBeUndefined();
});

test('ground', () => {
  expect(ground('bg')).toBe('bg');
  expect(plainInk()).toBe(TRUECOLOR.dark.ink);
  setColourTier('ansi16');
  expect(ground('bg')).toBeUndefined();
  expect(plainInk()).toBeUndefined();
  expect(colour('bg')).toBe(ANSI16.dark.bg);
  setThemeMode('light');
  expect(colour('ink')).toBe(ANSI16.light.ink);
  setColourTier('mono');
  expect(ground('side')).toBeUndefined();
});

test('mono', () => {
  setColourTier('mono');
  for (const theme of THEMES) {
    setThemeMode(theme);
    for (const c of Object.keys(TRUECOLOR.dark) as Colour[]) { expect(colour(c)).toBeUndefined(); expect(textColour(c)).toBeUndefined(); }
  }
});

test('themeFromEnv', () => {
  expect(themeFromEnv({})).toBeNull();
  expect(themeFromEnv({ COLORFGBG: '15;0' })).toBe('dark');
  expect(themeFromEnv({ COLORFGBG: '0;15' })).toBe('light');
  expect(themeFromEnv({ COLORFGBG: '0;default;15' })).toBe('light');
  expect(themeFromEnv({ COLORFGBG: '7;8' })).toBe('dark');
  expect(themeFromEnv({ COLORFGBG: '0;7' })).toBe('light');
  // Only 7 and 15 are light grounds; the bright colours 9-14 are not.
  for (const slot of [8, 9, 11, 14]) expect(themeFromEnv({ COLORFGBG: `0;${slot}` })).toBe('dark');
  expect(themeFromEnv({ COLORFGBG: 'nonsense' })).toBeNull();
  expect(themeFromEnv({ COLORFGBG: '0;' })).toBeNull();
});
