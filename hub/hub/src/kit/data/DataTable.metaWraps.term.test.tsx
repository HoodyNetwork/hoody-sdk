// A list row's meta field that says it wraps (column meta listWraps, or the page's data-meta-wraps on its cell) is never
// cut: it takes the lines it needs and the rows below move down (the web's `.listItem[data-meta-wraps]`). The terminal
// drew every meta line one row tall and cut it. In a rail, a field marked data-rail-hide is left out with its joiner
// (the web's `.rail .listItem:has([data-rail-hide])`).
import { expect, test } from 'bun:test';
import type { ColumnDef } from '@tanstack/react-table';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { DataTable } from './DataTable';
import { ListPaneContext } from '../layouts/pane';

interface Row { id: string; name: string; kind: string; address: string; apps: string[] }
function Routed({ children }: { children: ReactNode }) {
  const [router] = useState(() => createRouter({ routeTree: createRootRoute({ component: () => <>{children}</> }), history: createMemoryHistory({ initialEntries: ['/'] }), origin: 'http://localhost' } as never));
  return <RouterProvider router={router} />;
}
const LONG = 'https://atlas-3000.example.test/a/long/path/that/does/not/fit/one/row';
const data: Row[] = [
  { id: 'a', name: 'first', kind: 'Web', address: LONG, apps: ['Telegram', 'Discord', 'Slack', 'WhatsApp', 'Signal'] },
  { id: 'b', name: 'second', kind: 'Web', address: 'short', apps: [] },
  { id: 'c', name: 'third', kind: 'Web', address: 'short', apps: ['Telegram'] },
];
async function frame(node: ReactNode, width: number): Promise<string[]> {
  const t = await drawTest(<FocusRoot><Routed>{node}</Routed></FocusRoot>, { width, height: 16 });
  let f = await t.settle();
  for (let i = 0; i < 6; i++) { await new Promise((r) => setTimeout(r, 30)); f = await t.settle(); }
  t.renderer.destroy();
  return f.split('\n').map((l) => l.trimEnd());
}
const at = (ls: string[], re: RegExp) => ls.findIndex((l) => re.test(l));

test('a listWraps field wraps onto the lines it needs; the next row starts under it', async () => {
  const cols: ColumnDef<Row, any>[] = [
    { id: 'name', header: 'Name', accessorKey: 'name', meta: { list: 'primary' } },
    { id: 'kind', header: 'Kind', accessorKey: 'kind', meta: { list: 'meta' } },
    { id: 'address', header: 'Address', accessorKey: 'address', meta: { list: 'meta', listWraps: true } },
  ];
  const ls = await frame(<DataTable label="Addresses" data={data} columns={cols} getRowId={(r) => r.id} presentation="list" search={false} />, 44);
  const first = at(ls, /\bfirst\b/), second = at(ls, /\bsecond\b/);
  const block = ls.slice(first + 1, second).join('').replace(/\s+/g, '');
  // Whole, over more than one line, with no cut mark.
  expect(second - first).toBeGreaterThan(2);
  expect(block).toContain(LONG);
  expect(block).not.toContain('…');
  // A row whose field fits stays two lines.
  expect(at(ls, /\bthird\b/) - second).toBe(2);
}, 30_000);

const appsCols: ColumnDef<Row, any>[] = [
  { id: 'name', header: 'Name', accessorKey: 'name', meta: { list: 'primary' } },
  { id: 'kind', header: 'Kind', accessorKey: 'kind', meta: { list: 'meta' } },
  { id: 'apps', header: 'Apps', meta: { list: 'meta' }, cell: (c) => (c.row.original.apps.length === 0 ? <span data-rail-hide="">—</span> : <span data-meta-wraps="">{c.row.original.apps.join(' ')}</span>) },
];

test("the page's own data-meta-wraps on a cell wraps it too", async () => {
  const ls = await frame(<DataTable label="Bots" data={data} columns={appsCols} getRowId={(r) => r.id} presentation="list" search={false} />, 30);
  const first = at(ls, /\bfirst\b/), second = at(ls, /\bsecond\b/);
  const block = ls.slice(first + 1, second).join(' ');
  for (const app of data[0]!.apps) expect(block).toContain(app);
  expect(block).not.toContain('…');
  expect(second - first).toBeGreaterThan(2);
  // Outside a rail the empty dash stays.
  expect(ls[second + 1]).toContain('Web · —');
}, 30_000);

test('in a rail a data-rail-hide field is left out, with its joiner', async () => {
  const ls = await frame(<ListPaneContext.Provider value={{ presentation: 'list', rail: true }}><DataTable label="Bots" data={data} columns={appsCols} getRowId={(r) => r.id} presentation="list" search={false} /></ListPaneContext.Provider>, 30);
  const second = at(ls, /\bsecond\b/);
  expect(ls[second + 1]).toContain('Web');
  expect(ls[second + 1]).not.toContain('—');
  expect(ls[second + 1]).not.toContain('·');
  // A field that has something to say stays.
  expect(ls[at(ls, /\bthird\b/) + 1]).toContain('Web · Telegram');
}, 30_000);

test('a field that moves to the next line takes its joiner along: no line ends with a separator', async () => {
  for (const width of [24, 30, 36, 44]) {
    const ls = await frame(<DataTable label="Bots" data={data} columns={appsCols} getRowId={(r) => r.id} presentation="list" search={false} />, width);
    for (const l of ls) expect(`${width}: ${l}`).not.toMatch(/·$/);
    const first = at(ls, /\bfirst\b/), second = at(ls, /\bsecond\b/);
    const block = ls.slice(first + 1, second).join(' ');
    for (const app of data[0]!.apps) expect(block).toContain(app);
  }
}, 60_000);
