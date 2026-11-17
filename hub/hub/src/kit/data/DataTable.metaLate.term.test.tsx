// A list row's meta line joins its drawn parts with " · ". A part drawn by its own component can start or stop
// drawing without the row rendering again (Programs' held note reads its own store: the row's Ports part is empty for
// a moment, then says "Unsure [Check again]"). The line then kept what it knew from the row's last render, so the
// same row drew "3 days · Unsure" or "3 daysUnsure" by timing. The joiner follows what the part draws now.
import { expect, test } from 'bun:test';
import type { ColumnDef } from '@tanstack/react-table';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { useState, useSyncExternalStore, type ReactNode } from 'react';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { DataTable } from './DataTable';

interface Row { id: string; name: string; up: string }
function Routed({ children }: { children: ReactNode }) {
  const [router] = useState(() => createRouter({ routeTree: createRootRoute({ component: () => <>{children}</> }), history: createMemoryHistory({ initialEntries: ['/'] }), origin: 'http://localhost' } as never));
  return <RouterProvider router={router} />;
}

// The note's own store: only the note renders again when it changes.
let note = '';
const heard = new Set<() => void>();
const say = (s: string): void => { note = s; for (const f of heard) f(); };
const listen = (f: () => void): (() => void) => { heard.add(f); return () => { heard.delete(f); }; };
function Note() {
  const s = useSyncExternalStore(listen, () => note);
  return s || null;
}

const cols: ColumnDef<Row, any>[] = [
  { id: 'name', header: 'Name', accessorKey: 'name', meta: { list: 'primary' } },
  { id: 'up', header: 'Up', accessorKey: 'up', meta: { list: 'meta' } },
  { id: 'note', header: 'Note', cell: () => <Note />, meta: { list: 'meta' } },
];
const data: Row[] = [{ id: 'a', name: 'web', up: '3 days' }, { id: 'b', name: 'api', up: '5 days' }];

test('a part that starts drawing on its own gets its joiner, and loses it when it stops', async () => {
  say('');
  const t = await drawTest(<FocusRoot><Routed><DataTable label="Things" data={data} columns={cols} getRowId={(r) => r.id} presentation="list" /></Routed></FocusRoot>, { width: 80, height: 24 });
  let f = await t.settle();
  // Past the line's second look (60 ms after mounting): what it knows now is what it keeps.
  await new Promise<void>((r) => setTimeout(r, 120));
  f = await t.settle();
  expect(f).toContain('3 days');
  expect(f).not.toContain('3 days ·');

  say('Unsure');
  f = await t.settle();
  expect(f).toContain('3 days · Unsure');
  expect(f).toContain('5 days · Unsure');

  say('');
  f = await t.settle();
  expect(f).toContain('3 days');
  expect(f).not.toContain('Unsure');
  expect(f).not.toContain('3 days ·');
  t.renderer.destroy();
}, 120_000);
