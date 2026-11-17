// The dark values for the Verdict plate and the Track, read from tokens.css. The Verdict `state` plate's
// text tints reach 4.5:1 on the plate in light and dark, the good tint under every highlight colour; the dark plate's
// edge, drawn over the plate, reaches 4:1 (a margin over 3:1) beside every dark surface a drawer or dialog uses; a Track node's number reaches 4.5:1 on its node
// (the done node's tick, a graphic, 3:1); and the Track draws no accent, so the yellow-halo question of the designs
// (a now node against --hx-acc-soft in dark) does not arise.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(import.meta.dirname, 'tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function block(selector: string): Map<string, string> {
  const at = css.indexOf(`${selector} {`);
  if (at < 0) throw new Error(`no block ${selector}`);
  const body = css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at));
  const out = new Map<string, string>();
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out.set(m[1]!, m[2]!.trim());
  return out;
}

const light = block(':root');
const dark = new Map([...light, ...block(':root[data-hx-theme="dark"]')]);
const highlights = ['mint', 'sky', 'coral', 'lilac', 'chalk'].map((h) => block(`:root[data-hx-hl="${h}"]`));

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
  if (m) {
    const a = m[4] === undefined ? 1 : Number(m[4]) / (m[5] ? 100 : 1);
    return [Number(m[1]), Number(m[2]), Number(m[3]), a];
  }
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
/** A token over a ground, both resolved in the theme (a translucent token composited over it). */
const on = (theme: Map<string, string>, fg: string, bg: string) => {
  const ground = colour(theme, bg);
  return ratio(over(colour(theme, fg), ground), ground);
};

const themes = [['light', light], ['dark', dark]] as const;
const TEXT = ['--hx-verdict-ink', '--hx-verdict-muted', '--hx-verdict-next', '--hx-verdict-warn', '--hx-verdict-danger', '--hx-verdict-good'];

describe('the Verdict state plate', () => {
  it.each(themes)('%s: every --hx-verdict-* text tint reaches 4.5:1 on the plate', (_, theme) => {
    for (const t of TEXT) expect(on(theme, t, '--hx-verdict-bg'), t).toBeGreaterThanOrEqual(4.5);
  });

  it.each(themes)('%s: the good tint (the accent) reaches 4.5:1 on the plate under every highlight colour', (_, theme) => {
    for (const hl of highlights) {
      const t = new Map([...theme, ...hl]);
      expect(on(t, '--hx-verdict-good', '--hx-verdict-bg')).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('dark: the plate is the deepest surface; its edge, drawn over the plate, reaches 4:1 beside every surface a drawer, dialog or popover uses', () => {
    const plate = colour(dark, '--hx-verdict-bg');
    // The CutFrame stroke sits on the plate's own pixels: composite it there, then compare with the ground outside.
    const edge = over(colour(dark, '--hx-verdict-edge'), plate);
    for (const g of ['--hx-bg', '--hx-card', '--hx-raised', '--hx-fill']) {
      expect(lum(plate), g).toBeLessThan(lum(colour(dark, g)));
      expect(ratio(edge, colour(dark, g)), g).toBeGreaterThanOrEqual(4);
    }
  });

  it('light: the edge is the plate itself (the ink plate needs no drawn line on a light drawer)', () => {
    expect(colour(light, '--hx-verdict-edge')).toEqual(colour(light, '--hx-verdict-bg'));
  });
});

describe('Track nodes', () => {
  const track = readFileSync(join(import.meta.dirname, 'data/Track.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = (sel: string) => {
    const at = track.indexOf(`${sel} {`);
    if (at < 0) throw new Error(`no rule ${sel}`);
    const body = track.slice(track.indexOf('{', at) + 1, track.indexOf('}', at));
    const get = (p: string) => /var\((--[\w-]+)\)/.exec(new RegExp(`(?:^|;|\\s)${p}\\s*:\\s*([^;]+);`).exec(body)?.[1] ?? '')?.[1];
    return { fg: get('color'), bg: get('background') };
  };

  it.each(themes)('%s: a node\'s number reaches 4.5:1 on its node; the done tick 3:1', (_, theme) => {
    const base = rule('.node');
    const pairs: [string, number, string | undefined, string | undefined][] = [
      ['.node', 4.5, base.fg, base.bg],
      ['.state_now .node', 4.5, rule('.state_now .node').fg, base.bg],
      ['.tone_warn .node', 4.5, rule('.tone_warn .node').fg, rule('.tone_warn .node').bg],
      ['.tone_danger .node', 4.5, rule('.tone_danger .node').fg, rule('.tone_danger .node').bg],
      ['.state_done .node', 3, rule('.state_done .node').fg, rule('.state_done .node').bg],
    ];
    for (const [sel, min, fg, bg] of pairs) {
      expect(fg && bg, sel).toBeTruthy();
      expect(on(theme, fg!, bg!), sel).toBeGreaterThanOrEqual(min);
    }
  });

  it('the Track draws no accent: no now-node halo to weigh against --hx-acc-soft in dark', () => {
    expect(track).not.toMatch(/--hx-acc/);
  });
});
