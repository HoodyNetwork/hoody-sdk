// ↓ on a group header goes into the list: the cursor lands on the first row under the header, so the rows of a folded
// group the reader just opened are reachable from the keyboard (a list of one folded group, such as Programs' system
// programs, has no other way in), and the next Enter opens a row instead of folding the group again. ↑ goes to the
// last row above the header. In a page that scrolls, opening the group keeps the focus on its header.
import { expect, test } from 'bun:test';
import type { ColumnDef } from '@tanstack/react-table';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Box, FocusRoot, Text } from '../../term/prim';
import { DataTable } from './DataTable';
import { PageBody } from '../layouts/termScroll';
import { focusedNode, semanticsOf } from '../../term/prim/semantics';
import type { TableGroup } from './DataTableItems';

interface Row { id: string; name: string; state: string }
const rows: Row[] = [
  { id: 'a1', name: 'row-a1', state: 'one' }, { id: 'a2', name: 'row-a2', state: 'one' },
  { id: 'b1', name: 'row-b1', state: 'two' }, { id: 'b2', name: 'row-b2', state: 'two' },
];
const columns: ColumnDef<Row, string>[] =[{ id: 'name', header: 'Name', accessorKey: 'name', meta: { pinned: true, list: 'primary' } }];

function Routed({ children }: { children: ReactNode }) {
  const [router] = useState(() => createRouter({ routeTree: createRootRoute({ component: () => <>{children}</> }), history: createMemoryHistory({ initialEntries: ['/'] }), origin: 'http://localhost' } as never));
  return <RouterProvider router={router} />;
}
const draw = (groups: TableGroup[], opened: string[]): Promise<TestTerm> => drawTest(
  <FocusRoot><Routed><DataTable label="Things" data={rows} columns={columns} getRowId={(r) => r.id} groupBy={(r) => r.state} groups={groups} onRowAction={(r) => opened.push(r.id)} /></Routed></FocusRoot>,
  { width: 50, height: 14 },
);
const focusedName = (t: TestTerm) => focusedNode(semanticsOf(t.renderer as never))?.name;
async function tabTo(t: TestTerm, name: string) {
  for (let i = 0; i < 12 && focusedName(t) !== name; i++) { t.mockInput.pressTab(); await t.settle(); }
  expect(focusedName(t)).toBe(name);
}

test('↓ on a folded group the reader opened puts the cursor on its first row; Enter then opens that row', async () => {
  const opened: string[] = [];
  const t = await draw([{ id: 'one', label: 'System programs', defaultCollapsed: true }, { id: 'two', label: 'Mine', defaultCollapsed: true }], opened);
  try {
    await t.settle();
    await tabTo(t, 'System programs 2');
    t.mockInput.pressEnter();
    expect(await t.settle()).toContain('row-a1');
    t.mockInput.pressArrow('down');
    const f = await t.settle();
    expect(f, f).toMatch(/▌ +row-a1/);
    expect(focusedName(t)).not.toBe('System programs 2');
    t.mockInput.pressEnter();
    await t.settle();
    expect(opened).toEqual(['a1']);
    // The group stayed open (the Enter went to the row, not to the header).
    expect(await t.settle()).toContain('row-a2');
  } finally { t.renderer.destroy(); }
}, 20_000);

test('j on an open group header goes to its first row; ↑ and k on a header go to the last row above it', async () => {
  const opened: string[] = [];
  const t = await draw([{ id: 'one', label: 'alpha' }, { id: 'two', label: 'beta' }], opened);
  try {
    await t.settle();
    await tabTo(t, 'beta 2');
    t.mockInput.pressArrow('up');
    let f = await t.settle();
    expect(f, f).toMatch(/▌ +row-a2/);
    await tabTo(t, 'beta 2');
    t.mockInput.pressKey('j');
    f = await t.settle();
    expect(f, f).toMatch(/▌ +row-b1/);
    await tabTo(t, 'beta 2');
    t.mockInput.pressKey('k');
    f = await t.settle();
    expect(f, f).toMatch(/▌ +row-a2/);
    await tabTo(t, 'alpha 2');
    t.mockInput.pressArrow('down');
    f = await t.settle();
    expect(f, f).toMatch(/▌ +row-a1/);
    expect(opened).toEqual([]);
  } finally { t.renderer.destroy(); }
}, 20_000);

test('↑ on the first header and ↓ on a folded last header with nothing under it leave the focus on the header', async () => {
  const opened: string[] = [];
  const t = await draw([{ id: 'one', label: 'alpha' }, { id: 'two', label: 'beta', defaultCollapsed: true }], opened);
  try {
    await t.settle();
    await tabTo(t, 'alpha 2');
    t.mockInput.pressArrow('up');
    await t.settle();
    expect(focusedName(t)).toBe('alpha 2');
    await tabTo(t, 'beta 2');
    const before = await t.settle();
    t.mockInput.pressArrow('down');
    const f = await t.settle();
    expect(focusedName(t)).toBe('beta 2');
    expect(f).toBe(before);
  } finally { t.renderer.destroy(); }
}, 20_000);

// A table in a page that scrolls is as tall as its lines. Opened, a folded group grows it from its one header line: the
// table drew that frame in its old one-line window around the cursor row, left the header out and the focus with it
// (Enter, then ↓, reached nothing).
test('in a page that scrolls, Enter on a folded group keeps the focus on its header, and ↓ then reaches its first row', async () => {
  const many = Array.from({ length: 19 }, (_, i) => ({ id: `p${i}`, name: `prog-${i}`, state: 'sys' }));
  const t = await drawTest(
    <FocusRoot><Routed><PageBody><Box dir="column" shrink={0}>
      <Text>Head</Text>
      <DataTable label="Things" data={many} columns={columns} getRowId={(r) => r.id} groupBy={(r) => r.state} groups={[{ id: 'sys', label: 'System', defaultCollapsed: true }]} />
      <Text>Questions</Text>
    </Box></PageBody></Routed></FocusRoot>,
    { width: 50, height: 14 },
  );
  try {
    await t.settle();
    await tabTo(t, 'System 19');
    t.mockInput.pressEnter();
    let f = await t.settle();
    expect(f).toContain('prog-1');
    expect(focusedName(t), f).toBe('System 19');
    t.mockInput.pressArrow('down');
    f = await t.settle();
    expect(f, f).toMatch(/▌ +prog-0/);
  } finally { t.renderer.destroy(); }
}, 20_000);

// A group opened above the row the cursor is on pushes that row far down: a window that followed the cursor would draw
// the header out and take the focus with it. The header that holds the focus stays drawn, and ↓ reaches its first row.
test('a group opened above the cursor row keeps its focused header drawn, and ↓ then reaches its first row', async () => {
  const data: Row[] = [
    ...Array.from({ length: 20 }, (_, i) => ({ id: `p${i}`, name: `prog-${i}`, state: 'sys' })),
    { id: 'm1', name: 'mine-1', state: 'mine' }, { id: 'm2', name: 'mine-2', state: 'mine' },
  ];
  const t = await drawTest(
    <FocusRoot><Routed><DataTable label="Things" data={data} columns={columns} getRowId={(r) => r.id} groupBy={(r) => r.state} groups={[{ id: 'sys', label: 'System', defaultCollapsed: true }, { id: 'mine', label: 'Mine' }]} /></Routed></FocusRoot>,
    { width: 50, height: 14 },
  );
  try {
    await t.settle();
    await tabTo(t, 'System 20');
    t.mockInput.pressEnter();
    let f = await t.settle();
    expect(focusedName(t), f).toBe('System 20');
    expect(f).toContain('prog-0');
    t.mockInput.pressArrow('down');
    f = await t.settle();
    expect(f, f).toMatch(/▌ +prog-0/);
  } finally { t.renderer.destroy(); }
}, 20_000);

// A grouped view draws a group's header again where its answer comes back to that group (a later run). ↓ and ↑ on the
// later header step from that header: into its own rows and to the row just above it, never from the group's first one.
test('↓ and ↑ on a later header of a group in a grouped view step from that header, not from the first one', async () => {
  const data: Row[] = [{ id: 'a1', name: 'row-a1', state: 'one' }, { id: 'b1', name: 'row-b1', state: 'two' }, { id: 'a2', name: 'row-a2', state: 'one' }];
  const view = {
    rows: data, hasData: true, isLoading: false, isRefreshing: false, error: undefined, searchable: false, chips: [], q: '', setQ: () => {},
    sort: undefined, setSort: () => {}, matched: data.length, total: data.length, canShowMore: false, showMore: () => {},
    selected: new Set<string>(), setSelected: () => {}, activeId: undefined, open: () => {}, getRowId: (r: Row) => r.id,
    contextKey: 'k', groups: [{ id: 'one', label: 'alpha', count: 2 }, { id: 'two', label: 'beta', count: 1 }], groupOf: (r: Row) => r.state,
  };
  const t = await drawTest(<FocusRoot><Routed><DataTable label="Things" view={view as never} columns={columns} /></Routed></FocusRoot>, { width: 50, height: 14 });
  const lineOf = (f: string, re: RegExp) => f.split('\n').findIndex((l) => re.test(l));
  // Tab to the header after beta's (the later "alpha 2"): focused, its line is below row-b1.
  async function toLaterAlpha() {
    let f = '';
    for (let i = 0; i < 12; i++) {
      t.mockInput.pressTab();
      f = await t.settle();
      if (focusedName(t) === 'alpha 2' && lineOf(f, /▌▾ alpha/) > lineOf(f, /row-b1/)) return;
    }
    throw new Error(`the later alpha header was never focused:\n${f}`);
  }
  try {
    let f = await t.settle();
    // Two alpha headers, the later one under row-b1 with row-a2 under it.
    expect(f.match(/alpha · 2/g)?.length, f).toBe(2);
    expect(lineOf(f, /row-a2/), f).toBeGreaterThan(lineOf(f, /row-b1/));
    await toLaterAlpha();
    t.mockInput.pressArrow('down');
    f = await t.settle();
    expect(f, f).toMatch(/▌ +row-a2/);
    await toLaterAlpha();
    t.mockInput.pressArrow('up');
    f = await t.settle();
    expect(f, f).toMatch(/▌ +row-b1/);
  } finally { t.renderer.destroy(); }
}, 20_000);
