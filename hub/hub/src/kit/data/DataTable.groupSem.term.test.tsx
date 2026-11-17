// A group header ("▾ atlas 6") is a button named by its label and count with its open state, as the web's
// `<button aria-expanded>`; focused, the text frame shows the kit's focus mark before its chevron.
import { expect, test } from 'bun:test';
import type { ColumnDef } from '@tanstack/react-table';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { focusedNode, queryAllByRole, semanticsOf } from '../../term/prim/semantics';
import { DataTable } from './DataTable';

interface Row { id: string; name: string; where: string }
function Routed({ children }: { children: ReactNode }) {
  const [router] = useState(() => createRouter({ routeTree: createRootRoute({ component: () => <>{children}</> }), history: createMemoryHistory({ initialEntries: ['/'] }), origin: 'http://localhost' } as never));
  return <RouterProvider router={router} />;
}
const cols: ColumnDef<Row, any>[] = [{ id: 'name', header: 'Name', accessorKey: 'name', meta: { list: 'primary' } }];
const data: Row[] = [
  { id: 'a', name: 'alpha', where: 'atlas' }, { id: 'b', name: 'bravo', where: 'atlas' }, { id: 'c', name: 'charlie', where: 'borealis' },
];

test('a group header is a button (label + count, expanded) and shows the focus mark when focused', async () => {
  const t = await drawTest(<FocusRoot><Routed><DataTable label="Things" data={data} columns={cols} getRowId={(r) => r.id} presentation="list" groupBy={(r) => r.where} groups={[{ id: 'atlas', label: 'atlas' }, { id: 'borealis', label: 'borealis' }]} /></Routed></FocusRoot>, { width: 80, height: 16 });
  try {
    await t.settle();
    const tree = () => semanticsOf(t.renderer as never);
    const heads = queryAllByRole(tree(), 'button', { name: 'atlas 2' });
    expect(heads.length).toBe(1);
    expect(heads[0]!.states.expanded).toBe(true);
    expect(queryAllByRole(tree(), 'button', { name: 'borealis 1', expanded: true }).length).toBe(1);
    let f = '';
    for (let i = 0; i < 12; i++) {
      t.mockInput.pressTab();
      f = await t.settle();
      if (focusedNode(tree())?.name === 'atlas 2') break;
    }
    expect(focusedNode(tree())?.name).toBe('atlas 2');
    expect(f).toMatch(/▌▾ atlas/);
    t.mockInput.pressEnter();
    f = await t.settle();
    expect(queryAllByRole(tree(), 'button', { name: 'atlas 2', expanded: false }).length).toBe(1);
    expect(f).toMatch(/▌▸ atlas/);
    expect(f).not.toContain('alpha');
  } finally { t.renderer.destroy(); }
});
