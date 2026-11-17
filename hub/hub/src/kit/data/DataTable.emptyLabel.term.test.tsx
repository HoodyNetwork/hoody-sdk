// A labelled list field whose value draws nothing (a component rendering null) hides its label too, as on the web
// (`.listItem:has(> .listValue:empty)`, `.cardItem:has(> .cardValue:empty)`). Before, "drawn" was judged on label and
// value together, so the bare label stayed.
import { expect, test } from 'bun:test';
import type { ColumnDef } from '@tanstack/react-table';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { DataTable } from './DataTable';

interface Row { id: string; name: string; kind: string; size: string | null }
function Routed({ children }: { children: ReactNode }) {
  const [router] = useState(() => createRouter({ routeTree: createRootRoute({ component: () => <>{children}</> }), history: createMemoryHistory({ initialEntries: ['/'] }), origin: 'http://localhost' } as never));
  return <RouterProvider router={router} />;
}
/** Draws nothing without a size (the cell is an element, so the table cannot tell from the value). */
function SizeValue({ size }: { size: string | null }) { return size ? <>{size}</> : null; }
const data: Row[] = [{ id: 'a', name: 'alpha', kind: 'file', size: '12 MB' }, { id: 'b', name: 'bravo', kind: 'folder', size: null }];
const cols: ColumnDef<Row, any>[] = [
  { id: 'name', header: 'Name', accessorKey: 'name', meta: { list: 'primary' } },
  { id: 'kind', header: 'Kind', accessorKey: 'kind', meta: { list: 'meta' } },
  { id: 'size', header: 'Size', accessorKey: 'size', meta: { list: 'meta', listLabel: true }, cell: (c) => <SizeValue size={c.getValue()} /> },
];

test('list: a labelled field that draws nothing takes its label (and joiner) with it', async () => {
  const t = await drawTest(
    <FocusRoot><Routed><DataTable label="Things" presentation="list" data={data} columns={cols} getRowId={(r) => r.id} /></Routed></FocusRoot>,
    { width: 80, height: 14 },
  );
  try {
    await t.settle();
    await new Promise((r) => setTimeout(r, 120));
    const lines = (await t.settle()).split('\n');
    const at = (name: string) => lines.findIndex((l) => l.includes(name));
    const a = lines[at('alpha') + 1] ?? '';
    const b = lines[at('bravo') + 1] ?? '';
    expect(a).toMatch(/file · Size 12 MB/);
    expect(b).toContain('folder');
    expect(b).not.toContain('Size');
    expect(b).not.toContain('·');
  } finally { t.renderer.destroy(); }
}, 30_000);
