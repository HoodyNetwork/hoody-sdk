// The Listings name cell in the terminal: the name on its own line, cut with "…" when long, and the tags on the line
// under it; no tags, no tag line.
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../../../term/prim/testing';
import { Box, FocusRoot, PaneSize, Text } from '../../../../term/prim';
import { nameCell } from './NameCell';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

const draw = async (name: string, tags: string[], width = 40) => {
  t = await drawTest(
    <FocusRoot><PaneSize><Box dir="column" width={width}>{nameCell({ name, tags: tags.map((x) => <Text key={x}>{x}</Text>) })}</Box></PaneSize></FocusRoot>,
    { width: 60, height: 6 },
  );
  return t.settle();
};

test('nameCell: the name, then its tags on the line under it', async () => {
  const lines = (await draw('EPYC 7543P Frankfurt', ['Pre-order', 'Featured'])).split('\n');
  const n = lines.findIndex((l) => l.includes('EPYC 7543P Frankfurt'));
  expect(n).toBeGreaterThanOrEqual(0);
  expect(lines[n]).not.toContain('Pre-order');
  expect(lines[n + 1]).toContain('Pre-order');
  expect(lines[n + 1]).toContain('Featured');
});

test('nameCell: a long name is cut with one "…" on one line', async () => {
  const f = await draw('A very long server name that runs well past the column edge', [], 20);
  expect(f).toContain('…');
  expect(f).not.toContain('column edge');
});
