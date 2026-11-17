// Key cost at 5,000 rows is asserted as WORK (cell renders per key press, equal to 50 rows and at most a few), so it
// runs on any host load. Milliseconds are printed only, as the "[perf]" line:
//   cd hub && NODE_ENV=test taskset -c 0 bun test --preload ./scripts/term/test-preload.ts src/kit/data/DataTable.term.test.tsx -t "5,000 rows"
import { expect, test } from 'bun:test';
import type { ColumnDef } from '@tanstack/react-table';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Box, FocusRoot, Text } from '../../term/prim';
import { DataTable, type DataTableProps, type RowActionEntry } from './DataTable';
import { ListPaneContext } from '../layouts/pane';
import { PageBody } from '../layouts/termScroll';
import { TableHome } from '../../term/prim/TableHome';
import { Tag } from './Display';
import { MarkCell } from './cells';
import { layoutFaults } from '../../term/prim/layoutcheck';
import { tableFaults } from '../../term/prim/TableCheck';
import { FormStateProvider } from '../forms/lock';

/** What the terminal was asked to copy: the renderer's OSC 52 call, observed in this test only (nothing logs copies). */
function copies(t: TestTerm): string[] {
  const got: string[] = [];
  (t.renderer as unknown as { copyToClipboardOSC52(s: string): boolean }).copyToClipboardOSC52 = (s) => { got.push(s); return true; };
  return got;
}


interface Row { id: string; name: string; state: string; note: string; size: number }
const make = (n: number): Row[] => Array.from({ length: n }, (_, i) => ({ id: `r${i}`, name: `row-${i}`, state: i % 2 ? 'Running' : 'Stopped', note: `note ${i}`, size: (i * 7) % 13 }));
const rows = make(30);
const columns: ColumnDef<Row, any>[] = [
  { id: 'name', header: 'Name', accessorKey: 'name', meta: { pinned: true, list: 'primary' } },
  { id: 'state', header: 'State', accessorKey: 'state', meta: { width: '120px', priority: 1, list: 'status' } },
  { id: 'size', header: 'Size', accessorKey: 'size', meta: { width: '80px', priority: 3, align: 'end' } },
  { id: 'note', header: 'Note', accessorKey: 'note', meta: { width: '160px', priority: 4 } },
  { id: 'card', header: 'Card only', accessorKey: 'note', meta: { table: false } },
];

/** A memory router around the table (the table keeps sort and page in the URL, as on the web). */
function Routed({ children }: { children: ReactNode }) {
  const [router] = useState(() => createRouter({ routeTree: createRootRoute({ component: () => <>{children}</> }), history: createMemoryHistory({ initialEntries: ['/'] }), origin: 'http://localhost' } as never));
  return <RouterProvider router={router} />;
}

function Table(p: Partial<DataTableProps<Row>>) {
  return <DataTable label="Things" data={rows} columns={columns} getRowId={(r) => r.id} {...p} />;
}
const draw = (node: ReactNode, width = 90, height = 14): Promise<TestTerm> => drawTest(<FocusRoot><Routed>{node}</Routed></FocusRoot>, { width, height });
const line = (f: string, re: RegExp) => f.split('\n').find((l) => re.test(l)) ?? '';

test('headers and rows: values separated by spaces only, a card-only column never drawn', async () => {
  const t = await draw(<Table />);
  const f = t.captureCharFrame();
  expect(f).toMatch(/Name\s+State\s+Size\s+Note/);
  expect(f).not.toContain('Card only');
  expect(f).toMatch(/▌ row-0\s+Stopped\s+0\s+note 0/);
  // No box-drawing glyph between two values of a row.
  expect(line(f, /row-3 /)).not.toMatch(/row-3.*[│┃|].*note 3/);
  t.renderer.destroy();
});

test('narrow tables drop by priority (4, then 3); narrower still they become two-line list rows', async () => {
  let t = await draw(<Table />, 50);
  let f = t.captureCharFrame();
  expect(f).toContain('State');
  expect(f).not.toContain('Note');
  t.renderer.destroy();
  t = await draw(<Table />, 30);
  f = t.captureCharFrame();
  // list row: name and status on line 1, the rest under it
  expect(f).toMatch(/row-0\s+Stopped/);
  expect(f).toMatch(/note 0/);
  expect(f).not.toMatch(/Name\s+State/);
  t.renderer.destroy();
});

test('keys: j/k and arrows move, End and Home jump, Enter opens the cursor row with the row itself', async () => {
  const opened: string[] = [];
  const t = await draw(<Table onRowAction={(r) => opened.push(r.id)} />);
  t.mockInput.pressArrow('down');
  t.mockInput.pressKey('j');
  expect(await t.settle()).toMatch(/▌ row-2/);
  t.mockInput.pressKey('k');
  t.mockInput.pressEnter();
  await t.settle();
  expect(opened).toEqual(['r1']);
  t.mockInput.pressKey('\x1b[F');
  let f = await t.settle();
  expect(f).toMatch(/▌ row-29/);
  expect(f).not.toContain('row-0 ');
  t.mockInput.pressKey('\x1b[H');
  f = await t.settle();
  expect(f).toMatch(/▌ row-0/);
  t.renderer.destroy();
});

test('mouse: a click puts the cursor on a row, a second click on it opens it; the wheel scrolls', async () => {
  const opened: string[] = [];
  const t = await draw(<Table onRowAction={(r) => opened.push(r.id)} />);
  const y = t.captureCharFrame().split('\n').findIndex((l) => l.includes('row-3 '));
  await t.mockMouse.click(10, y);
  expect(await t.settle()).toMatch(/▌ row-3/);
  expect(opened).toEqual([]);
  await t.mockMouse.click(10, y);
  await t.settle();
  expect(opened).toEqual(['r3']);
  await t.mockMouse.scroll(10, y, 'down');
  await t.mockMouse.scroll(10, y, 'down');
  const f = await t.settle();
  expect(f).not.toContain('row-0 ');
  t.renderer.destroy();
});

test('sorting: a header press sorts ascending, then descending, with its arrow', async () => {
  const t = await draw(<Table sortParam={false} />);
  const y = t.captureCharFrame().split('\n').findIndex((l) => /Name\s+State/.test(l));
  const x = t.captureCharFrame().split('\n')[y]!.indexOf('Size');
  await t.mockMouse.click(x + 1, y);
  let f = await t.settle();
  expect(f).toMatch(/Size ↑/);
  const sizes = () => t.captureCharFrame().split('\n').filter((l) => /row-\d+/.test(l)).map((l) => Number(/(\d+)\s+note/.exec(l)?.[1]));
  expect(sizes().slice(0, 3)).toEqual([0, 0, 0]);
  await t.mockMouse.click(x + 1, y);
  f = await t.settle();
  expect(f).toMatch(/Size ↓/);
  // A re-order keeps the person's place: the cursor stays on its row (row-0, size 0, now near the end) and the view
  // follows that row, so the rows in view are the low end of the descending order with the cursor mark on row-0.
  const shown = sizes();
  expect(shown).toEqual([...shown].sort((a, b) => b - a));
  expect(shown[shown.length - 1]).toBe(0);
  expect(line(f, /row-0 /)).toMatch(/^[▌›]/);
  t.renderer.destroy();
});

test('selection: Space and x pick, the header box picks all, the bulk bar gets the rows, Esc clears', async () => {
  const bulk: string[][] = [];
  function Pick() {
    const [sel, setSel] = useState<Set<string>>(new Set());
    return <Table selectable selectedIds={sel} onSelectionChange={setSel} bulkActions={(rs) => { bulk.push(rs.map((r) => r.id)); return <Text>do it</Text>; }} />;
  }
  const t = await draw(<Pick />);
  t.mockInput.pressKey(' ');
  t.mockInput.pressArrow('down');
  t.mockInput.pressKey('x');
  let f = await t.settle();
  expect(f).toContain('2 selected');
  expect(f).toMatch(/\[x\] row-0/);
  expect(bulk.at(-1)).toEqual(['r0', 'r1']);
  t.mockInput.pressEscape();
  await new Promise((r) => setTimeout(r, 150)); // a lone ESC is told from a key sequence by a short wait
  f = await t.settle();
  expect(f).not.toContain('selected');
  const y = f.split('\n').findIndex((l) => /Name\s+State/.test(l));
  await t.mockMouse.click(LEADX, y);
  f = await t.settle();
  expect(f).toContain('30 selected');
  t.renderer.destroy();
});
const LEADX = 3;

test('groups: headers with counts, a press folds one; rows under a group are indented', async () => {
  const t = await draw(<Table groupBy={(r) => r.state} groups={[{ id: 'Running', label: 'Running' }, { id: 'Stopped', label: 'Stopped' }]} />, 90, 40);
  let f = t.captureCharFrame();
  expect(f).toMatch(/▾ Running · 15/);
  expect(f).toMatch(/▾ Stopped · 15/);
  const y = f.split('\n').findIndex((l) => l.includes('▾ Running'));
  await t.mockMouse.click(4, y);
  f = await t.settle();
  expect(f).toMatch(/▸ Running · 15/);
  expect(f).not.toContain('row-1 ');
  t.renderer.destroy();
});

test('row actions: the inline word, "." opens the row menu (kit ActionMenu), Down then Enter runs one, a key runs its action', async () => {
  const ran: string[] = [];
  const actions = (r: Row): RowActionEntry[] => [
    { id: 'start', label: `Start ${r.name}`, short: 'Start', inline: true, onAction: () => ran.push(`start:${r.id}`) },
    { id: 'logs', label: 'Logs', key: 'l', onAction: () => ran.push(`logs:${r.id}`) },
    '-',
    { id: 'copy', label: 'Copy name', copy: r.name, onAction: () => ran.push(`copy:${r.id}`) },
    { id: 'del', label: 'Delete', tone: 'danger', opens: true, onAction: () => ran.push(`del:${r.id}`) },
  ];
  const t = await draw(<Table actions={actions} />, 100);
  let f = t.captureCharFrame();
  expect(f).toMatch(/row-0 .*\[Start\] ⋯/);
  t.mockInput.pressKey('.');
  f = await t.settle();
  // the kit ActionMenu opens against the row's ⋯ (a framed list), on its first item
  expect(f).toMatch(/Logs/);
  expect(f).toMatch(/Copy name/);
  expect(f).toMatch(/Delete/);
  t.mockInput.pressArrow('down');
  t.mockInput.pressArrow('down');
  t.mockInput.pressEnter();
  f = await t.settle();
  expect(ran).toEqual(['del:r0']);
  expect(f).not.toMatch(/Copy name/);
  // the focus is back on the table: keys move the cursor and run a row's key
  t.mockInput.pressArrow('down');
  t.mockInput.pressKey('l');
  await t.settle();
  expect(ran).toEqual(['del:r0', 'logs:r1']);
  // Esc closes it without acting
  t.mockInput.pressKey('.');
  await t.settle();
  t.mockInput.pressEscape();
  await new Promise((r) => setTimeout(r, 150));
  f = await t.settle();
  expect(f).not.toMatch(/Copy name/);
  expect(ran).toEqual(['del:r0', 'logs:r1']);
  t.renderer.destroy();
});

test('states: loading, error with Try again, no match with Clear filters, nothing yet', async () => {
  let t = await draw(<Table data={undefined} isLoading />);
  expect(t.captureCharFrame()).toContain('░░░');
  t.renderer.destroy();
  let retried = 0;
  t = await draw(<Table data={undefined} error={new Error('x')} onRetry={() => retried++} />);
  expect(t.captureCharFrame()).toMatch(/✗ Things: This didn't load/);
  const ry = t.captureCharFrame().split('\n').findIndex((l) => l.includes('Try again'));
  await t.mockMouse.click(t.captureCharFrame().split('\n')[ry]!.indexOf('Try again') + 1, ry);
  await t.settle();
  expect(retried).toBe(1);
  t.renderer.destroy();
  t = await draw(<Table data={[]} empty={<Text>No things yet</Text>} />);
  expect(t.captureCharFrame()).toContain('No things yet');
  t.renderer.destroy();
  const chip = { id: 'state', label: 'State', options: [{ value: 'x', label: 'X' }], value: 'x', onChange: () => {} };
  t = await draw(<Table data={[]} filters={[chip]} />);
  expect(t.captureCharFrame()).toContain('Nothing matches these filters');
  t.renderer.destroy();
});

test('paging: pageSize shows a range and the arrows go to the next page', async () => {
  const t = await draw(<Table pageSize={10} />, 90, 18);
  let f = t.captureCharFrame();
  expect(f).toContain('1–10 of 30');
  const y = f.split('\n').findIndex((l) => l.includes('1–10 of 30'));
  const x = f.split('\n')[y]!.indexOf('›');
  await t.mockMouse.click(x, y);
  f = await t.settle();
  expect(f).toContain('11–20 of 30');
  expect(f).toContain('row-10');
  t.renderer.destroy();
});

test('the engine\'s mouse selection over two cells copies the values with the column gap (spaces only), no marks', async () => {
  const t = await draw(<Table />);
  const f = t.captureCharFrame();
  const y = f.split('\n').findIndex((l) => l.includes('row-2 '));
  const l = f.split('\n')[y]!;
  await t.mockMouse.drag(l.indexOf('row-2'), y, l.indexOf('Stopped') + 6, y);
  await t.settle();
  expect(t.renderer.getSelection()?.getSelectedText()).toMatch(/^row-2 {1,2}Stopped$/);
  t.renderer.destroy();
});

/** Renderables the engine holds under the root. */
function nodes(t: TestTerm): number {
  const walk = (r: { getChildren(): unknown[] }): number => r.getChildren().reduce<number>((n, c) => n + 1 + walk(c as { getChildren(): unknown[] }), 0);
  return walk(t.renderer.root as unknown as { getChildren(): unknown[] });
}

/** Work units, not milliseconds: how many cells were rendered (the name column's cell function runs once per row
 *  render). A key press must redraw the same few rows whatever the row count, on any host load. */
let cellRenders = 0;
const countedColumns: ColumnDef<Row, any>[] = columns.map((c) => (c.id === 'name' ? { ...c, cell: (x: { getValue(): unknown }) => { cellRenders++; return String(x.getValue()); } } : c));
async function keyMedian(n: number): Promise<{ first: number; median: number; t: TestTerm; work: number[] }> {
  const t0 = performance.now();
  const t = await draw(<Table data={make(n)} columns={countedColumns} />, 90, 20);
  const first = performance.now() - t0;
  const times: number[] = [];
  const work: number[] = [];
  for (let i = 0; i < 40; i++) {
    const s = performance.now();
    cellRenders = 0;
    t.mockInput.pressArrow(i % 20 < 10 ? 'down' : 'up');
    await t.renderOnce();
    times.push(performance.now() - s);
    work.push(cellRenders);
  }
  times.sort((a, b) => a - b);
  return { first, median: times[20]!, t, work };
}

test('5,000 rows: only the lines in view are drawn; End reaches the last, the scrollbar thumb at the bottom; a key costs what it costs with 50', async () => {
  const s50 = await keyMedian(50);
  const small = { median: s50.median, nodes: nodes(s50.t), work: s50.work };
  s50.t.renderer.destroy();
  const { first, median, t, work } = await keyMedian(5000);
  expect(t.captureCharFrame()).toContain('row-0 ');
  t.mockInput.pressKey('\x1b[F');
  const f = await t.settle();
  expect(f).toMatch(/▌ row-4999/);
  const bar = f.split('\n').map((l) => l.trimEnd().at(-1));
  expect(bar.filter((c) => c === '█').length).toBe(1);
  expect(bar.lastIndexOf('█')).toBeGreaterThan(bar.indexOf('░'));
  const load = (await import('node:os')).loadavg()[0]!.toFixed(0);
  console.log(`[perf] load ${load}: 5000 rows first draw ${first.toFixed(0)} ms, ${nodes(t)} engine nodes (${small.nodes} at 50 rows); key press (React + one engine frame) median ${median.toFixed(1)} ms vs ${small.median.toFixed(1)} ms at 50 rows`);
  // Virtual rows: the engine holds as many nodes for 5,000 rows as for 50 (only the lines in view exist).
  expect(nodes(t)).toBeLessThanOrEqual(small.nodes + 5);
  // The cost of a key, deterministic on any host load: the same cell renders per press at 5,000 rows as at 50, and
  // only a few (the rows whose cursor state changed, plus any scrolled into view), never a pass over every row.
  expect(work).toEqual(small.work);
  expect(Math.max(...work)).toBeLessThanOrEqual(4);
  t.renderer.destroy();
}, 60000);

test('"/" focuses the search; typing filters; Esc gives the keys back to the rows', async () => {
  const t = await draw(<Table search="Search things" />);
  t.mockInput.pressKey('/');
  await t.settle();
  for (const c of 'row-2') t.mockInput.pressKey(c);
  let f = await t.settle();
  expect(f).toMatch(/row-2 /);
  expect(f).not.toMatch(/row-1 /);
  t.mockInput.pressEscape();
  await new Promise((r) => setTimeout(r, 150));
  await t.settle();
  t.mockInput.pressKey('j');
  f = await t.settle();
  // j moved the cursor (row-20 is the second match), it was not typed into the search
  expect(f).toMatch(/▌ row-20/);
  expect(f).not.toContain('row-2j');
  t.renderer.destroy();
});

test('streamed updates: the cursor stays on the same row id when rows arrive above it or the order changes', async () => {
  let push: (r: Row[]) => void = () => {};
  function Live() {
    const [data, setData] = useState(rows.slice(0, 10));
    push = setData;
    return <Table data={data} />;
  }
  const t = await draw(<Live />);
  t.mockInput.pressArrow('down');
  t.mockInput.pressArrow('down');
  expect(await t.settle()).toMatch(/▌ row-2 /);
  push([{ id: 'n1', name: 'new-1', state: 'Running', note: '', size: 1 }, { id: 'n2', name: 'new-2', state: 'Running', note: '', size: 1 }, ...rows.slice(0, 10)]);
  expect(await t.settle()).toMatch(/▌ row-2 /);
  push([...rows.slice(0, 10)].reverse());
  expect(await t.settle()).toMatch(/▌ row-2 /);
  // the row is gone: the cursor keeps its place (clamped), on a row that exists
  push(rows.slice(0, 10).filter((r) => r.id !== 'r2'));
  expect(await t.settle()).toMatch(/▌ row-\d+ /);
  t.renderer.destroy();
});

test('a control inside a row: its press does its own thing and never opens the row', async () => {
  const opened: string[] = [];
  const pressed: string[] = [];
  const withButton: ColumnDef<Row, any>[] = [
    ...columns.slice(0, 2),
    { id: 'act', header: 'Act', meta: { width: '80px' }, cell: (c) => <Box dir="row" onPress={() => pressed.push(c.row.original.id)}><Text>[Go]</Text></Box> },
  ];
  const t = await draw(<Table columns={withButton} onRowAction={(r) => opened.push(r.id)} />);
  const lines = t.captureCharFrame().split('\n');
  const y = lines.findIndex((l) => l.includes('row-0 '));
  const x = lines[y]!.indexOf('[Go]');
  await t.mockMouse.click(x + 1, y);
  await t.settle();
  await t.mockMouse.click(x + 1, y);
  await t.settle();
  expect(pressed).toEqual(['r0', 'r0']);
  expect(opened).toEqual([]);
  t.renderer.destroy();
});

test('a table that goes from rows to nothing, to an error, and back keeps its hooks (no early return before a hook)', async () => {
  let set: (p: Partial<DataTableProps<Row>>) => void = () => {};
  function Live() {
    const [p, setP] = useState<Partial<DataTableProps<Row>>>({});
    set = setP;
    return <Table {...p} />;
  }
  const t = await draw(<Live />);
  expect(t.captureCharFrame()).toContain('row-0 ');
  set({ data: [], empty: <Text>No things yet</Text> });
  expect(await t.settle()).toContain('No things yet');
  set({ data: undefined, error: new Error('x'), onRetry: () => {} });
  expect(await t.settle()).toMatch(/Try again/);
  set({});
  expect(await t.settle()).toContain('row-0 ');
  t.renderer.destroy();
});

test('the row menu keeps its groups: a separator between them, none first, last or doubled', async () => {
  const actions = (): RowActionEntry[] => ['-', { id: 'logs', label: 'Logs', onAction: () => {} }, '-', '-', { id: 'del', label: 'Delete', tone: 'danger', onAction: () => {} }, '-'];
  const t = await draw(<Table actions={actions} />, 100, 16);
  t.mockInput.pressKey('.');
  const f = await t.settle();
  const lines = f.split('\n');
  const a = lines.findIndex((l) => l.includes('Logs'));
  const b = lines.findIndex((l) => l.includes('Delete'));
  expect(b - a).toBe(2); // one separator line between the two groups
  t.renderer.destroy();
});

test('returnTo: the row whose detail closed gets the cursor and the focus, on mount and on each later close', async () => {
  let set: (r: { id: string; n: number }) => void = () => {};
  function Pane() {
    const [returnTo, setR] = useState({ id: 'r5', n: 1 });
    set = setR;
    return <ListPaneContext.Provider value={{ list: true, returnTo }}><Table /></ListPaneContext.Provider>;
  }
  const t = await draw(<Pane />);
  expect(await t.settle()).toMatch(/▌ row-5 /);
  t.mockInput.pressArrow('down');
  expect(await t.settle()).toMatch(/▌ row-6 /);
  set({ id: 'r2', n: 2 });
  // the table had the focus: the cursor stays where the person put it
  expect(await t.settle()).toMatch(/▌ row-6 /);
  t.renderer.destroy();
});

test('ListPane presentation "list": list rows beside a detail, whatever the width', async () => {
  const t = await draw(<ListPaneContext.Provider value={{ presentation: 'list' }}><Table /></ListPaneContext.Provider>, 120);
  const f = await t.settle();
  expect(f).not.toMatch(/Name\s+State/);
  expect(f).toMatch(/note 0/);
  t.renderer.destroy();
});

test('a secondary tag shows on every row where it fits whole, and gives way only where it does not', async () => {
  // Schedules: one long name ("POST hooks.example.org") must not hide the kind tag of every short name in the column.
  const named = [
    { ...rows[0]!, id: 'a', name: 'ab' },
    { ...rows[1]!, id: 'b', name: 'a-much-longer-name-here' },
  ];
  const cols: ColumnDef<Row, any>[] = [
    { id: 'name', header: 'Name', meta: { width: '240px' }, cell: (c) => <span>{c.row.original.name} <Tag>Script</Tag></span> },
    { id: 'state', header: 'State', accessorKey: 'state', meta: { width: '120px' } },
  ];
  const at = async (width: number) => {
    const t = await draw(<Table data={named} columns={cols} />, width, 8);
    // A tag measures its room after layout: let the frames settle (the decision lands within a couple of frames).
    let f = await t.settle();
    for (let i = 0; i < 6; i++) { await new Promise((r) => setTimeout(r, 30)); f = await t.settle(); }
    t.renderer.destroy();
    return f;
  };
  const wide = await at(90);
  expect(line(wide, /ab /)).toContain(' Script ');
  expect(line(wide, /much-longer/)).toContain(' Script ');
  const narrow = await at(32);
  expect(line(narrow, /ab /)).toContain('Script');
  // where it does not fit it is gone whole: never a part of it
  expect(line(narrow, /a-much/)).not.toMatch(/Scr|ipt/);
});

test('first focus: a table in a page body takes it only as the page list (pane.list), never inside a section', async () => {
  const at = async (list: boolean) => {
    const t = await draw(<PageBody><Box dir="column"><Text>Password</Text><ListPaneContext.Provider value={list ? { list: true } : {}}><Table data={rows.slice(0, 3)} /></ListPaneContext.Provider></Box></PageBody>, 90, 12);
    const f = await t.settle();
    t.renderer.destroy();
    return f;
  };
  expect(await at(true)).toContain('▌ row-0');
  expect(await at(false)).not.toContain('▌ row-0');
});

test('first focus: the table of a page-wide table area (TableHome) takes it in a scrolling page body; ↓ moves its cursor', async () => {
  const at = async (home: boolean) => {
    const table = <Box dir="column"><Table data={rows.slice(0, 3)} /><Text>Questions</Text></Box>;
    const t = await draw(<PageBody>{home ? <TableHome>{table}</TableHome> : table}</PageBody>, 90, 12);
    await t.settle();
    t.mockInput.pressArrow('down');
    const f = await t.settle();
    t.renderer.destroy();
    return f;
  };
  expect(await at(true)).toContain('▌ row-1');
  expect(await at(false)).not.toContain('▌ row-1');
});

test('list rows: names start in one column (MarkCell gutter), meta sits under the name text, a row with no meta is one line', async () => {
  const data = [
    { ...rows[0]!, id: 'a', name: 'flagged', note: '' },
    { ...rows[1]!, id: 'b', name: 'plain', note: '8000 · up' },
    { ...rows[2]!, id: 'c', name: 'quiet', note: '' },
  ];
  const cols: ColumnDef<Row, any>[] = [
    { id: 'name', header: 'Name', meta: { list: 'primary' }, cell: (c) => <MarkCell mark={c.row.original.id === 'a' ? <Text>!</Text> : null}>{c.row.original.name}</MarkCell> },
    { id: 'state', header: 'State', accessorKey: 'state', meta: { list: 'status' } },
    { id: 'note', header: 'Note', meta: { list: 'meta' }, cell: (c) => c.row.original.note },
  ];
  const t = await draw(<Table data={data} columns={cols} presentation="list" />, 60, 10);
  let f = await t.settle();
  for (let i = 0; i < 6; i++) { await new Promise((r) => setTimeout(r, 30)); f = await t.settle(); }
  t.renderer.destroy();
  const ls = f.split('\n');
  const at = (re: RegExp) => ls.findIndex((l) => re.test(l));
  const col = (re: RegExp) => { const l = ls[at(re)]!; return l.search(re); };
  expect(col(/flagged/)).toBe(col(/plain/));
  expect(col(/quiet/)).toBe(col(/plain/));
  expect(col(/8000/)).toBe(col(/plain/));
  // No blank second line for rows with nothing to say there (80x24-like height: no gap either).
  expect(at(/plain/)).toBe(at(/flagged/) + 1);
  expect(at(/8000/)).toBe(at(/plain/) + 1);
  expect(at(/quiet/)).toBe(at(/8000/) + 1);
});

test('list rows: one blank line between rows only in normal density on a terminal taller than 30 rows', async () => {
  const at = async (h: number, density?: 'compact') => {
    const t = await draw(<Table data={rows.slice(0, 3)} presentation="list" density={density} />, 60, h);
    let f = await t.settle();
    for (let i = 0; i < 4; i++) { await new Promise((r) => setTimeout(r, 30)); f = await t.settle(); }
    t.renderer.destroy();
    const ls = f.split('\n');
    return ls.findIndex((l) => /row-1/.test(l)) - ls.findIndex((l) => /row-0/.test(l));
  };
  // Each row here has a meta line (note), so a row is 2 lines, 3 with the gap.
  expect(await at(24)).toBe(2);
  expect(await at(40)).toBe(3);
  expect(await at(40, 'compact')).toBe(2);
});

test('a group header keeps its name and count whole; its words (plain or an element) give way at their end with one "…"', async () => {
  const text = 'This computer is stopped. Start it from Computers to see its notes';
  const t = await draw(<Table data={rows.slice(0, 4)} groupBy={(r) => r.state} groups={[{ id: 'Running', label: 'cedar-notes-01', text }, { id: 'Stopped', label: 'fjordline-02', text: <span>{text}</span> }]} />, 48, 40);
  const f = await t.settle();
  t.renderer.destroy();
  for (const name of ['cedar-notes-01', 'fjordline-02']) {
    const l = line(f, new RegExp(`▾ ${name} `));
    expect(l).toMatch(new RegExp(`▾ ${name} · \\d+ This computer[^…]*…`));
  }
});

test('cards drawn as list rows leave out `card: false` columns (the card markup holds what they show) and keep data-lead-dup', async () => {
  const cols: ColumnDef<Row, any>[] = [
    { id: 'dot', header: 'Dot', meta: { list: 'lead', table: false, card: false }, cell: () => <Text>◆</Text> },
    { id: 'name', header: 'Name', accessorKey: 'name', meta: { pinned: true, list: 'primary' }, cell: (c) => <span><span data-lead-dup="">◆ </span>{c.row.original.name}</span> },
  ];
  const t = await draw(<Table data={rows.slice(0, 2)} columns={cols} presentation="cards" />, 60, 10);
  const f = await t.settle();
  t.renderer.destroy();
  expect(line(f, /row-0/)).toContain('◆ row-0');
  expect(line(f, /row-0/).match(/◆/g)?.length).toBe(1);
});

test('list rows leave out a page\'s data-lead-dup mark (the lead column draws it); a table row keeps it', async () => {
  const cols: ColumnDef<Row, any>[] = [
    { id: 'dot', header: 'Dot', meta: { list: 'lead', table: false }, cell: () => <Text>◆</Text> },
    { id: 'name', header: 'Name', accessorKey: 'name', meta: { pinned: true, list: 'primary' }, cell: (c) => <span><span data-lead-dup="">◆ </span>{c.row.original.name}</span> },
  ];
  const t = await draw(<Table data={rows.slice(0, 2)} columns={cols} presentation="list" />, 60, 10);
  const f = await t.settle();
  t.renderer.destroy();
  expect(line(f, /row-0/)).toMatch(/◆ +row-0/);
  expect(line(f, /row-0/).match(/◆/g)?.length).toBe(1);
  const t2 = await draw(<Table data={rows.slice(0, 2)} columns={cols} presentation="table" />, 60, 10);
  const f2 = await t2.settle();
  t2.renderer.destroy();
  expect(line(f2, /row-0/)).toContain('◆ row-0');
});

test('list rows: a rail (beside the page or flush) is always compact, at every height', async () => {
  const at = async (h: number, pane: { rail?: boolean; flush?: boolean }) => {
    const t = await draw(<ListPaneContext.Provider value={{ presentation: 'list', ...pane }}><Table data={rows.slice(0, 3)} presentation="list" /></ListPaneContext.Provider>, 60, h);
    let f = await t.settle();
    for (let i = 0; i < 4; i++) { await new Promise((r) => setTimeout(r, 30)); f = await t.settle(); }
    t.renderer.destroy();
    const ls = f.split('\n');
    return ls.findIndex((l) => /row-1/.test(l)) - ls.findIndex((l) => /row-0/.test(l));
  };
  // A row with a meta line is 2 lines; no blank third line in a rail, on a short or a tall screen.
  for (const h of [24, 40, 60]) {
    expect(await at(h, { rail: true })).toBe(2);
    expect(await at(h, { rail: true, flush: true })).toBe(2);
  }
  // The same list outside a rail keeps the tall-screen spacing (full-width tables are unchanged).
  expect(await at(40, {})).toBe(3);
}, 30_000); // seven draws: about 5 s on a loaded host (default 5 s)

test('list rows: an element meta part with no colour of its own draws in the dim tone', async () => {
  const cols: ColumnDef<Row, any>[] = [
    { id: 'name', header: 'Name', accessorKey: 'name', meta: { list: 'primary' } },
    { id: 'note', header: 'Note', meta: { list: 'meta' }, cell: (c) => <Text>{`meta ${c.row.original.id}`}</Text> },
  ];
  const t = await draw(<Table data={rows.slice(0, 2)} columns={cols} presentation="list" />, 60, 8);
  await t.settle();
  const f = await t.settle();
  const y = f.split('\n').findIndex((l) => l.includes('meta r1'));
  const x = f.split('\n')[y]!.indexOf('meta r1');
  const spans = t.captureSpans().lines[y]!.spans;
  let at = 0;
  const span = spans.find((s) => { const hit = at <= x && x < at + s.text.length; at += s.text.length; return hit; })!;
  const ink = t.captureSpans().lines[y - 1]!.spans.find((s) => s.text.includes('row-1'))!;
  expect(span.fg).not.toEqual(ink.fg);
  t.renderer.destroy();
});

test('list rows: a cell function answering plain words also draws in the dim tone', async () => {
  const cols: ColumnDef<Row, any>[] = [
    { id: 'name', header: 'Name', accessorKey: 'name', meta: { list: 'primary' } },
    { id: 'note', header: 'Note', meta: { list: 'meta' }, cell: (c) => `words ${c.row.original.id}` },
  ];
  const t = await draw(<Table data={rows.slice(0, 2)} columns={cols} presentation="list" />, 60, 8);
  await t.settle();
  const f = await t.settle();
  const y = f.split('\n').findIndex((l) => l.includes('words r1'));
  const word = t.captureSpans().lines[y]!.spans.find((s) => s.text.includes('words'))!;
  const ink = t.captureSpans().lines[y - 1]!.spans.find((s) => s.text.includes('row-1'))!;
  expect(word.fg).not.toEqual(ink.fg);
  t.renderer.destroy();
});

test('wide characters (CJK, emoji) never shift the columns after them', async () => {
  const data = [
    { ...rows[0]!, id: 'a', name: 'plain-name', state: 'Running' },
    { ...rows[1]!, id: 'b', name: '日本語の名前です', state: 'Running' },
    { ...rows[2]!, id: 'c', name: 'party 🎉 time', state: 'Running' },
  ];
  const t = await draw(<Table data={data} />, 90, 8);
  const f = await t.settle();
  t.renderer.destroy();
  const ls = f.split('\n');
  // Column positions in CELLS (a CJK character is two cells), so compare by display width up to "Running".
  const cellCol = (l: string) => { let w = 0; for (const ch of l.slice(0, l.indexOf('Running'))) w += /[　-鿿\u{1F300}-\u{1FAFF}]/u.test(ch) ? 2 : 1; return w; };
  const cols = ['plain-name', '日本語', 'party'].map((k) => cellCol(ls.find((l) => l.includes(k))!));
  expect(new Set(cols).size).toBe(1);
  expect(cellCol(ls.find((l) => /State/.test(l))!.replace('State', 'Running'))).toBe(cols[0]!);
});

test('list rows in groups: a table that fits shows every row, no scrollbar (height counts meta lines and gaps)', async () => {
  const data = [
    { ...rows[0]!, id: 'a', name: 'alpha', note: '' },
    { ...rows[1]!, id: 'b', name: 'bravo', note: '' },
    { ...rows[2]!, id: 'c', name: 'charlie', note: 'has meta' },
    { ...rows[3]!, id: 'd', name: 'delta', note: 'has meta' },
    { ...rows[4]!, id: 'e', name: 'echo', note: '' },
  ];
  const cols: ColumnDef<Row, any>[] = [
    { id: 'name', header: 'Name', accessorKey: 'name', meta: { list: 'primary' } },
    { id: 'note', header: 'Note', accessorKey: 'note', cell: (c) => c.getValue() || null, meta: { list: 'meta' } },
  ];
  const t = await draw(<Box dir="column" grow={1}><Table data={data} columns={cols} presentation="list" groupBy={(r) => r.id < 'b' ? 'one' : r.id < 'd' ? 'two' : r.id < 'e' ? 'three' : 'four'} /><Text>AFTER</Text></Box>, 100, 40);
  const f = await t.settle();
  t.renderer.destroy();
  for (const n of ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'AFTER']) expect(f).toContain(n);
});

test('a search hint longer than its box ends in one "…", never cut mid-word without a mark', async () => {
  const t = await draw(<Table search="Search path, summary or description of the thing" />, 100, 10);
  const f = await t.settle();
  t.renderer.destroy();
  const l = line(f, /Search path/);
  expect(l).toMatch(/Search path[^…]*…/);
  expect(l).not.toContain('description');
});

test('a filling list in a box sized by its content takes the lines it needs (never stuck at its first window)', async () => {
  const data = Array.from({ length: 12 }, (_, i) => ({ ...rows[i]!, id: `z${i}`, name: `item-${i}` }));
  const cols: ColumnDef<Row, any>[] = [{ id: 'name', header: 'Name', accessorKey: 'name', meta: { list: 'primary' } }];
  // 4 groups + 12 one-line rows with a blank line each (40 rows tall) = 28 lines, more than the first window of 20.
  const t = await draw(<Box dir="column"><Box dir="column"><Table data={data} columns={cols} presentation="list" groupBy={(r) => String(Number(r.id.slice(1)) % 4)} /></Box><Text>AFTER</Text></Box>, 100, 40);
  const f = await t.settle();
  t.renderer.destroy();
  for (let i = 0; i < 12; i++) expect(f).toContain(`item-${i}`);
  expect(f).toContain('AFTER');
  expect(f).not.toContain('░');
});

test('a narrow toolbar (a 24-cell rail, a long filter value) wraps: nothing laid out past its box', async () => {
  const long = { id: 'state', label: 'State', options: [{ value: 'x', label: 'A very long filter value that never fits' }], value: 'x', onChange: () => {} };
  const two = { id: 'size', label: 'Size', options: [{ value: 'y', label: 'Y' }], value: undefined, onChange: () => {} };
  for (const width of [24, 40, 96]) {
    const t = await draw(<Table search="Search things" filters={[long, two]} onRefresh={() => {}} />, width, 16);
    await t.settle();
    const faults = layoutFaults((t.renderer as unknown as { root: never }).root, { cols: width, rows: 16 }).filter((f) => f.kind === 'cut' || f.kind === 'overdraw');
    const fr = t.captureCharFrame();
    t.renderer.destroy();
    if (faults.length) expect(JSON.stringify(fr.split('\n').slice(0, 10))).toBe('');
    expect(faults.map((f) => `${width}: ${f.kind} ${f.path} ${f.detail}`)).toEqual([]);
  }
});

test('an element cell (a name and a dim note) wider than its column is cut with one "…" at the end, never a stump', async () => {
  const data = rows.slice(0, 3).map((r, i) => ({ ...r, name: i === 1 ? 'copy' : r.name, note: i === 1 ? "Can't open here yet" : '' }));
  const cols: ColumnDef<Row, any>[] = [
    { id: 'name', header: 'Name', accessorKey: 'name', meta: { width: '160px' }, cell: (c) => <Box dir="row" gap={1}><Text shrink={0}>{c.row.original.name}</Text>{c.row.original.note ? <Text dim>{c.row.original.note}</Text> : null}</Box> },
    { id: 'state', header: 'State', accessorKey: 'state', meta: { size: 'fill' } },
  ];
  for (const width of [40, 60]) {
    const t = await draw(<Table data={data} columns={cols} />, width, 10);
    await t.settle();
    let f = t.captureCharFrame();
    for (let i = 0; i < 3; i++) { await new Promise((r) => setTimeout(r, 30)); f = await t.settle(); }
    const faults = tableFaults((t.renderer as unknown as { root: never }).root, { cols: width, rows: 10 });
    t.renderer.destroy();
    expect(faults.map((x) => `${width}: ${x.kind} ${x.detail}`)).toEqual([]);
    const row = line(f, /copy/);
    // Either the whole note, or the words up to the cut and one "…" (never "copy Can't open" with no mark).
    expect(row).toMatch(/copy Can't open here yet|copy Can't[^…]*…/);
  }
});

test('a name cell (MarkCell) whose tag gives way shows the whole name or cuts it with "…", never a word-wrapped stump', async () => {
  const names = ['ping-api', 'queue-drain', 'Watch the build', 'POST hooks.example.org', 'Nightly backup of every computer'];
  const data = names.map((n, i) => ({ ...rows[i]!, id: `n${i}`, name: n }));
  const cols: ColumnDef<Row, any>[] = [
    { id: 'name', header: 'Name', accessorKey: 'name', meta: { pinned: true, list: 'primary' }, cell: (c) => <MarkCell mark={c.row.index % 2 ? <Text>!</Text> : undefined} after={<Tag>{c.row.index === 3 ? 'curl' : 'cron'}</Tag>}>{c.getValue() as string}</MarkCell> },
    { id: 'state', header: 'State', accessorKey: 'state', meta: { width: '200px', priority: 1 } },
    { id: 'note', header: 'Note', accessorKey: 'note', meta: { width: '200px', priority: 2 } },
  ];
  for (const width of [64, 80, 120]) {
    const t = await draw(<Table data={data} columns={cols} />, width, 12);
    await t.settle();
    const faults = tableFaults((t.renderer as unknown as { root: never }).root, { cols: width, rows: 12 });
    const f = t.captureCharFrame();
    t.renderer.destroy();
    expect(faults.map((x) => `${width}: ${x.kind} ${x.detail}`)).toEqual([]);
    expect(f).toMatch(/POST hooks\.example\.org|POST hook[^ ]*…/);
  }
});

// The table's guards: a locked form freezes the selection, a closed detail is never reopened by a pending follow, and
// the View menu moves by keys over every line and never lets a line the screen cut off be focused or picked.
const gRows: Row[] = make(8);
const gColumns: ColumnDef<Row, any>[] = [
  { id: 'name', header: 'Name', accessorKey: 'name', meta: { pinned: true, list: 'primary' } },
  { id: 'state', header: 'State', accessorKey: 'state', meta: { width: '120px', priority: 1, list: 'status' } },
];
// Many hideable columns: a View menu taller than a short terminal.
const extra = Array.from({ length: 14 }, (_, i) => `c${String(i).padStart(2, '0')}`);
const manyColumns: ColumnDef<Row, any>[] = [
  ...gColumns,
  ...extra.map((id): ColumnDef<Row, any> => ({ id, header: `Col ${id}`, accessorFn: () => id, meta: { width: '40px', priority: 4, defaultHidden: true } })),
];

function GTable(p: Partial<DataTableProps<Row>>) {
  return <DataTable label="Things" data={gRows} columns={gColumns} getRowId={(r) => r.id} {...p} />;
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Opens the View menu with a click on its word. */
async function openView(t: TestTerm): Promise<string> {
  const f = await t.settle();
  const lines = f.split('\n');
  const y = lines.findIndex((l) => l.includes('View'));
  expect(y).toBeGreaterThanOrEqual(0);
  await t.mockMouse.click(lines[y]!.indexOf('View'), y);
  return t.settle();
}
const focusedLine = (f: string) => f.split('\n').find((l) => l.includes('▸')) ?? '';

test('inside a locked form no key or command changes the selection (the web table blocks it)', async () => {
  const changes: string[][] = [];
  function Locked() {
    const [sel, setSel] = useState<Set<string>>(new Set(['r3']));
    return (
      <FormStateProvider value={{ locked: true, busy: true, outcome: null }}>
        <GTable selectable selectedIds={sel} onSelectionChange={(s) => { changes.push([...s]); setSel(s); }} />
      </FormStateProvider>
    );
  }
  const t = await draw(<Locked />);
  t.mockInput.pressKey(' ');
  t.mockInput.pressArrow('down');
  t.mockInput.pressKey('x');
  t.mockInput.pressArrow('down', { shift: true });
  t.mockInput.pressEscape();
  await wait(150);
  const f = await t.settle();
  expect(changes).toEqual([]);
  expect(f).toMatch(/\[x\] row-3/);
  expect(f).toMatch(/\[ \] row-0/);
  t.renderer.destroy();
}, 60_000);

test('a detail closed while the cursor\'s follow is pending stays closed', async () => {
  let close = () => {};
  const follows: string[] = [];
  function Pane() {
    const [open, setOpen] = useState<string | undefined>('r0');
    close = () => setOpen(undefined);
    const follow = (id: string) => { follows.push(id); setOpen(id); };
    return <ListPaneContext.Provider value={{ list: true, ...(open ? { follow } : {}) }}><GTable /></ListPaneContext.Provider>;
  }
  const t = await draw(<Pane />);
  await t.settle();
  // The detail closes right after the move, before the follow's 150 ms pause ends.
  t.mockInput.pressArrow('down');
  close();
  await t.settle();
  await wait(300);
  await t.settle();
  expect(follows).toEqual([]);
  t.renderer.destroy();
}, 60_000);

test('an open row closed while its row action follow is pending is not opened again', async () => {
  let close = () => {};
  const acted: string[] = [];
  // A data view holding an open row (the fields the terminal table reads), its open row in state.
  function Viewed() {
    const [open, setOpen] = useState<string | undefined>('r0');
    close = () => setOpen(undefined);
    const view = {
      rows: gRows, hasData: true, isLoading: false, isRefreshing: false, error: undefined, searchable: false, chips: [], q: '', setQ: () => {},
      sort: undefined, setSort: () => {}, matched: gRows.length, total: gRows.length, canShowMore: false, showMore: () => {},
      selected: new Set<string>(), setSelected: () => {}, activeId: open, open: (id: string | undefined) => setOpen(id), getRowId: (r: Row) => r.id,
      contextKey: 'k', groups: undefined, groupOf: undefined,
    };
    return <DataTable label="Things" view={view as never} columns={gColumns} onRowAction={(r) => acted.push(r.id)} />;
  }
  const t = await draw(<Viewed />);
  await t.settle();
  // The open row closes right after the move, before the row action's 150 ms pause ends.
  t.mockInput.pressArrow('down');
  close();
  await t.settle();
  await wait(300);
  await t.settle();
  expect(acted).toEqual([]);
  t.renderer.destroy();
}, 60_000);

test('in the View menu Down and Up move over every line and wrap', async () => {
  const t = await draw(<GTable />, 90, 20);
  let f = await openView(t);
  expect(focusedLine(f)).toContain('Name');
  t.mockInput.pressArrow('down');
  f = await t.settle();
  expect(focusedLine(f)).toContain('State');
  t.mockInput.pressArrow('down');
  f = await t.settle();
  expect(focusedLine(f)).toContain('State');
  expect(focusedLine(f)).toContain('[');
  t.mockInput.pressArrow('up');
  t.mockInput.pressArrow('up');
  f = await t.settle();
  expect(focusedLine(f)).toContain('Name');
  t.renderer.destroy();
}, 60_000);

test('on a short terminal the View menu\'s focused line is always drawn, and a pick is a drawn line', async () => {
  const t = await draw(<DataTable label="Things" data={gRows} columns={manyColumns} getRowId={(r) => r.id} />, 90, 12);
  let f = await openView(t);
  expect(focusedLine(f)).not.toBe('');
  // Up from the first line wraps to the last, far below the screen's last row: the panel scrolls to it.
  t.mockInput.pressArrow('up');
  f = await t.settle();
  expect(focusedLine(f)).toContain('[ ] Col c13');
  // The pick adds a "Sort by" line above it; the picked line stays in view.
  t.mockInput.pressEnter();
  f = await t.settle();
  expect(focusedLine(f)).toContain('[x] Col c13');
  // Every line reached by Down stays drawn while it holds the focus.
  for (let i = 0; i < 20; i++) {
    t.mockInput.pressArrow('down');
    f = await t.settle();
    expect(focusedLine(f)).not.toBe('');
  }
  t.renderer.destroy();
}, 60_000);

// A row made active from outside (a deep link: `activeId` with no key or click) is brought into view and holds the
// cursor, however far down it is; the cursor moving alone is never taken for a wheel step (that swapped cursor and
// view back and forth: React's "Maximum update depth exceeded", the list left at its top).
test('a far row made active from outside is in view and holds the cursor; no update loop', async () => {
  const said: string[] = [];
  const real = console.error;
  console.error = (...a: unknown[]) => { said.push(a.map(String).join(' ').split('\n')[0]!); };
  try {
    const far: Row[] = make(400).map((r, i) => ({ ...r, name: `endpoint-${String(i).padStart(3, '0')}` }));
    const t = await drawTest(<FocusRoot><Routed><DataTable label="Endpoints" presentation="table" bare data={far} columns={[columns[0]!]} getRowId={(r) => r.id} activeId="r371" onRowAction={() => {}} /></Routed></FocusRoot>, { width: 60, height: 16 });
    await t.settle();
    await wait(600);
    const f = await t.settle();
    t.renderer.destroy();
    expect(f).toContain('endpoint-371');
    expect(f).not.toContain('endpoint-000');
    expect(line(f, /endpoint-371/)).toMatch(/[▌›]/);
  } finally {
    console.error = real;
  }
  expect(said.filter((m) => m.includes('Maximum update depth'))).toEqual([]);
}, 60_000);
