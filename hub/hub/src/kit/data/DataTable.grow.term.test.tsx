// A real DataTable: a fixed-px column whose drawn cell needs more cells than its px give (Bots Work State, a pill
// "● Waiting for approval" in 170px = 21 cells) shows whole when another column has slack; no table fault.
import { expect, test } from 'bun:test';
import type { ColumnDef } from '@tanstack/react-table';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { tableFaults } from '../../term/prim/TableCheck';
import { DataTable } from './DataTable';
import { StatusPill } from './Display';

interface Row { id: string; title: string; state: string }
const data: Row[] = [{ id: 'a', title: 'Read deploy log', state: 'Working' }, { id: 'b', title: 'Draft reply to a reader', state: 'Waiting for approval' }];
const columns: ColumnDef<Row, any>[] = [
  { id: 'title', header: 'Task', accessorKey: 'title', meta: { pinned: true, size: 'fill' } },
  { id: 'state', header: 'State', accessorKey: 'state', meta: { width: '170px' }, cell: (c) => <StatusPill tone="warn" dot>{c.getValue()}</StatusPill> },
];
function Routed({ children }: { children: ReactNode }) {
  const [router] = useState(() => createRouter({ routeTree: createRootRoute({ component: () => <>{children}</> }), history: createMemoryHistory({ initialEntries: ['/'] }), origin: 'http://localhost' } as never));
  return <RouterProvider router={router} />;
}

for (const w of [80, 120]) test(`the State pill is whole at ${w} cols (slack from Task)`, async () => {
  const t = await drawTest(<FocusRoot><Routed><DataTable label="Work" data={data} columns={columns} getRowId={(r) => r.id} /></Routed></FocusRoot>, { width: w, height: 12 });
  let f = await t.settle();
  for (let i = 0; i < 4; i++) { await new Promise((r) => setTimeout(r, 30)); f = await t.settle(); }
  const faults = tableFaults((t.renderer as unknown as { root: never }).root, { cols: w, rows: 12 });
  t.renderer.destroy();
  expect(f).toContain('● Waiting for approval');
  expect(f).toContain('Draft reply to a reader');
  expect(faults).toEqual([]);
});
