import { expect, test } from 'bun:test';
import { classifyKit, stubNames } from './kit-classes';
import type { Analysis } from './graph/analyse';

test('scaffold markers name the stub exports of a sibling', () => {
  const text = "// term-stub: Foo\nexport const Foo = 1;\n  // term-stub: useBar. A pure helper moves…\nexport const useBar = 2;\n// not a term-stub: Baz\n";
  expect([...stubNames(text)].sort()).toEqual(['Foo', 'useBar']);
});

test('a new kit export with no sibling, no hand-off and no recorded class fails', async () => {
  // A real web file with no sibling and no web-only package: it would draw only approximated (auto).
  const a = { kit: [{ name: 'ZzNotRecorded', kind: 'component', file: 'src/kit/controls/UpgradeLink.tsx', status: 'needs-sibling', needs: [], importers: 0 }] } as unknown as Analysis;
  const r = await classifyKit(a, { update: false });
  expect(r.rows[0]!.cls).toBe('auto');
  const p = r.problems.find((x) => x.rule === 'kit-auto-new')!;
  expect(p.message).toContain('ZzNotRecorded');
  expect(p.fix).toContain('new.ts');
});
