// The kit Switch ("Square grey, yellow on") is a square 34 x 20 track, grey (#dedede) when off
// and the yellow (#eeff22, the accent) with a #1c1c1c frame when on, with a square white 14 px thumb framed in the same
// line. Read from source: the Switch rules take the --hx-switch-* tokens and square corners, the tokens hold the given
// values (the off line is #7a7a7a, the one deviation from the given #9c9c9c, for 3:1), and that line reaches 3:1 on every
// surface a switch sits on and on its own track, in both themes. The browser spec (switch.colors.spec.ts) reads the
// computed result; this file pins the source so a stray value cannot pass by layout.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '..', '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const CSS = read('kit/forms/fields.module.css');
const TOKENS = read('kit/tokens.css');

/** The declarations of every top-level rule whose selector is exactly `sel`, joined in source order. */
function decls(css: string, sel: string): Record<string, string> {
  const out: Record<string, string> = {};
  let depth = 0;
  let start = 0;
  let found = false;
  for (let i = 0; i < css.length; i++) {
    if (css[i] === '{') {
      if (depth === 0 && css.slice(start, i).trim() === sel) {
        found = true;
        for (const d of css.slice(i + 1, css.indexOf('}', i)).split(';')) {
          const k = d.indexOf(':');
          if (k > 0) out[d.slice(0, k).trim()] = d.slice(k + 1).trim().replace(/\s+/g, ' ');
        }
      }
      depth++;
    } else if (css[i] === '}') {
      depth--;
      if (depth === 0) start = i + 1;
    }
  }
  if (!found) throw new Error(`no rule ${sel}`);
  return out;
}

/** A theme block's custom properties (`:root {` or `:root[data-hx-theme="dark"] {`), last value wins. */
function block(head: string): Record<string, string> {
  const at = TOKENS.indexOf(`${head} {`);
  if (at < 0) throw new Error(`no block ${head}`);
  const body = TOKENS.slice(at + head.length + 2, TOKENS.indexOf('\n}', at));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]!] = m[2]!.trim();
  return out;
}
const LIGHT = block(':root');
const DARK = { ...LIGHT, ...block(':root[data-hx-theme="dark"]') };

/** A token's value as a colour, var() references followed in the theme. */
function colour(theme: Record<string, string>, v: string): string {
  for (let i = 0; i < 8; i++) {
    const m = /^var\((--[\w-]+)\)$/.exec(v.trim());
    if (!m) return v.trim();
    v = theme[m[1]!] ?? '';
  }
  throw new Error(`var loop at ${v}`);
}
function rgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) throw new Error(`not an opaque hex colour: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}
function ratio(a: string, b: string): number {
  const lum = (h: string) => {
    const [r, g, bl] = rgb(h).map((v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4)) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

describe('switch: the kit rules', () => {
  it('the off track is square, 34 x 20, the grey framed in the switch line', () => {
    const t = decls(CSS, '.track');
    expect(t).toMatchObject({ width: 'var(--switch-w)', height: 'var(--switch-h)', 'box-sizing': 'border-box', 'border-radius': '0', background: 'var(--hx-switch-off)', border: 'var(--bw) solid var(--hx-switch-line)' });
    expect(LIGHT['--switch-w']).toBe('34px');
    expect(LIGHT['--switch-h'], 'the height as a token, the same 20 px').toBe('20px');
  });

  it('the thumb is square, 14 px, white, framed in the same line, 2 px in from the start', () => {
    expect(LIGHT['--switch-thumb'], 'the thumb as a token, the same 14 px').toBe('14px');
    expect(decls(CSS, '.thumb')).toMatchObject({ width: 'var(--switch-thumb)', height: 'var(--switch-thumb)', 'box-sizing': 'border-box', 'border-radius': '0', background: 'var(--hx-switch-thumb)', border: 'var(--bw) solid var(--hx-switch-line)', 'inset-block-start': '2px', 'inset-inline-start': '2px' });
  });

  it('on: the yellow track and both frames in the on line; the thumb slides 14 px (to 16 px), mirrored in RTL', () => {
    expect(decls(CSS, '.switch[data-selected] .track')).toEqual({ 'border-color': 'var(--hx-switch-on-line)', background: 'var(--hx-switch-on)' });
    expect(decls(CSS, '.switch[data-selected] .thumb')).toEqual({ 'border-color': 'var(--hx-switch-on-line)', transform: 'translateX(calc(var(--switch-w) - var(--switch-h)))' });
    expect(decls(CSS, ':dir(rtl) .switch[data-selected] .thumb')).toEqual({ transform: 'translateX(calc(var(--switch-h) - var(--switch-w)))' });
    // The travel is the track's width less its height: 34 - 20 = 14 px.
    expect(Number.parseFloat(LIGHT['--switch-w']!) - Number.parseFloat(LIGHT['--switch-h']!)).toBe(14);
  });

  it('the old red off state and the round shapes are gone', () => {
    for (const sel of ['.track', '.thumb', '.switch[data-selected] .track', '.switch[data-selected] .thumb']) {
      const body = JSON.stringify(decls(CSS, sel));
      expect(body, sel).not.toMatch(/danger|seg-on|r-pill|r-round/);
    }
  });

  it('the focus ring stays on the track', () => {
    expect(decls(CSS, '.switch[data-focus-visible] .track')).toEqual({ 'box-shadow': 'var(--focus-ring)' });
  });
});

describe('switch: the tokens', () => {
  it('light holds the given values (the off line is the documented deviation)', () => {
    expect(LIGHT['--hx-switch-off']).toBe('#dedede');
    expect(LIGHT['--hx-switch-line']).toBe('#7a7a7a');
    expect(LIGHT['--hx-switch-thumb']).toBe('#fff');
    expect(LIGHT['--hx-switch-on']).toBe('var(--hx-acc)');
    expect(colour(LIGHT, LIGHT['--hx-switch-on']!)).toBe('#ef2');
    expect(LIGHT['--hx-switch-on-line']).toBe('#1c1c1c');
  });

  it('dark derives its off grey from the raised greys; line, thumb and the yellow stay', () => {
    expect(DARK['--hx-switch-off']).toBe('var(--hx-fill)');
    for (const t of ['--hx-switch-line', '--hx-switch-thumb', '--hx-switch-on', '--hx-switch-on-line']) expect(DARK[t], t).toBe(LIGHT[t]);
  });

  // The opaque surfaces a switch sits on (the browser spec adds the translucent hover, selected and tint layers).
  const SURFACES = ['--hx-raised', '--hx-card', '--hx-bg', '--hx-fill', '--hx-sidebar', '--hx-sec-bg'];
  for (const [name, theme] of [['light', LIGHT], ['dark', DARK]] as const) {
    it(`the off line reaches 3:1 on every surface and on the off track, and the on line frames the thumb on the yellow (${name})`, () => {
      const line = colour(theme, theme['--hx-switch-line']!);
      for (const s of SURFACES) expect(ratio(line, colour(theme, theme[s]!)), `${name} line on ${s}`).toBeGreaterThanOrEqual(3);
      expect(ratio(line, colour(theme, theme['--hx-switch-off']!)), `${name} line on the off track`).toBeGreaterThanOrEqual(3);
      expect(ratio(colour(theme, theme['--hx-switch-on-line']!), colour(theme, theme['--hx-switch-on']!)), `${name} on line on the yellow`).toBeGreaterThanOrEqual(3);
    });
  }
});
