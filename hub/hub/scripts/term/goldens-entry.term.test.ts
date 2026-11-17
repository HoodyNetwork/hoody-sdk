// A runner entry never sits in a static import cycle with a module it imports at run time. `bun scripts/term/goldens.ts
// --page <id>` awaits `import('./render')` at top level; render.ts imported crashShown from goldens.ts, so the two were
// one cycle and the entry waited on its own evaluation: every CLI golden run (check.ts, the ship gate) hung with 0
// frames. secrets.ts had the same shape (it awaits goldens.ts, which imported golden-guard.ts, which imported
// secrets.ts statically). The scan below follows static imports (import/export ... from, side-effect imports) of every
// run-time import target of every scripts/term entry (`import('./x')` and `import(path.join(import.meta.dir, 'x.ts'))`)
// and fails when it reaches that entry again.
import { expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { reaches, resolveRel, staticImports } from './static-imports';

const TERM = import.meta.dir;
/** The modules a file imports at run time, as relative specifiers: `import('./x')` and the runners' own spelling
 *  `import(path.join(import.meta.dir, 'x.ts'))`. */
function runtimeImports(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/\bimport\(\s*['"](\.[^'"]+)['"]\s*\)/g)) out.push(m[1]!);
  for (const m of src.matchAll(/\bimport\(\s*path\.join\(\s*import\.meta\.dir\s*,\s*['"]([^'"]+)['"]\s*\)\s*\)/g)) out.push(`./${m[1]!}`);
  return out;
}
test('no scripts/term entry is reached again from a module it awaits at run time (no evaluation cycle)', () => {
  const cycles: string[] = [];
  for (const name of fs.readdirSync(TERM)) {
    if (!/\.(ts|mts)$/.test(name) || /\.test\.ts$/.test(name)) continue;
    const entry = path.join(TERM, name);
    const src = fs.readFileSync(entry, 'utf8');
    if (!/import\.meta\.main/.test(src)) continue;
    for (const spec of runtimeImports(src)) {
      const t = resolveRel(entry, spec);
      if (!t) continue;
      const trail = reaches(t, entry);
      if (trail) cycles.push(`${name}: import('${spec}') -> ${trail.map((f) => path.relative(TERM, f)).join(' -> ')}`);
    }
  }
  expect(cycles).toEqual([]);
});

test('both spellings of a run-time import are read', () => {
  expect(runtimeImports(`await import('./render'); await import(path.join(import.meta.dir, 'goldens.ts'))`)).toEqual(['./render', './goldens.ts']);
});

test('the scan sees a cycle (render.ts importing goldens.ts would be one)', () => {
  const render = path.join(TERM, 'render.ts');
  const goldens = path.join(TERM, 'goldens.ts');
  expect(staticImports(goldens)).toContain(render);
  expect(reaches(render, goldens)).toBeNull();
});

test('the page runner hears a child\'s first frame, even split across chunks (its no-first-frame watchdog)', async () => {
  const { readWatching, FIRST_FRAME_MARK } = await import('./goldens');
  const enc = new TextEncoder();
  const half = FIRST_FRAME_MARK.length >> 1;
  const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(enc.encode(`boot\n${FIRST_FRAME_MARK.slice(0, half)}`)); c.enqueue(enc.encode(`${FIRST_FRAME_MARK.slice(half)}\nmore\n`)); c.close(); } });
  let marks = 0;
  const text = await readWatching(stream, () => { marks++; });
  expect(marks).toBe(1);
  expect(text).toBe(`boot\n${FIRST_FRAME_MARK}\nmore\n`);
  const quiet = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(enc.encode('booting, no frame\n')); c.close(); } });
  let none = 0;
  await readWatching(quiet, () => { none++; });
  expect(none).toBe(0);
});
