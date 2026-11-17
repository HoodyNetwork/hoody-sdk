// The rail tiles' mono caps and dashed edge, and the composer plate's tile strip: the values land as
// tokens with a light and a dark value, read from tokens.css, and the parts draw with them. The rail tiles' mono caps
// reach 4.5:1 on the rail and the current tile in both themes; the dashed edge is the section rail's token, the one
// hub/no-dashed allows. The plate itself (the composer's frame and Send) belongs to the kit Composer.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '');
const css = strip(readFileSync(join(import.meta.dirname, 'tokens.css'), 'utf8'));
const rail = strip(readFileSync(join(import.meta.dirname, 'layouts', 'RailPane.module.css'), 'utf8'));
const start = strip(readFileSync(join(import.meta.dirname, '..', 'pages', 'ai', 'new', 'NewChat.module.css'), 'utf8'));

function block(selector: string): Map<string, string> {
  const at = css.indexOf(`${selector} {`);
  if (at < 0) throw new Error(`no block ${selector}`);
  const body = css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at));
  const out = new Map<string, string>();
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out.set(m[1]!, m[2]!.trim());
  return out;
}
const lightOwn = block(':root');
const darkOwn = block(':root[data-hx-theme="dark"]');
const light = lightOwn;
const dark = new Map([...light, ...darkOwn]);

type RGBA = [number, number, number, number];
function resolve(theme: Map<string, string>, value: string, depth = 0): string {
  if (depth > 20) throw new Error(`token loop at ${value}`);
  const m = /^var\((--[\w-]+)\)$/.exec(value.trim());
  if (!m) return value.trim();
  const v = theme.get(m[1]!);
  if (v === undefined) throw new Error(`unknown token ${m[1]}`);
  return resolve(theme, v, depth + 1);
}
function colour(theme: Map<string, string>, name: string): RGBA {
  const v = resolve(theme, `var(${name})`);
  let m = /^#([0-9a-f]{3,8})$/i.exec(v);
  if (m) {
    let h = m[1]!;
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
  }
  m = /^rgb\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)(%?))?\s*\)$/.exec(v);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4]) / (m[5] ? 100 : 1)];
  throw new Error(`${name}: not a plain colour: ${v}`);
}
const over = ([r, g, b, a]: RGBA, [R, G, B]: RGBA): RGBA => [r * a + R * (1 - a), g * a + G * (1 - a), b * a + B * (1 - a), 1];
const lum = ([r, g, b]: RGBA) => {
  const f = (v: number) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a: RGBA, b: RGBA) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
};
/** Text `fg` over `bg`, `bg` over the theme's page background. */
function contrast(theme: Map<string, string>, fg: string, bg: string): number {
  const base = over(colour(theme, bg), colour(theme, '--hx-bg'));
  return ratio(over(colour(theme, fg), base), base);
}
function rule(src: string, selector: string): string {
  const at = src.indexOf(`${selector} {`);
  if (at < 0) throw new Error(`no rule ${selector}`);
  return src.slice(src.indexOf('{', at) + 1, src.indexOf('}', at));
}

const NEW = ['--hx-rail-tile-text', '--hx-rail-tile-now-bg', '--hx-rail-tile-now-line', '--hx-start-cell-line'];

describe('rail tile and tile strip tokens', () => {
  it.each(NEW)('%s has a light value and its own dark value', (name) => {
    expect(lightOwn.has(name)).toBe(true);
    expect(darkOwn.has(name)).toBe(true);
  });

  it('dark: the strip dividers are never fainter than the panel line and reach 3:1 on the cell fill', () => {
    const line = contrast(dark, '--hx-start-cell-line', '--hx-card');
    expect(line).toBeGreaterThanOrEqual(contrast(dark, '--hx-panel-line', '--hx-card'));
    expect(line).toBeGreaterThanOrEqual(3);
  });

  it.each([['light', light], ['dark', dark]] as const)('%s: tile caps reach 4.5:1 on the rail, the current tile and its hover', (_n, theme) => {
    expect(contrast(theme, '--hx-rail-tile-text', '--hx-card')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(theme, '--hx-ink', '--hx-rail-tile-now-bg')).toBeGreaterThanOrEqual(4.5);
  });

});

describe('rail tiles (kit RailNav)', () => {
  it('a tile: dashed section-rail edge, mono caps at the label size, square', () => {
    const r = rule(rail, '.navItem');
    expect(r).toMatch(/border:\s*var\(--bw\)\s+dashed\s+var\(--hx-section-rail\)/);
    expect(r).toMatch(/font:\s*var\(--t-label\)/);
    expect(r).toMatch(/text-transform:\s*uppercase/);
    expect(r).toMatch(/color:\s*var\(--hx-rail-tile-text\)/);
    expect(r).not.toMatch(/border-radius/);
  });

  it('the current tile: a solid frame on its own fill', () => {
    const r = rule(rail, '.navItem[aria-current]');
    expect(r).toMatch(/border:\s*var\(--bw\)\s+solid\s+var\(--hx-rail-tile-now-line\)/);
    expect(r).toMatch(/background:\s*var\(--hx-rail-tile-now-bg\)/);
  });
});

describe('tile strip', () => {
  it('the strip: four cells at least 132 px tall in one frame, lines between cells, two then one column when narrow', () => {
    const r = rule(start, '.suggestions');
    expect(r).toMatch(/grid-template-columns:\s*repeat\(4,/);
    expect(r).toMatch(/grid-auto-rows:\s*minmax\(132px,/);
    expect(r).toMatch(/border:\s*var\(--bw\)\s+solid\s+var\(--hx-panel-line\)/);
    // The lines between cells are each cell's own border, widths switched on per position.
    expect(rule(start, '.suggestions > li')).toMatch(/border:\s*0\s+solid\s+var\(--hx-start-cell-line\)/);
    expect(start).toMatch(/width < 760px\)\s*\{\s*\.suggestions\s*\{\s*grid-template-columns:\s*repeat\(2,/);
    expect(start).toMatch(/width < 600px\)\s*\{\s*\.suggestions\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\)/);
    const cell = rule(start, '.sug');
    expect(cell).toMatch(/flex-direction:\s*column/);
    expect(cell).toMatch(/border:\s*0/);
  });
});
