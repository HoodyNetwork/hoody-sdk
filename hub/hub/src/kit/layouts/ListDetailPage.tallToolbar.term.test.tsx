// A list toolbar taller than half the pane (Memory at 80x24 with its realm band's details open and its settings card)
// makes the page one document, as a tall header does: the toolbar and the list under it both laid out in full, with no
// layout cut. Before, only the header counted: the toolbar filled the clipped list pane and the list was cut to nothing.
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Box, Text } from '../../term/prim';
import { layoutFaults } from '../../term/prim/layoutcheck';
import { routed } from './termHarness';
import { PageOutlet } from './termScroll';
import { ListDetailPage } from './ListDetailPage';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

const bar = (lines: number) => (
  <Box dir="column">{Array.from({ length: lines }, (_, i) => <Text key={i}>{`toolbar line ${i}`}</Text>)}</Box>
);
const rows = <Box dir="column">{['row one', 'row two', 'row three'].map((r) => <Text key={r}>{r}</Text>)}</Box>;
const draw = async (lines: number) => {
  const r = routed(() => <PageOutlet><ListDetailPage header={{ title: 'Things' }} toolbar={bar(lines)} list={rows} detail={null} /></PageOutlet>);
  t = await drawTest(r.element, { width: 60, height: 24 });
  let f = await t.settle();
  for (let i = 0; i < 3; i++) { await new Promise((res) => setTimeout(res, 30)); f = await t.settle(); }
  const faults = layoutFaults(t.renderer.root as never, { cols: 60, rows: 24 }).filter((x) => x.kind === 'cut').map((x) => `${x.path}: ${x.detail}`);
  return { f, faults };
};

test('a toolbar taller than half the pane: no layout cut, the list is laid out under it', async () => {
  const { faults } = await draw(30);
  expect(faults).toEqual([]);
}, 30_000);

test('control: a short toolbar keeps the bounded pane, the list on screen, no cut', async () => {
  const { f, faults } = await draw(2);
  expect(f).toContain('toolbar line 1');
  expect(f).toContain('row three');
  expect(faults).toEqual([]);
}, 30_000);
