// A list row's meta line is one line of parts joined by " · ". When it does not fit, it is cut ONCE, at its end, as
// every table cut is. Parts that shrink on their own would each lose their end (AI Skills at 64 columns:
// "! Not …      · Your skil… · Check a deploy before it goes…").
import { expect, test } from 'bun:test';
import type { ColumnDef } from '@tanstack/react-table';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { DataTable } from './DataTable';

interface Row { id: string; name: string; trust: string; where: string; about: string }
function Routed({ children }: { children: ReactNode }) {
  const [router] = useState(() => createRouter({ routeTree: createRootRoute({ component: () => <>{children}</> }), history: createMemoryHistory({ initialEntries: ['/'] }), origin: 'http://localhost' } as never));
  return <RouterProvider router={router} />;
}
const cols: ColumnDef<Row, any>[] = [
  { id: 'name', header: 'Name', accessorKey: 'name', meta: { list: 'primary' } },
  { id: 'trust', header: 'Trust', accessorKey: 'trust', cell: (c) => <span>{c.getValue()}</span>, meta: { list: 'meta' } },
  { id: 'where', header: 'Where', accessorKey: 'where', meta: { list: 'meta' } },
  { id: 'about', header: 'About', accessorKey: 'about', cell: (c) => <span>{c.getValue()}</span>, meta: { list: 'meta' } },
];
const data: Row[] = [
  { id: 'a', name: 'deploy-check', trust: 'Not trusted', where: 'Your skills', about: 'Check a deploy before it goes out to every server' },
  { id: 'b', name: 'notes', trust: 'Made here', where: 'Project', about: 'Short' },
];

async function metaLines(width: number): Promise<{ long: string; short: string }> {
  const t = await drawTest(<FocusRoot><Routed><DataTable label="Skills" data={data} columns={cols} getRowId={(r) => r.id} presentation="list" /></Routed></FocusRoot>, { width, height: 12 });
  let f = await t.settle();
  for (let i = 0; i < 4; i++) { await new Promise((r) => setTimeout(r, 30)); f = await t.settle(); }
  t.renderer.destroy();
  const lines = f.split('\n').map((l) => l.trimEnd());
  return { long: lines[lines.findIndex((l) => l.includes('deploy-check')) + 1] ?? '', short: lines[lines.findIndex((l) => /\bnotes\b/.test(l)) + 1] ?? '' };
}

test('a meta line too long for its row keeps its first parts whole and is cut once, at the end', async () => {
  const { long, short } = await metaLines(50);
  expect(long).toContain('Not trusted · Your skills · Check a deploy');
  expect(long.match(/…/g)?.length).toBe(1);
  expect(long.endsWith('…')).toBe(true);
  // A line that fits is whole, with no mark.
  expect(short).toContain('Made here · Project · Short');
  expect(short).not.toContain('…');
}, 30_000);

test('with room for everything nothing is cut', async () => {
  const { long } = await metaLines(100);
  expect(long).toContain('Not trusted · Your skills · Check a deploy before it goes out to every server');
  expect(long).not.toContain('…');
}, 30_000);
