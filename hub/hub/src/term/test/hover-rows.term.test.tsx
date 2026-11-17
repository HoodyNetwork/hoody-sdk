// Hover on rows (prim/Hover.ts): the row of a table or a list under the pointer stands on the `hover` ground from its
// first cell to its last, and nothing else about it changes. The cursor's row keeps `selected`. The words of the
// table's chrome (a header that sorts, Refresh) take the ground too; an ItemList title that opens something takes it,
// a title that is only text does not.
import { afterEach, expect, test } from 'bun:test';
import type { ColumnDef } from '@tanstack/react-table';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { drawTest, type TestTerm } from '../prim/testing';
import { FocusRoot } from '../prim';
import { __resetHover } from '../prim/Hover';
import { TRUECOLOR } from '../prim/tokens';
import { DataTable } from '../../kit/data/DataTable';
import { ItemList } from '../../kit/layouts/anatomy/ItemList';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; __resetHover(); });

const dark = TRUECOLOR.dark;
const hex = (c: { toInts(): number[] }): string => '#' + c.toInts().slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('');
/** The background of the cell at column x of row y. */
function bgAt(x: number, y: number): string {
  let c = 0;
  for (const sp of t!.captureSpans().lines[y]!.spans) {
    const w = (sp as { width?: number }).width ?? [...sp.text].length;
    if (x < c + w) return hex(sp.bg);
    c += w;
  }
  throw new Error(`no cell at ${x},${y}`);
}
/** Where a word is drawn: its row and the column of its first letter. */
function at(frame: string, word: string): { x: number; y: number } {
  const lines = frame.split('\n');
  const y = lines.findIndex((l) => l.includes(word));
  expect(y, frame).toBeGreaterThanOrEqual(0);
  return { x: lines[y]!.indexOf(word), y };
}
/** Moves the pointer onto a word; the frame's text must not change. Says where the word is. */
async function over(word: string): Promise<{ x: number; y: number }> {
  const rest = await t!.settle();
  const p = at(rest, word);
  await t!.mockMouse.moveTo(p.x + 1, p.y);
  expect(await t!.settle()).toBe(rest);
  return p;
}

function Routed({ children }: { children: ReactNode }) {
  const [r] = useState(() => createRouter({ routeTree: createRootRoute({ component: () => <>{children}</> }), history: createMemoryHistory({ initialEntries: ['/'] }), origin: 'http://localhost' } as never));
  return <RouterProvider router={r as never} />;
}

interface Row { id: string; name: string; kind: string }
const rows: Row[] = [{ id: 'a', name: 'alpha', kind: 'first' }, { id: 'b', name: 'beta', kind: 'second' }, { id: 'c', name: 'gamma', kind: 'third' }];
const columns: ColumnDef<Row, any>[] = [
  { id: 'name', header: 'Name', accessorKey: 'name', meta: { pinned: true, list: 'primary' } },
  { id: 'kind', header: 'Kind', accessorKey: 'kind', meta: { list: 'meta' } },
];
const W = 60;

test('a table: the row under the pointer stands on the hover ground from edge to edge; the cursor row keeps selected', async () => {
  t = await drawTest(<FocusRoot><Routed><DataTable bare label="Things" data={rows} columns={columns} getRowId={(r) => r.id} presentation="table" onRowAction={false} sortParam={false} noViewMenu /></Routed></FocusRoot>, { width: W, height: 12 });
  const f = await t.settle();
  // The table holds the focus and its cursor is on the first row.
  expect(f).toContain('▌ alpha');
  const a = at(f, 'alpha');
  const b = at(f, 'beta');
  const rest = bgAt(b.x, b.y);
  expect(rest).not.toBe(dark.hover);
  expect(bgAt(a.x, a.y)).toBe(dark.selected);
  await over('beta');
  expect([bgAt(0, b.y), bgAt(b.x, b.y), bgAt(W - 2, b.y)]).toEqual([dark.hover, dark.hover, dark.hover]);
  // One row at a time.
  const g = await over('gamma');
  expect([bgAt(g.x, g.y), bgAt(b.x, b.y)]).toEqual([dark.hover, rest]);
  // The cursor's row keeps the selected ground with the pointer on it.
  await over('alpha');
  expect([bgAt(a.x, a.y), bgAt(g.x, g.y)]).toEqual([dark.selected, rest]);
  // A click moves the cursor: that row is selected under the pointer, and the row it left takes the hover again.
  await t.mockMouse.click(g.x + 1, g.y);
  await t.settle();
  await t.mockMouse.moveTo(g.x + 2, g.y);
  expect(await t.settle()).toContain('▌ gamma');
  expect(bgAt(g.x, g.y)).toBe(dark.selected);
  await over('alpha');
  expect([bgAt(a.x, a.y), bgAt(g.x, g.y)]).toEqual([dark.hover, dark.selected]);
});

test('a list: every line of the row under the pointer stands on the hover ground', async () => {
  t = await drawTest(<FocusRoot><Routed><DataTable bare label="Things" data={rows} columns={columns} getRowId={(r) => r.id} presentation="list" onRowAction={false} sortParam={false} noViewMenu /></Routed></FocusRoot>, { width: W, height: 14 });
  const f = await t.settle();
  const b = at(f, 'beta');
  const meta = at(f, 'second');
  const g = at(f, 'gamma');
  expect(meta.y).toBe(b.y + 1);
  const rest = bgAt(g.x, g.y);
  expect([bgAt(b.x, b.y), bgAt(meta.x, meta.y)]).toEqual([rest, rest]);
  await over('second');
  expect([bgAt(0, b.y), bgAt(b.x, b.y), bgAt(meta.x, meta.y), bgAt(W - 2, meta.y)]).toEqual([dark.hover, dark.hover, dark.hover, dark.hover]);
  expect(bgAt(g.x, g.y)).toBe(rest);
});

test('the table chrome: a header that sorts and Refresh stand on the hover ground under the pointer', async () => {
  t = await drawTest(<FocusRoot><Routed><DataTable label="Things" data={rows} columns={columns} getRowId={(r) => r.id} presentation="table" onRowAction={false} sortParam="sort" noViewMenu onRefresh={() => {}} /></Routed></FocusRoot>, { width: W, height: 14 });
  const f = await t.settle();
  const h = at(f, 'Kind');
  const rest = bgAt(h.x, h.y);
  await over('Kind');
  expect([bgAt(h.x, h.y), bgAt(h.x + 3, h.y)]).toEqual([dark.hover, dark.hover]);
  const r = await over('Refresh');
  expect([bgAt(r.x, r.y), bgAt(h.x, h.y)]).toEqual([dark.hover, rest]);
});

test('an ItemList: a title that opens something stands on the hover ground under the pointer; a plain title does not', async () => {
  t = await drawTest(<FocusRoot><Routed><ItemList label="Items" items={[{ id: '1', title: 'Opens', onOpen: () => {} }, { id: '2', title: 'Plain' }]} /></Routed></FocusRoot>, { width: 40, height: 6 });
  const f = await t.settle();
  const p = at(f, 'Plain');
  const rest = bgAt(p.x, p.y);
  const o = await over('Opens');
  expect([bgAt(o.x, o.y), bgAt(o.x + 4, o.y)]).toEqual([dark.hover, dark.hover]);
  await over('Plain');
  expect(bgAt(p.x, p.y)).toBe(rest);
  expect(bgAt(o.x, o.y)).toBe(rest);
});
