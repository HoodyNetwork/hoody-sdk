// A flowing list on a tall terminal has exactly one blank row above its footer. A normal-density list already ends on
// its own gap row, so the footer adds none; a list with no gap of its own gets one from the footer.
import { expect, test } from 'bun:test';
import type { ColumnDef } from '@tanstack/react-table';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { DataTable } from './DataTable';

interface Row { id: string; name: string; kind: string }
function Routed({ children }: { children: ReactNode }) {
  const [router] = useState(() => createRouter({ routeTree: createRootRoute({ component: () => <>{children}</> }), history: createMemoryHistory({ initialEntries: ['/'] }), origin: 'http://localhost' } as never));
  return <RouterProvider router={router} />;
}
const data: Row[] = Array.from({ length: 8 }, (_, i) => ({ id: `r${i}`, name: `row ${i}`, kind: 'Web' }));
const cols: ColumnDef<Row, any>[] = [
  { id: 'name', header: 'Name', accessorKey: 'name', meta: { list: 'primary' } },
  { id: 'kind', header: 'Kind', accessorKey: 'kind', meta: { list: 'meta' } },
];

for (const density of ['normal', 'compact'] as const) {
  test(`120x40, ${density} list: exactly one blank row above the pager`, async () => {
    const t = await drawTest(<FocusRoot><Routed><DataTable label="Rows" data={data} columns={cols} getRowId={(r) => r.id} presentation="list" density={density} fill={false} pageSize={5} search={false} /></Routed></FocusRoot>, { width: 120, height: 40 });
    let f = await t.settle();
    for (let i = 0; i < 4; i++) { await new Promise((r) => setTimeout(r, 30)); f = await t.settle(); }
    t.renderer.destroy();
    const lines = f.split('\n');
    const at = lines.findIndex((l) => /1–5 of 8/.test(l));
    expect(at).toBeGreaterThan(1);
    expect(lines[at - 1]!.trim()).toBe('');
    expect(lines[at - 2]!.trim()).not.toBe('');
  }, 30_000);
}
