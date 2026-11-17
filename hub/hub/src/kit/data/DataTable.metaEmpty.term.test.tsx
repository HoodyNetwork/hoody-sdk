// A list row with nothing on its meta line is one line tall and lays nothing past its box (the ai chat list at 120x40:
// "cut … ListRow 95x1 at 25,6 past its box 95x1 at 25,5"). The empty meta line stays mounted (its parts report when
// they draw) but takes no row: hidden, never a height-0 box the engine still lays out one line tall.
import { expect, test } from 'bun:test';
import type { ColumnDef } from '@tanstack/react-table';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { DataTable } from './DataTable';
import { layoutFaults } from '../../term/prim/layoutcheck';

interface Row { id: string; name: string; note: string }
function Routed({ children }: { children: ReactNode }) {
  const [router] = useState(() => createRouter({ routeTree: createRootRoute({ component: () => <>{children}</> }), history: createMemoryHistory({ initialEntries: ['/'] }), origin: 'http://localhost' } as never));
  return <RouterProvider router={router} />;
}
const cols: ColumnDef<Row, any>[] = [
  { id: 'name', header: 'Name', accessorKey: 'name', meta: { list: 'primary' } },
  { id: 'note', header: 'Note', accessorKey: 'note', cell: (c) => c.getValue() || null, meta: { list: 'meta' } },
];
const data: Row[] = [
  { id: 'a', name: 'alpha', note: '' },
  { id: 'b', name: 'bravo', note: 'has meta' },
  { id: 'c', name: 'charlie', note: '' },
];

test('a list row with an empty meta line lays nothing past its box, and rows keep one line each', async () => {
  for (const [w, h] of [[100, 40], [80, 24]] as const) {
    const t = await drawTest(<FocusRoot><Routed><DataTable label="Things" data={data} columns={cols} getRowId={(r) => r.id} presentation="list" /></Routed></FocusRoot>, { width: w, height: h });
    const f = await t.settle();
    const faults = layoutFaults((t.renderer as unknown as { root: never }).root, { cols: w, rows: h }).filter((x) => x.kind === 'cut' || x.kind === 'overdraw');
    t.renderer.destroy();
    expect(faults.map((x) => `${w}x${h}: ${x.kind} ${x.path} ${x.detail}`)).toEqual([]);
    for (const n of ['alpha', 'bravo', 'has meta', 'charlie']) expect(f).toContain(n);
    const lines = f.split('\n');
    const at = (re: RegExp) => lines.findIndex((l) => re.test(l));
    // bravo's meta line sits right under it; charlie follows (plus the tall-screen gap), alpha's empty line takes none.
    expect(at(/has meta/)).toBe(at(/bravo/) + 1);
  }
});
