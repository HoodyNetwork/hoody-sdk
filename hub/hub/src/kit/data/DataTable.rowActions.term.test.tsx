// A row's "⋯" is the web's button "Row actions" (IconButton label table.rowActions): a reader (and a replayed shot, e.g.
// `role=row[name=/OpenAI/] >> role=button[name="Row actions"]`) finds it under its row, and pressing it opens the row's
// menu. Before, the terminal drew the ⋯ as plain text with no node.
import { expect, test } from 'bun:test';
import type { ColumnDef } from '@tanstack/react-table';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { queryAllByRole, semanticsOf, type SemNode } from '../../term/prim/semantics';
import { DataTable } from './DataTable';

interface Row { id: string; name: string }
function Routed({ children }: { children: ReactNode }) {
  const [router] = useState(() => createRouter({ routeTree: createRootRoute({ component: () => <>{children}</> }), history: createMemoryHistory({ initialEntries: ['/'] }), origin: 'http://localhost' } as never));
  return <RouterProvider router={router} />;
}
const cols: ColumnDef<Row, any>[] = [{ id: 'name', header: 'Name', accessorKey: 'name', meta: { list: 'primary' } }];
const data: Row[] = [{ id: 'a', name: 'alpha' }, { id: 'b', name: 'bravo' }];
const within = (n: SemNode, role: string, name: string): SemNode[] => {
  const out: SemNode[] = [];
  const walk = (x: SemNode) => { if (x.role === role && x.name === name) out.push(x); x.children.forEach(walk); };
  n.children.forEach(walk);
  return out;
};

for (const presentation of ['table', 'list'] as const) {
  test(`${presentation}: each row holds a "Row actions" button that opens its menu`, async () => {
    const opened: string[] = [];
    const t = await drawTest(
      <FocusRoot><Routed><DataTable label="Things" presentation={presentation} data={data} columns={cols} getRowId={(r) => r.id}
        actions={(r) => [{ id: 'rename', label: 'Rename', onAction: () => opened.push(r.id) }, { id: 'delete', label: 'Delete', onAction: () => {} }]} /></Routed></FocusRoot>,
      { width: 80, height: 14 },
    );
    try {
      await t.settle();
      const tree = () => semanticsOf(t.renderer as never);
      const rows = queryAllByRole(tree(), 'row').filter((r) => /alpha|bravo/.test(r.name));
      expect(rows.length).toBe(2);
      for (const r of rows) expect(within(r, 'button', 'Row actions').length).toBe(1);
      const btn = within(rows.find((r) => /bravo/.test(r.name))!, 'button', 'Row actions')[0]!;
      expect(btn.states.expanded ?? false).toBe(false);
      await t.mockMouse.click(btn.box[0] + btn.box[2] - 1, btn.box[1]);
      await t.settle();
      expect(queryAllByRole(tree(), 'menuitem', { name: 'Rename' }).length).toBe(1);
    } finally { t.renderer.destroy(); }
  });
}
