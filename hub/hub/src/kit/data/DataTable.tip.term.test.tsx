// A column's `meta.tip` explains it in every presentation, as on the web (DataTable.tsx `.thTip`, `listLabelNode`):
// table presentation draws the header words and an InfoTip "ⓘ" after them (named "About <header>"); list and cards
// draw the field's label as the InfoTip's term. Before, the terminal read `tip` nowhere (Skills Hub
// "Source" and "Installs" lost their explanation).
import { expect, test } from 'bun:test';
import type { ColumnDef } from '@tanstack/react-table';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { queryAllByRole, semanticsOf } from '../../term/prim/semantics';
import { DataTable } from './DataTable';

interface Row { id: string; name: string; size: string }
function Routed({ children }: { children: ReactNode }) {
  const [router] = useState(() => createRouter({ routeTree: createRootRoute({ component: () => <>{children}</> }), history: createMemoryHistory({ initialEntries: ['/'] }), origin: 'http://localhost' } as never));
  return <RouterProvider router={router} />;
}
const TIP = 'Bytes on disk, after compression.';
const data: Row[] = [{ id: 'a', name: 'alpha', size: '12 MB' }, { id: 'b', name: 'bravo', size: '3 GB' }];

for (const [presentation, sortable] of [['table', false], ['table', true], ['list', false]] as const) {
  test(`${presentation}${sortable ? ' (sortable)' : ''}: a column tip is an InfoTip that shows its text`, async () => {
    const cols: ColumnDef<Row, any>[] = [
      { id: 'name', header: 'Name', accessorKey: 'name', enableSorting: false, meta: { list: 'primary' } },
      { id: 'size', header: 'Size', accessorKey: 'size', enableSorting: sortable, meta: { list: 'meta', listLabel: true, tip: TIP } },
    ];
    const t = await drawTest(
      <FocusRoot><OverlayHost><Routed><DataTable label="Things" presentation={presentation} data={data} columns={cols} getRowId={(r) => r.id} /></Routed></OverlayHost></FocusRoot>,
      { width: 80, height: 16 },
    );
    try {
      const f = await t.settle();
      const tree = () => semanticsOf(t.renderer as never);
      const name = presentation === 'table' ? 'About Size' : 'Size';
      const triggers = queryAllByRole(tree(), 'button', { name });
      expect(triggers.length).toBe(presentation === 'table' ? 1 : 2);
      if (presentation === 'table') expect(f.split('\n').find((l) => /Name/.test(l)) ?? '').toMatch(/Size.*ⓘ/);
      expect(f).not.toContain(TIP);
      const b = triggers[0]!;
      await t.mockMouse.click(b.box[0], b.box[1]);
      const after = await t.settle();
      if (process.env.TIP_DUMP) console.log(after);
      expect(queryAllByRole(tree(), 'dialog', { name: TIP }).length).toBe(1);
      expect(after).toContain('Bytes on disk');
    } finally { t.renderer.destroy(); }
  }, 30_000);
}
