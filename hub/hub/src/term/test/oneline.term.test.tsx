// OneLine (prim/Text.ts): a cell name that does not fit ends in one "…" on its one row instead of wrapping by word
// and losing its second line to the row's height ("ping-", "queue-", "Watch the" on Schedules at 80 cols).
import { expect, test } from 'bun:test';
import { createElement as h } from 'react';
import { drawTest } from '../prim/testing';
import { Box, FocusRoot, OneLine, Text } from '../prim';
import { jsx } from '../jsx/jsx-runtime';

const rows = (f: string): string[] => f.split('\n').map((l) => l.trimEnd());

test('a plain Text in a one-row cell: cut at the end with "…", never word-wrapped', async () => {
  const cell = (oneLine: boolean) => h(Box, { dir: 'row', width: 12, height: 1 }, oneLine ? h(OneLine, null, h(Text, null, 'Watch the build log')) : h(Text, null, 'Watch the build log'));
  const t = await drawTest(h(FocusRoot, null, h(Box, { dir: 'column' }, cell(false), cell(true))), { width: 20, height: 3 });
  const f = rows(t.captureCharFrame());
  expect(f[0]).toBe('Watch the');
  expect(f[1]).toBe('Watch the b…');
  t.renderer.destroy();
});

test('rich and compat-drawn children are cut the same way; truncate={false} opts out', async () => {
  const t = await drawTest(h(FocusRoot, null, h(OneLine, null, h(Box, { dir: 'column', width: 12 },
    h(Box, { height: 1 }, h(Text, null, 'ping-', h(Text, { bold: true }, 'api-health'))),
    h(Box, { height: 1 }, jsx('span' as never, { children: 'queue-drain-nightly' })),
    h(Box, { height: 2 }, h(Text, { truncate: false }, 'two lines wrap here'))))), { width: 20, height: 5 });
  const f = rows(t.captureCharFrame());
  expect(f[0]).toBe('ping-api-he…');
  expect(f[1]).toBe('queue-drain…');
  expect(f.slice(2, 4)).toEqual(['two lines', 'wrap here']);
  t.renderer.destroy();
});

test('in a column parent the cut Text is one row tall (siblings stay on screen)', async () => {
  const t = await drawTest(h(FocusRoot, null, h(OneLine, null, h(Box, { dir: 'column', width: 10 }, h(Text, null, 'a long long name'), h(Text, null, 'after')))), { width: 20, height: 4 });
  const f = rows(t.captureCharFrame());
  expect(f[0]).toBe('a long lo…');
  expect(f[1]).toBe('after');
  t.renderer.destroy();
});
