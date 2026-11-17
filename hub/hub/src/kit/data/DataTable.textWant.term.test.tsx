// A free-text column drawn by its own one-line cell (Notifications' Message) never reported its words' need: the cell
// cuts itself, so the table measured only the cells it already had and the column took no slack (15 cells at 120x40
// while Level and When held px room above their words).
import { expect, test } from 'bun:test';
import type { ColumnDef } from '@tanstack/react-table';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot, Text } from '../../term/prim';
import { DataTable } from './DataTable';

interface Row { id: string; level: string; message: string; when: string }
const long = 'Your payment for borealis was received and your wallet balance is now up to date';
const data: Row[] = [{ id: 'a', level: 'x', message: long, when: '19 days ago' }, { id: 'b', level: 'x', message: 'Short one', when: '2 days ago' }];
// Level holds 160 px (20 cells) for one mark; Message cuts its own words in a one-line text, as a page's ellipsis span does.
const columns: ColumnDef<Row, any>[] = [
  { id: 'level', header: 'Level', accessorKey: 'level', meta: { width: '160px', pinned: true } },
  { id: 'message', header: 'Message', accessorKey: 'message', meta: { size: 'fill' }, cell: (c) => <Text truncate>{c.getValue()}</Text> },
  { id: 'when', header: 'When', accessorKey: 'when', meta: { width: '200px' } },
];
function Routed({ children }: { children: ReactNode }) {
  const [router] = useState(() => createRouter({ routeTree: createRootRoute({ component: () => <>{children}</> }), history: createMemoryHistory({ initialEntries: ['/'] }), origin: 'http://localhost' } as never));
  return <RouterProvider router={router} />;
}

test('a free-text column that cuts its own words still takes the slack px columns hold (its values say its need)', async () => {
  const t = await drawTest(<FocusRoot><Routed><DataTable label="Inbox" data={data} columns={columns} getRowId={(r) => r.id} /></Routed></FocusRoot>, { width: 80, height: 10 });
  let f = await t.settle();
  for (let i = 0; i < 6; i++) { await new Promise((r) => setTimeout(r, 30)); f = await t.settle(); }
  t.renderer.destroy();
  const row = f.split('\n').find((l) => l.includes('Your payment'))!;
  expect(row).toBeDefined();
  // 80 cells less Level's and When's words: the message takes the cells Level and When hold above their words.
  expect(row).toContain('Your payment for borealis was received and your wall'); // it drew "…received and yo…" before
  expect(row).toContain('19 days ago');
}, 30_000);
