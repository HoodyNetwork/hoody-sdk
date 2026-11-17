// The table's rows window is a scroll of its own: the last row in view may be cut by the window's edge (a two-line
// list row in a window with an odd number of lines), as any scrolling list. The window says so (`drops`), so the layout
// check does not report the row as a fault (census: API beside its detail at 200x50, "42x42 past its box 42x41").
import { expect, test } from 'bun:test';
import type { ColumnDef } from '@tanstack/react-table';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { drawTest } from '../../term/prim/testing';
import { Box, FocusRoot } from '../../term/prim';
import { layoutFaults } from '../../term/prim/layoutcheck';
import { DataTable } from './DataTable';

interface Row { id: string; name: string; kind: string }
function Routed({ children }: { children: ReactNode }) {
  const [router] = useState(() => createRouter({ routeTree: createRootRoute({ component: () => <>{children}</> }), history: createMemoryHistory({ initialEntries: ['/'] }), origin: 'http://localhost' } as never));
  return <RouterProvider router={router} />;
}
const data: Row[] = Array.from({ length: 40 }, (_, i) => ({ id: `r${i}`, name: `row ${i}`, kind: 'Web' }));
const cols: ColumnDef<Row, any>[] = [
  { id: 'name', header: 'Name', accessorKey: 'name', meta: { list: 'primary' } },
  { id: 'kind', header: 'Kind', accessorKey: 'kind', meta: { list: 'meta' } },
];

for (const height of [14, 15, 16, 17]) {
  test(`a list taller than its window, ${height} rows: the last row is cut by the window, with no layout fault`, async () => {
    const t = await drawTest(<FocusRoot><Routed><Box dir="column" height={height}><DataTable label="Rows" data={data} columns={cols} getRowId={(r) => r.id} presentation="list" search={false} /></Box></Routed></FocusRoot>, { width: 40, height });
    let f = await t.settle();
    for (let i = 0; i < 4; i++) { await new Promise((r) => setTimeout(r, 30)); f = await t.settle(); }
    const faults = layoutFaults(t.renderer.root as never, { cols: 40, rows: height }).map((x) => `${x.kind} ${x.path}: ${x.detail}`);
    t.renderer.destroy();
    expect(f).toContain('row 0');
    expect(faults).toEqual([]);
  }, 30_000);
}
