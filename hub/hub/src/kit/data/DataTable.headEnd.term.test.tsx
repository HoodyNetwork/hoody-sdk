// An end-aligned column's header ends where its values end. A header that cannot sort was a column box, so its
// `justify: end` moved nothing sideways: the label stayed at the column's start while the values sat at its end
// (Programs at 320 columns: "Up" 25 cells to the left of "3 days").
import { expect, test } from 'bun:test';
import type { ColumnDef } from '@tanstack/react-table';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { DataTable } from './DataTable';

interface Row { id: string; name: string; up: string; cost: string }
function Routed({ children }: { children: ReactNode }) {
  const [router] = useState(() => createRouter({ routeTree: createRootRoute({ component: () => <>{children}</> }), history: createMemoryHistory({ initialEntries: ['/'] }), origin: 'http://localhost' } as never));
  return <RouterProvider router={router} />;
}
const cols: ColumnDef<Row, any>[] = [
  { id: 'name', header: 'Name', accessorKey: 'name', meta: { pinned: true } },
  { id: 'up', header: 'Up', enableSorting: false, cell: (c) => c.row.original.up, meta: { align: 'end', width: '240px' } },
  { id: 'cost', header: 'Cost', accessorKey: 'cost', meta: { align: 'end', width: '160px' } },
];
const data: Row[] = [{ id: 'a', name: 'web', up: '3 days', cost: '$4' }];

test('a header that cannot sort ends where its end-aligned values end (and a sortable one still does)', async () => {
  const t = await drawTest(<FocusRoot><Routed><DataTable label="Programs" data={data} columns={cols} getRowId={(r) => r.id} presentation="table" search={false} /></Routed></FocusRoot>, { width: 100, height: 10 });
  let f = await t.settle();
  for (let i = 0; i < 4; i++) { await new Promise((r) => setTimeout(r, 30)); f = await t.settle(); }
  t.renderer.destroy();
  const lines = f.split('\n');
  const head = lines.find((l) => l.includes('Name') && l.includes('Up')) ?? '';
  const row = lines.find((l) => l.includes('3 days')) ?? '';
  expect(head).not.toBe('');
  expect(head.indexOf('Up') + 'Up'.length).toBe(row.indexOf('3 days') + '3 days'.length);
  expect(head.indexOf('Cost') + 'Cost'.length).toBe(row.indexOf('$4') + '$4'.length);
}, 30_000);
