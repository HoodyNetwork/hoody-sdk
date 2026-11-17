// Vitest: the overlay surface tokens. Bars (head/foot of a panel) and bands (inside a list) are
// palette shades, opaque, and in dark they differ (a band steps down to the card grey); the unavailable tone is a text
// role; the row metrics grow to 44 on a coarse pointer; Drawer bars read the shared bar token. The conformance judges
// (surfaces, ringgap) live in their own files; this file pins the values the design names.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const KIT = path.join(import.meta.dirname, '..');
const tokens = readFileSync(path.join(KIT, 'tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const drawer = readFileSync(path.join(KIT, 'overlays', 'Drawer.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The declarations of every rule whose selector list is exactly `sel` (top level or inside one @media). */
function decls(css: string, sel: string, media?: string): Map<string, string> {
  const out = new Map<string, string>();
  const scope = media ? (css.split(`@media ${media}`)[1] ?? '').slice(0, 4000) : css.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
  for (const m of scope.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if ((m[1] ?? '').trim() !== sel) continue;
    for (const d of (m[2] ?? '').split(';')) {
      const i = d.indexOf(':');
      if (i > 0) out.set(d.slice(0, i).trim(), d.slice(i + 1).trim());
    }
  }
  return out;
}
const LIGHT = decls(tokens, ':root');
const DARK = decls(tokens, ':root[data-hx-theme="dark"]');

/** A token's colour in a theme: dark values override light ones, var() followed to a hex. */
function hex(name: string, dark: boolean, seen = 0): string {
  const v = (dark && DARK.has(name) ? DARK.get(name) : LIGHT.get(name)) ?? '';
  const ref = /^var\((--[\w-]+)\)$/.exec(v);
  if (ref && seen < 10) return hex(ref[1] as string, dark, seen + 1);
  return v.toLowerCase();
}
function lum(h: string): number {
  const full = h.length === 4 ? `#${[...h.slice(1)].map((c) => c + c).join('')}` : h;
  const ch = [1, 3, 5].map((i) => parseInt(full.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (ch[0] as number) + 0.7152 * (ch[1] as number) + 0.0722 * (ch[2] as number);
}
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number]; return (x + 0.05) / (y + 0.05); };

describe('overlay surface tokens', () => {
  const table: Array<[string, string, string]> = [
    ['--bar-bg', 'var(--hx-fill)', 'var(--hx-fill)'],
    ['--pop-band', 'var(--hx-fill)', 'var(--hx-card)'],
    ['--pop-sep', 'var(--hx-line)', 'var(--hx-line-2)'],
    ['--pop-off', 'var(--hx-muted-fill)', 'var(--hx-frame)'],
  ];
  for (const [name, light, dark] of table) {
    it(`${name} is ${light} in light and ${dark} in dark`, () => {
      expect(LIGHT.get(name), `${name} light`).toBe(light);
      // A dark value equal to the light one may be inherited; a different one must be stated under the dark root.
      expect(DARK.get(name) ?? LIGHT.get(name), `${name} dark`).toBe(dark);
    });
  }
  it('every bar and band (and the unavailable tone) is an opaque palette hex in both themes; the rule may be translucent', () => {
    for (const n of ['--bar-bg', '--pop-band', '--pop-off']) for (const d of [false, true]) expect(hex(n, d), `${n} ${d ? 'dark' : 'light'}`).toMatch(/^#[0-9a-f]{3}([0-9a-f]{3})?$/);
    for (const d of [false, true]) expect(hex('--pop-sep', d)).toMatch(/^(#[0-9a-f]{3,8}|rgb\(.+\))$/);
  });
  it('in dark a band differs from a bar (it needs its own tone step between rows)', () => {
    expect(hex('--pop-band', true)).not.toBe(hex('--bar-bg', true));
  });
  it('muted text keeps 4.5:1 on a band and on a bar, light and dark', () => {
    for (const d of [false, true]) for (const bg of ['--pop-band', '--bar-bg']) expect(ratio(hex('--hx-muted', d), hex(bg, d)), `${bg} ${d ? 'dark' : 'light'}`).toBeGreaterThanOrEqual(4.5);
  });
  it('row metrics: 32 fine, 44 coarse; 12 inline padding; 2 between rows', () => {
    expect(LIGHT.get('--pop-row-h')).toBe('32px');
    expect(LIGHT.get('--pop-row-x')).toBe('12px');
    expect(LIGHT.get('--pop-row-gap')).toBe('2px');
    expect(decls(tokens, ':root', '(pointer: coarse)').get('--pop-row-h')).toBe('44px');
  });
  it('Drawer bars read the shared bar token (pixel-equal: --bar-bg is the same --hx-fill)', () => {
    expect(drawer).toMatch(/--drawer-bar-bg:\s*var\(--bar-bg\);/);
  });
});
