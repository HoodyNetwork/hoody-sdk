// A cell that answers a fragment of words and a part (the AI allowance lane cell: `<>{'80%'}{' '}<Meter/></>`) is one
// row, cut at its column's edge with one "…" like any element cell. Its words are never loose children of the cell:
// each would be its own box, wrapped in a one-cell box under the column and drawn over the Meter beside it.
import { expect, test } from 'bun:test';
import type { ColumnDef } from '@tanstack/react-table';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { layoutFaults } from '../../term/prim/layoutcheck';
import { Meter } from '../widgets/Widgets';
import { DataTable } from './DataTable';

const COLS = 64;
interface Row { id: string; name: string; pct: number }
const data: Row[] = [{ id: 'a', name: 'atlas', pct: 10 }, { id: 'b', name: 'build-box', pct: 80 }];
// Four lanes of 80 px (10 cells) each, as the allowance table at 80 columns: less than "80% " and a 10-cell bar.
const lane = (id: string): ColumnDef<Row, any> => ({ id, header: id, accessorKey: 'pct', meta: { width: '80px' }, cell: (c) => <>{`${c.getValue()}%`}{' '}<Meter value={c.getValue()} size="sm" label={id} /></> });
const columns: ColumnDef<Row, any>[] = [
  { id: 'name', header: 'Server', accessorKey: 'name', meta: { width: '120px', pinned: true } },
  lane('Chat'), lane('Quick'), lane('Search'), lane('Speech'),
];
function Routed({ children }: { children: ReactNode }) {
  const [router] = useState(() => createRouter({ routeTree: createRootRoute({ component: () => <>{children}</> }), history: createMemoryHistory({ initialEntries: ['/'] }), origin: 'http://localhost' } as never));
  return <RouterProvider router={router} />;
}

test('a fragment cell of words and a Meter in a narrow column: one row, cut with one "…", nothing drawn over', async () => {
  const t = await drawTest(<FocusRoot><Routed><DataTable label="Allowance" data={data} columns={columns} getRowId={(r) => r.id} /></Routed></FocusRoot>, { width: COLS, height: 10 });
  let f = await t.settle();
  for (let i = 0; i < 6; i++) { await new Promise((r) => setTimeout(r, 30)); f = await t.settle(); }
  const faults = layoutFaults((t.renderer as unknown as { root: never }).root, { cols: COLS, rows: 10 })
    .filter((x) => x.kind === 'overdraw' || x.kind === 'text-cut');
  t.renderer.destroy();
  expect(faults.map((x) => `${x.kind} ${x.path} ${x.detail}`), f).toEqual([]);
  const lines = f.split('\n');
  const row = lines.find((l) => l.includes('build-box'))!;
  expect(row, f).toBeDefined();
  // The words and the start of the bar on the row's one line, the cut at the end.
  expect(row, f).toMatch(/80% █+/);
  expect(row, f).toContain('…');
  // No wrapped piece of the cell on the line below ("%" or a bar under the column).
  const below = lines[lines.indexOf(row) + 1] ?? '';
  expect(below, f).not.toMatch(/%|█|░/);
}, 30_000);
