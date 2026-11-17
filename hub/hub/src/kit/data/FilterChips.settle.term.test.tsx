// A segmented filter beside chips decides from the ROOM the toolbar gives it, never from its own content-sized box:
// that box is narrower with the segmented row than with a chip, so deciding from it flipped segmented ↔ chip on every
// frame and the page never settled (Notifications: 43 cells as a segmented row, 49 as chips, need 45).
import { expect, test } from 'bun:test';
import type { ColumnDef } from '@tanstack/react-table';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { DataTable } from './DataTable';

interface Row { id: string; name: string }
const rows: Row[] = [{ id: 'a', name: 'alpha' }, { id: 'b', name: 'beta' }];
const columns: ColumnDef<Row, any>[] = [{ id: 'name', header: 'Name', accessorKey: 'name', meta: { pinned: true } }];
function Routed({ children }: { children: ReactNode }) {
  const [router] = useState(() => createRouter({ routeTree: createRootRoute({ component: () => <>{children}</> }), history: createMemoryHistory({ initialEntries: ['/'] }), origin: 'http://localhost' } as never));
  return <RouterProvider router={router} />;
}
const filters = [
  { id: 'box', label: 'Which notifications', display: 'segmented' as const, required: true, value: 'unread', onChange: () => {}, options: [{ value: 'unread', label: 'Unread' }, { value: 'archive', label: 'Archive' }] },
  { id: 'type', label: 'Type', value: undefined, onChange: () => {}, options: [{ value: 'x', label: 'X' }] },
  { id: 'look', label: 'Importance', value: undefined, onChange: () => {}, options: [{ value: '1', label: 'Yes' }] },
];

test('the toolbar holds still at every width: segmented or chip, decided once', async () => {
  const moving: number[] = [];
  for (const width of [100, 120, 160]) {
    const t = await drawTest(<FocusRoot><Routed><DataTable label="Things" data={rows} columns={columns} getRowId={(r) => r.id} search="Search" filters={filters} onRefresh={() => {}} /></Routed></FocusRoot>, { width, height: 8 });
    await t.settle();
    const frames: string[] = [];
    for (let i = 0; i < 4; i++) { await t.renderOnce(); await new Promise((r) => setTimeout(r, 5)); frames.push(t.captureCharFrame().split('\n')[0]!); }
    t.renderer.destroy();
    if (new Set(frames).size > 1) moving.push(width);
    if (width >= 120) expect(frames[0]).toContain('‹ Unread ›'); // room for the segmented row: it shows
  }
  expect(moving).toEqual([]);
}, 60_000);
