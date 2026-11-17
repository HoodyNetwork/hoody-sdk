// Vitest (:429): no looping animation outlives "reduce motion". Every rule in the Hub's CSS modules whose animation
// repeats forever must be switched off (animation: none) for each of its selectors by a later rule in a plain
// @media (prefers-reduced-motion: reduce) block of the same file, so the stop applies everywhere and wins the cascade.
// A rule that can only run inside a plain @media (prefers-reduced-motion: no-preference) block needs nothing; a loop
// slowed on purpose instead is listed in SLOWED with its reason and floor. The duration tokens zeroed in tokens.css do
// not stop an animation with a fixed duration, which is how the two busy spinners kept pulsing. The scan is strict:
// any arrangement it cannot prove stopped (a stop under extra conditions, before the loop, or losing to !important)
// counts as a miss.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..');

/** Loops slowed on purpose instead of stopped: the reason, and the slowest-allowed floor of the reduce duration. */
const SLOWED: Record<string, { reason: string; minMs: number }> = {};

function cssModules(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : cssModules(p);
    return e.name.endsWith('.module.css') ? [p] : [];
  });
}

interface Rule {
  selectors: string[];
  body: string;
  media: string[];
}

/** The style rules of a stylesheet, in source order, with the at-rule preludes around each (comments removed; no CSS
 * nesting here). */
export function rulesOf(css: string): Rule[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: Rule[] = [];
  const stack: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') {
      const prelude = text.slice(start, i).trim();
      const close = prelude.startsWith('@') ? -1 : text.indexOf('}', i);
      if (close >= 0 && !text.slice(i + 1, close).includes('{')) {
        // reason: a style rule; selectors split on top-level commas only (none of ours has a comma inside parens)
        const selectors = prelude.split(',').map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
        out.push({ selectors, body: text.slice(i + 1, close), media: [...stack] });
        i = close;
      } else {
        stack.push(prelude.replace(/\s+/g, ' '));
      }
      start = i + 1;
    } else if (ch === '}') {
      stack.pop();
      start = i + 1;
    }
  }
  return out;
}

/** The declarations of a rule body whose property matches, as [value, important]. */
const decls = (body: string, prop: RegExp) =>
  body
    .split(';')
    .map((d) => d.split(/:(.*)/s))
    .filter(([p]) => prop.test((p ?? '').trim()))
    .map(([, v = '']) => [v.replace(/!\s*important/i, '').trim(), /!\s*important/i.test(v)] as const);

const loopDecls = (body: string) => decls(body, /^animation(-iteration-count)?$/).filter(([v]) => /\binfinite\b/.test(v));
const stopDecls = (body: string) => decls(body, /^animation(-name)?$/).filter(([v]) => v === 'none');
/** Only these exact preludes count: anything more (a comma, `not`, an extra condition) may change where they apply. */
const PLAIN_REDUCE = '@media (prefers-reduced-motion: reduce)';
const PLAIN_MOTION_OK = '@media (prefers-reduced-motion: no-preference)';
const inPlainReduce = (r: Rule) => r.media.length === 1 && r.media[0] === PLAIN_REDUCE;
const onlyWithMotion = (r: Rule) => r.media.includes(PLAIN_MOTION_OK);

/** Duration in ms of a CSS time value (`3s`, `300ms`), or NaN. */
export const ms = (v: string) => {
  const m = /^(\d*\.?\d+)(ms|s)$/.exec(v.trim());
  return m ? Number(m[1]) * (m[2] === 's' ? 1000 : 1) : NaN;
};

/** True when a later rule in a plain reduce block, for this selector, has a declaration `ok` accepts that is at least
 * as important as the loop's. */
function laterReduceWins(rules: Rule[], at: number, sel: string, important: boolean, ok: (body: string) => (readonly [string, boolean])[]) {
  return rules.some((r, j) => j > at && inPlainReduce(r) && r.selectors.includes(sel) && ok(r.body).some(([, imp]) => imp || !important));
}

/** The selectors of looping rules that no later plain reduce block in the same sheet switches off. A loop declared
 * inside a reduce block is checked like any other (it runs exactly when motion is unwelcome). */
export function unstoppedLoops(css: string): string[] {
  const rules = rulesOf(css);
  return rules.flatMap((r, i) => {
    const loop = loopDecls(r.body);
    if (loop.length === 0 || onlyWithMotion(r)) return [];
    const important = loop.some(([, imp]) => imp);
    return r.selectors.filter((sel) => !laterReduceWins(rules, i, sel, important, stopDecls));
  });
}

/** True when every loop of `sel` in the sheet is slowed to at least `minMs` by a later plain reduce rule that wins. */
export function slowedAtLeast(css: string, sel: string, minMs: number): boolean {
  const rules = rulesOf(css);
  const slow = (body: string) => decls(body, /^animation-duration$/).filter(([v]) => ms(v) >= minMs);
  const loops = rules.map((r, i) => [r, i] as const).filter(([r]) => loopDecls(r.body).length > 0 && r.selectors.includes(sel) && !onlyWithMotion(r));
  return loops.length > 0 && loops.every(([r, i]) => laterReduceWins(rules, i, sel, loopDecls(r.body).some(([, imp]) => imp), slow));
}

describe('looping animations stop under reduced motion (429)', () => {
  const loop = '.a::before,\n.b { animation: spin 900ms linear infinite; }';
  const reduce = (body: string) => `\n@media (prefers-reduced-motion: reduce) { ${body} }`;

  it('the scan finds a loop with no reduce block, and accepts one that has it', () => {
    expect(unstoppedLoops(loop)).toEqual(['.a::before', '.b']);
    expect(unstoppedLoops(loop + reduce('.b { animation: none; }'))).toEqual(['.a::before']);
    expect(unstoppedLoops(loop + reduce('.a::before, .b { animation: none; }'))).toEqual([]);
    expect(unstoppedLoops(loop + reduce('.a::before, .b { animation: none !important; }'))).toEqual([]);
    expect(unstoppedLoops(loop + reduce('.a::before, .b { animation-name: none; }'))).toEqual([]);
    expect(unstoppedLoops('.d { animation: x 1s; animation-iteration-count: infinite; }')).toEqual(['.d']);
    // A loop that can only run when motion is welcome needs nothing.
    expect(unstoppedLoops('@media (prefers-reduced-motion: no-preference) { .c { animation: x 1s infinite; } }')).toEqual([]);
  });

  it('the scan refuses what it cannot prove stopped', () => {
    // Slowed is not stopped.
    expect(unstoppedLoops(loop + reduce('.a::before, .b { animation-duration: 4s; }'))).toHaveLength(2);
    // A stop under an extra condition leaves the loop running elsewhere.
    expect(unstoppedLoops(`${loop}\n@media (prefers-reduced-motion: reduce) and (width < 600px) { .a::before, .b { animation: none; } }`)).toHaveLength(2);
    expect(unstoppedLoops(`${loop}\n@media (width < 600px) { @media (prefers-reduced-motion: reduce) { .a::before, .b { animation: none; } } }`)).toHaveLength(2);
    // A stop before the loop loses the cascade; so does a plain stop against an !important loop.
    expect(unstoppedLoops(reduce('.a::before, .b { animation: none; }') + '\n' + loop)).toHaveLength(2);
    expect(unstoppedLoops('.e { animation: x 1s infinite !important; }' + reduce('.e { animation: none; }'))).toEqual(['.e']);
    // A loop declared under reduce, or under a no-preference query widened by a comma, runs with reduced motion.
    expect(unstoppedLoops(reduce('.f { animation: spin 1s infinite; }'))).toEqual(['.f']);
    expect(unstoppedLoops('@media (prefers-reduced-motion: no-preference), (hover: hover) { .g { animation: x 1s infinite; } }')).toEqual(['.g']);
  });

  it('a slowed loop must be slowed to its floor by a later plain reduce rule', () => {
    expect(ms('3s')).toBe(3000);
    expect(ms('300ms')).toBe(300);
    expect(slowedAtLeast(loop + reduce('.b { animation-duration: 3s; }'), '.b', 3000)).toBe(true);
    expect(slowedAtLeast(loop + reduce('.b { animation-duration: 300ms; }'), '.b', 3000)).toBe(false);
    expect(slowedAtLeast(loop + reduce('.b { animation-duration: 1ms; }'), '.b', 3000)).toBe(false);
    expect(slowedAtLeast(reduce('.b { animation-duration: 3s; }') + '\n' + loop, '.b', 3000)).toBe(false);
    expect(slowedAtLeast(loop, '.zz', 3000)).toBe(false);
  });

  it('every looping animation in the Hub CSS modules has a reduce block that stops it', () => {
    const files = cssModules(SRC);
    expect(files.length, 'CSS modules found').toBeGreaterThan(50);
    const misses = files.flatMap((f) => unstoppedLoops(readFileSync(f, 'utf8')).map((sel) => `${relative(SRC, f)}: ${sel}`));
    expect(misses.filter((m) => !(m in SLOWED))).toEqual([]);
    // Each slowed entry is still a loop the scan sees, and its sheet still slows it to the floor under reduce.
    for (const [key, { minMs }] of Object.entries(SLOWED)) {
      expect(misses, `${key} is still a slowed loop (else drop it from SLOWED)`).toContain(key);
      const [file = '', sel = ''] = key.split(': ');
      expect(slowedAtLeast(readFileSync(join(SRC, file), 'utf8'), sel, minMs), `${key} is slowed to >= ${minMs} ms under reduce`).toBe(true);
    }
    // reason: proves the scan reads real sheets: the Hub has looping animations, and each one is accounted for
    expect(files.filter((f) => rulesOf(readFileSync(f, 'utf8')).some((r) => loopDecls(r.body).length > 0)).length).toBeGreaterThanOrEqual(8);
  });
});
