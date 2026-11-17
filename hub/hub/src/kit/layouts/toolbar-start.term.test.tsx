// Toolbar start side: it grows into the row's free room (the web's .toolbarStart flex 1 1 auto), and still wraps as the
// web does: when start and end do not fit one line the end goes under the start, whole; a start wider than the row
// wraps inside the row, nothing cut.
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Box, FocusRoot, Text } from '../../term/prim';
import { routed } from './termHarness';
import { Toolbar } from './PageHeader';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });
const frame = async (node: () => React.ReactElement, width: number): Promise<string[]> => {
  const { element } = routed(() => <FocusRoot>{node()}</FocusRoot>);
  t = await drawTest(element, { width, height: 8 });
  await t.settle();
  return (await t.settle()).split('\n').map((l) => l.trimEnd());
};
const bar = (): React.ReactElement => (
  <Toolbar
    start={<><Text>Search computers</Text><Text>Filters</Text><Box grow={1} /><Text>Live</Text></>}
    end={<Text>Refresh options</Text>}
  />
);

test('room to spare: one line, the start reaches the end part (its last piece sits right before it)', async () => {
  const lines = await frame(bar, 80);
  expect(lines[0]).toMatch(/^Search computers {2}Filters {20,}Live {2}Refresh options$/);
});

test('start and end do not fit one line: the end goes under the start, the start stays on one line', async () => {
  const lines = await frame(bar, 40);
  expect(lines[0]).toMatch(/^Search computers {2}Filters\s+Live$/);
  expect(lines[1]).toMatch(/Refresh options$/);
});

test('a start wider than the row wraps inside the row, nothing cut', async () => {
  const lines = await frame(bar, 20);
  const all = lines.join('\n');
  for (const w of ['Search computers', 'Filters', 'Live', 'Refresh options']) expect(all).toContain(w);
  expect(Math.max(...lines.map((l) => l.length))).toBeLessThanOrEqual(20);
});
