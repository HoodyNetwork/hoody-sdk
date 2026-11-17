// A heading row that wraps (title + meta on one line, actions and primary moved under it) puts the moved part on the
// NEXT row: never blank rows between them. A terminal row is a whole line, and `gap` on a wrapping Box is both axes, so
// gap={2} left 2 blank rows under every page heading at 80x24 (Computers: tab row, 2 blank rows, "Use with your agent").
// The same holds for the toolbar and section heads.
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Box, FocusRoot, Text } from '../../term/prim';
import { routed } from './termHarness';
import { PageHeader, Toolbar } from './PageHeader';
import { Button } from '../controls/Button';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

async function frame(node: () => React.ReactElement, width: number): Promise<string[]> {
  const { element } = routed(() => <FocusRoot>{node()}</FocusRoot>);
  t = await drawTest(element, { width, height: 12 });
  await t.settle();
  return (await t.settle()).split('\n').map((l) => l.trimEnd());
}

const rowsBetween = (lines: string[], a: string, b: string): number => {
  const ia = lines.findIndex((l) => l.includes(a));
  const ib = lines.findIndex((l) => l.includes(b));
  expect([a, ia >= 0, b, ib >= 0]).toEqual([a, true, b, true]);
  return ib - ia - 1;
};

test('PageHeader: wrapped actions sit on the row right under the title, no blank rows', async () => {
  const lines = await frame(() => (
    <PageHeader
      title="Computers"
      meta={<Box dir="row" gap={2}><Text>‹ Computers ›</Text><Text>Servers</Text><Text>Projects</Text></Box>}
      actions={<Text>▸ Use with your agent</Text>}
      primary={{ label: 'Get a computer', onPress: () => {} }}
      subtitle="Your computers: start them, open a terminal, and manage access."
    />
  ), 60);
  expect(rowsBetween(lines, 'Projects', 'Use with your agent')).toBe(0);
  // Wide: one row, as before.
  t?.renderer.destroy(); t = null;
  const wide = await frame(() => (
    <PageHeader title="Computers" actions={<Text>▸ Use with your agent</Text>} primary={{ label: 'Get a computer', onPress: () => {} }} />
  ), 100);
  expect(wide.some((l) => l.includes('Computers') && l.includes('Get a computer'))).toBe(true);
});

test('Toolbar: a wrapped end part sits on the next row, no blank rows', async () => {
  const lines = await frame(() => (
    <Toolbar
      start={<><Text>/ Search computers</Text><Text>Filters</Text></>}
      end={<><Button onPress={() => {}}>Refresh</Button><Button onPress={() => {}}>View options</Button></>}
    />
  ), 40);
  expect(rowsBetween(lines, 'Filters', 'Refresh')).toBe(0);
});
