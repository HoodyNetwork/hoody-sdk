// A cell's tag that gives way (kit MarkCell `after`) is part of what its column needs, shown or not: the column's
// width must not depend on the widths the table passed through. It did: a tag that had no room when its cell was
// first measured was not counted, and nothing measured the cell again once the tag's width was known, so the column
// kept the width of the title alone; a table that had first been wider or narrower counted the tag. One table at one
// size drew two layouts (Bots' Work tab at 120x40: the Task column 28 or 38 cells wide, by timing).
import { expect, test } from 'bun:test';
import type { ColumnDef } from '@tanstack/react-table';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { DataTable } from './DataTable';
import { MarkCell } from './cells';
import { StatusPill, Tag } from './Display';

interface Row { id: string; title: string; where: string; state: string; wait?: boolean; started: string }
const rows: Row[] = [
  { id: 'a', title: 'Read deploy log', where: 'atlas', state: 'Working', started: '14 minutes ago' },
  { id: 'b', title: 'Draft reply to a reader', where: 'atlas', state: 'Waiting for approval', wait: true, started: '3 hours ago' },
];
// Bots' Work tab: a pinned task that takes the rest, two measured columns, a pill.
const columns: ColumnDef<Row, any>[] = [
  { id: 'title', header: 'Task', accessorKey: 'title', meta: { pinned: true, size: 'fill' }, cell: (c) => <MarkCell mark={undefined} after={c.row.original.wait ? <Tag tone="warn">Waiting</Tag> : undefined}>{c.getValue()}</MarkCell> },
  { id: 'computer', header: 'Computer', accessorKey: 'where', meta: { width: '160px', priority: 2, size: 'fit' } },
  { id: 'state', header: 'State', accessorKey: 'state', meta: { width: '170px' }, cell: (c) => <StatusPill tone="info" dot>{c.getValue()}</StatusPill> },
  { id: 'started', header: 'Started', accessorKey: 'started', meta: { width: '110px', priority: 3, size: 'fit' } },
];
function Routed({ children }: { children: ReactNode }) {
  const [router] = useState(() => createRouter({ routeTree: createRootRoute({ component: () => <>{children}</> }), history: createMemoryHistory({ initialEntries: ['/'] }), origin: 'http://localhost' } as never));
  return <RouterProvider router={router} />;
}

/** The table at `width`, after it was drawn at each of `via` first (settled at each). */
async function frameAt(width: number, via: readonly number[]): Promise<string> {
  const first = via[0] ?? width;
  const t = await drawTest(<FocusRoot><Routed><DataTable label="Tasks" data={rows} columns={columns} getRowId={(r) => r.id} sortParam={false} noViewMenu /></Routed></FocusRoot>, { width: first, height: 12 });
  for (const w of [...via.slice(1), width]) { await t.settle(); t.renderer.resize(w, 12); }
  const f = await t.settle();
  t.renderer.destroy();
  return f;
}

test('one table at one size is one frame, whatever sizes it was drawn at before', async () => {
  for (const w of [74, 76, 77, 80, 92, 93]) {
    const fresh = await frameAt(w, []);
    expect(await frameAt(w, [w - 20]), `${w} after ${w - 20}`).toBe(fresh);
    expect(await frameAt(w, [w + 30]), `${w} after ${w + 30}`).toBe(fresh);
  }
}, 240_000);
