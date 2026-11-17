// `@term/prim`: the page-facing barrel src/term/prim/page.ts. The alias is exact (no
// `@term/prim/<x>`); the barrel holds layout and text primitives only; no page reaches prim by relative path. The lint
// half (allowed only in a page's .term files, deep paths and relative paths refused) is in
// src/app/conformance.pageboundaries.test.ts (vitest: ESLint's plugins read DOM globals the term fence traps).
import { expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

const HUB = path.resolve(import.meta.dir, '..', '..');
test('the alias is exact: @term/prim resolves to page.ts, @term/prim/<x> does not resolve', async () => {
  const { TermResolver } = await import('./resolve');
  const r = new TermResolver({ hub: HUB, fixtures: true });
  const from = path.join(HUB, 'src/pages/computers/parts/Flag.term.tsx');
  const a = r.resolve('@term/prim', from);
  expect(a.kind === 'file' && path.relative(HUB, a.path)).toBe('src/term/prim/page.ts');
  for (const spec of ['@term/prim/Box', '@term/prim/page', '@term/prim/focus']) expect([spec, r.resolve(spec, from).kind]).not.toEqual([spec, 'file']);
});

test('page.ts exports layout and text primitives only (no engine, focus, semantics, overlay or table plumbing)', async () => {
  const names = Object.keys(await import('../../src/term/prim/page')).sort();
  expect(names).toEqual(['Box', 'Br', 'FieldSwatch', 'OneLine', 'REALM_HEX', 'Spacer', 'Text', 'cellWidth', 'clipCells', 'dataColourAtTier', 'padCells', 'realmHex', 'useBoxSize', 'useInText', 'widestCells']);
  const src = fs.readFileSync(path.join(HUB, 'src/term/prim/page.ts'), 'utf8');
  expect(src).not.toMatch(/from '\.\/(otui|focus|semantics|Overlay|engine|Table(Clip|Mark|Check)|ListWindow)'/);
});

test('no page imports the terminal by relative path any more (except the recorded debt)', () => {
  const DEBT = new Set(['src/pages/logs/parts/LogList.term.tsx']);
  const hits: string[] = [];
  const walk = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'term-golden') walk(f); continue; }
      if (!/\.term\.tsx?$/.test(e.name)) continue;
      if (/from '(\.\.\/)+term\/prim[^']*'/.test(fs.readFileSync(f, 'utf8'))) hits.push(path.relative(HUB, f));
    }
  };
  walk(path.join(HUB, 'src/pages'));
  expect(hits.filter((h) => !DEBT.has(h))).toEqual([]);
});
