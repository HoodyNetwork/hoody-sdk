// "there is no visible scrollbar". Every scroller takes the kit's thin scrollbar (base.css `*`),
// its thumb in --hx-scroll-thumb: a token of its own, light and dark, that shows on every panel background without
// being loud. It was --hx-line-2 (#1313130d light, black at 5%: about 1.1:1 on the page, so not seen at all).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(join(import.meta.dirname, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const tokens = read('tokens.css');
const base = read('base.css');

/** The custom properties declared in the one block whose selector is exactly `sel`. */
function block(sel: string): Record<string, string> {
  const out: Record<string, string> = {};
  let found = 0;
  for (const m of tokens.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (m[1]!.trim() !== sel) continue;
    found++;
    for (const d of m[2]!.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[d[1]!] = d[2]!.trim();
  }
  expect(found, `a block "${sel}"`).toBeGreaterThan(0);
  return out;
}
const light = block(':root');
const dark = { ...light, ...block(':root[data-hx-theme="dark"]') };

type Rgba = [number, number, number, number];
/** A token's colour in one theme, following var() to the end. */
function colour(theme: Record<string, string>, name: string, depth = 0): Rgba {
  const v = theme[name];
  expect(v, `${name} is declared`).toBeTruthy();
  const ref = /^var\((--[\w-]+)\)$/.exec(v!);
  if (ref) {
    expect(depth).toBeLessThan(8);
    return colour(theme, ref[1]!, depth + 1);
  }
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(v!);
  if (hex) {
    let h = hex[1]!;
    if (h.length === 3) h = [...h].map((c) => c + c).join('');
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
  }
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*(?:[/,]\s*([\d.]+)(%?))?\s*\)$/.exec(v!);
  expect(rgb, `${name}: ${v} is a colour this test reads`).toBeTruthy();
  const a = rgb![4] === undefined ? 1 : Number(rgb![4]) / (rgb![5] ? 100 : 1);
  return [Number(rgb![1]), Number(rgb![2]), Number(rgb![3]), a];
}
const over = ([r, g, b, a]: Rgba, [R, G, B]: Rgba): Rgba => [r * a + R * (1 - a), g * a + G * (1 - a), b * a + B * (1 - a), 1];
const lum = ([r, g, b]: Rgba) => {
  const c = (x: number) => ((x /= 255) <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
};
const ratio = (x: Rgba, y: Rgba) => {
  const [a, b] = [lum(x), lum(y)].sort((p, q) => q - p);
  return (a! + 0.05) / (b! + 0.05);
};

/** The surfaces a scroller sits on (menus and popovers draw on --hx-raised). */
const PANELS = ['--hx-bg', '--hx-card', '--hx-sec-bg', '--hx-raised', '--hx-fill', '--hx-sidebar', '--hx-input-bg'];
/** Seen at a glance: a thumb at least this far from its panel. Not loud: no further than this (a dark bar on light). */
const SEEN = 1.8;
const LOUD = 4;

describe('the scrollbar thumb', () => {
  it('every scroller takes the thin scrollbar with its thumb in --hx-scroll-thumb', () => {
    const all = /(?:^|\})\s*\*\s*\{([^}]*)\}/.exec(base);
    expect(all?.[1]).toMatch(/scrollbar-width:\s*thin/);
    expect(all?.[1]).toMatch(/scrollbar-color:\s*var\(--hx-scroll-thumb\)\s+transparent/);
  });

  it.each([
    ['light', light],
    ['dark', dark],
  ] as const)('%s: the thumb shows on every panel, and is not loud', (_name, theme) => {
    const thumb = colour(theme, '--hx-scroll-thumb');
    for (const p of PANELS) {
      const bg = colour(theme, p);
      const r = ratio(over(thumb, bg), bg);
      expect(r, `${p}: ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(SEEN);
      expect(r, `${p}: ${r.toFixed(2)}:1`).toBeLessThanOrEqual(LOUD);
    }
  });

  it('the dark theme names a thumb of its own (a light one would not show there)', () => {
    expect(block(':root[data-hx-theme="dark"]')['--hx-scroll-thumb']).toBeTruthy();
  });
});
