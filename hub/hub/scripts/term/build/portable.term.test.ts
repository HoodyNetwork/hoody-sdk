// The ship bundle runs under Node too (the npm package's `hoody hub`): no shipped source may read the Bun global
// unguarded, use Bun's import.meta fields or import `bun:*` (portable.ts). Each kind is first shown to be seen, then the
// shipped sources hold none.
import { expect, test } from 'bun:test';
import { portabilityFindings, shippedFindings, shippedSources } from './portable';

test('each kind is seen; guarded reads, Node\'s import.meta fields, import.meta.env and type-only imports are not', () => {
  const text = [
    `const a = Bun.file('x');`,
    `const b = (globalThis as unknown as { Bun: { stringWidth(s: string): number } }).Bun.stringWidth;`,
    `const c = import.meta.dir;`,
    `const d = import.meta.main;`,
    `import { $ } from 'bun';`,
    `import { Database } from 'bun:sqlite';`,
    `const ok1 = (globalThis as { Bun?: { stringWidth?(s: string): number } }).Bun?.stringWidth;`,
    `const ok2 = import.meta.dirname + import.meta.filename;`,
    `const ok3 = import.meta.env.DEV;`,
    `import type { BunFile } from 'bun';`,
    `let ok4: Bun.BunFile | null = null;`,
  ].join('\n');
  expect(portabilityFindings('t.ts', text)).toEqual([
    `t.ts:1 Bun.file`,
    `t.ts:2 (globalThis as unknown as { Bun: { stringWidth(s: string): number } }).Bun.strin`,
    `t.ts:3 import.meta.dir`,
    `t.ts:4 import.meta.main`,
    `t.ts:5 import 'bun'`,
    `t.ts:6 import 'bun:sqlite'`,
  ]);
});

// It walks and scans the whole shipped source graph: about 10 s on a loaded gate (10 files at a time), past Bun's 5 s
// default. The same bound as the other slow term tests.
test('the shipped sources reach the bundle\'s own scripts and hold nothing Node cannot run', () => {
  const files = shippedSources().map((f) => f.replace(/\\/g, '/'));
  for (const f of ['src/term/prim/TableCells.ts', 'src/term/jsx/filePick.ts', 'scripts/term/build/ship-entry.ts', 'scripts/term/build/engine-check.ts']) {
    expect(files.some((x) => x.endsWith(`/${f}`)), f).toBe(true);
  }
  expect(files.some((x) => /\.(test|spec)\.tsx?$/.test(x))).toBe(false);
  expect(shippedFindings()).toEqual([]);
}, 240_000);
