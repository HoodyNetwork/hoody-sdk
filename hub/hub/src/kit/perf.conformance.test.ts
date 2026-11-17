// Performance mode: no CSS in the Hub escapes the switch. Under data-hx-perf="on", tokens.css empties every
// shadow and duration token and base.css ends every animation at once and stops every transition (and text glow). So every box-shadow in
// hub/src is a shadow token, a focus ring, or a blur-free line or ring (an outline, which stays); no other rule can
// outrank base.css with its own !important animation or transition; and nothing draws a drop-shadow filter or a
// shadow from a script. A new raw shadow, or a new token the switch does not empty, fails here.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// Read from disk: the test runner hands stylesheets to the CSS pipeline, never as text.
const SRC = join(import.meta.dirname, '..');
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'node_modules' ? [] : walk(join(dir, e.name))) : [join(dir, e.name)]));
const read = (f: string) => readFileSync(f, 'utf8');
const tokens = read(join(SRC, 'kit/tokens.css'));
const base = read(join(SRC, 'kit/base.css'));
const css = Object.fromEntries(
  walk(SRC)
    .filter((f) => f.endsWith('.css'))
    .map((f) => [relative(SRC, f), read(f).replace(/\/\*[\s\S]*?\*\//g, '')]),
);
const rawCode = import.meta.glob(['../**/*.tsx', '../**/*.ts', '!../**/*.test.ts', '!../**/*.test.tsx', '!../**/*.spec.ts', '!../**/*.spec.tsx', '!../**/e2e-*.ts', '!../**/shots.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const PERF = ':root[data-hx-perf="on"]';

/** Splits on commas outside parentheses. */
function topLevel(v: string, sep: RegExp): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of v) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (depth === 0 && sep.test(ch)) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

const TOKEN = /^var\(--(sh-[\w-]+|focus-ring[\w-]*)\)$/;
const COLOR = /^(#|rgba?\(|hsla?\(|color-mix\(|currentcolor$|transparent$|var\(--(hx|rc|ring)[\w-]*\)$|[a-z]+$)/i;

/** Why one box-shadow layer escapes the switch, or null: a token, none, or a layer with no blur (a line or ring). */
function layerProblem(layer: string): string | null {
  const l = layer.replace(/\s*!important$/, '').trim();
  if (/^(none|initial|inherit|unset|revert)$/.test(l) || TOKEN.test(l)) return null;
  if (/^var\(/.test(l) && !l.includes(' ')) return `unknown shadow variable ${l}`;
  const lengths = topLevel(l, /\s/).filter((p) => p !== 'inset' && !COLOR.test(p));
  if (lengths.length < 2 || lengths.length > 4) return `unreadable layer "${l}"`;
  const blur = lengths[2];
  if (blur === undefined || /^0(px|rem|em)?$/.test(blur)) return null;
  return `blurred shadow "${l}"`;
}

describe('Performance mode: no CSS escapes the switch', () => {
  it('reads the Hub stylesheets', () => {
    expect(Object.keys(css).length).toBeGreaterThan(50);
    expect(css['kit/base.css']).toBeDefined();
  });

  // An empty shadow is a transparent one, never `none`: rules add a ring to a shadow token (`var(--sh-pop), var(--focus-ring)`),
  // and a list holding `none` is invalid, which drops the ring too.
  it('tokens.css empties every shadow and duration token, after the dark theme so it wins in both', () => {
    const at = tokens.indexOf(`${PERF} {`);
    expect(at).toBeGreaterThan(tokens.indexOf(':root[data-hx-theme="dark"] {'));
    const block = tokens.slice(at, tokens.indexOf('}', at));
    const defined = new Set([...tokens.matchAll(/(--(?:sh-[\w-]+|dur-[\w-]+))\s*:/g)].map((m) => m[1] as string));
    // A button has no shadow and no duration of its own: its one transition is the focus ring's, on --dur-press.
    expect(tokens).not.toMatch(/--btn-(?:sh|dur)[\w-]*\s*:/);
    expect(defined.size).toBeGreaterThan(10);
    for (const name of defined) {
      const want = name.includes('dur') ? '0ms' : '0 0 #0000';
      expect(block, name).toMatch(new RegExp(`${name}:\\s*${want};`));
    }
  });

  // Ended, not cancelled: an overlay leaves when its exit animation finishes, and a state shown only through an
  // animation (the page-change bar) must still reach its end. `animation: none` would do neither.
  it('base.css ends every animation at once and stops every transition and text glow under the switch', () => {
    const flat = base.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ');
    expect(flat).toContain(`${PERF} *, ${PERF} *::before, ${PERF} *::after { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; transition: none !important; text-shadow: none !important; scroll-behavior: auto !important; }`);
    expect(flat).not.toMatch(/animation(-name)?\s*:\s*none\s*!important/);
  });

  it('every box-shadow is a shadow token, a focus ring or a blur-free line', () => {
    const bad: string[] = [];
    for (const [file, src] of Object.entries(css))
      for (const m of src.matchAll(/(?<![-\w])box-shadow\s*:\s*([^;}]+)/g))
        for (const layer of topLevel(m[1] as string, /,/)) {
          const why = layerProblem(layer);
          if (why) bad.push(`${file}: ${why}`);
        }
    expect(bad).toEqual([]);
  });

  it('no other rule outranks the switch with its own !important animation or transition, and no filter draws a shadow', () => {
    const bad: string[] = [];
    for (const [file, src] of Object.entries(css)) {
      for (const m of src.matchAll(/(?<![-\w])(animation|transition)[\w-]*\s*:[^;}]*!important/g))
        if (file !== 'kit/base.css') bad.push(`${file}: ${m[0]}`);
      for (const m of src.matchAll(/drop-shadow\(/g)) bad.push(`${file}: ${m[0]}`);
    }
    expect(bad).toEqual([]);
  });

  it('no script draws a shadow (inline styles go through the CSS above)', () => {
    const bad = Object.entries(rawCode)
      .filter(([, src]) => /\bboxShadow\s*[:=]\s*['"`](?!none['"`])/.test(src) || /\.boxShadow\s*=/.test(src))
      .map(([f]) => f);
    expect(bad).toEqual([]);
  });

  it('the checker knows a shadow from a ring', () => {
    expect(layerProblem('var(--sh-pop)')).toBeNull();
    expect(layerProblem('var(--focus-ring)')).toBeNull();
    expect(layerProblem('0 0 0 2px var(--hx-bg)')).toBeNull();
    expect(layerProblem('inset 0 var(--bw-2) 0 var(--hx-focus)')).toBeNull();
    expect(layerProblem('0 -2px 0 var(--hx-acc)')).toBeNull();
    expect(layerProblem('0 4px 12px rgb(0 0 0 / 10%)')).toMatch(/blurred/);
    expect(layerProblem('var(--my-glow)')).toMatch(/unknown/);
  });
});
