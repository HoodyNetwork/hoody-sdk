// A row's inline action that turns off with a reason while its send is out (VMs: "[Shut down]" while the stop is sent,
// a snapshot's Restore / Delete while another change is out) keeps the focus, and back on it runs again. The table drew
// a focusable word when on and another control when off: a new control at each change, so the focused action lost the
// focus the moment its own press turned it off.
import { expect, test } from 'bun:test';
import type { ColumnDef } from '@tanstack/react-table';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { act, focusedNode, queryAllByRole, semanticsOf } from '../../term/prim/semantics';
import { DataTable } from './DataTable';

interface Row { id: string; name: string }
function Routed({ children }: { children: ReactNode }) {
  const [router] = useState(() => createRouter({ routeTree: createRootRoute({ component: () => <>{children}</> }), history: createMemoryHistory({ initialEntries: ['/'] }), origin: 'http://localhost' } as never));
  return <RouterProvider router={router} />;
}
const cols: ColumnDef<Row, any>[] = [{ id: 'name', header: 'Name', accessorKey: 'name', meta: { list: 'primary' } }];
const data: Row[] = [{ id: 'web-1', name: 'web-1' }, { id: 'old', name: 'old' }];
const WHY = 'A change is being sent.';
const ran: string[] = [];
let release: (() => void) | null = null;

function Table() {
  const [sending, setSending] = useState(false);
  release = () => setSending(false);
  return (
    <DataTable label="VMs" data={data} columns={cols} getRowId={(r) => r.id}
      actions={(r) => [
        { id: 'stop', label: `Shut down ${r.name}`, short: 'Shut down', inline: true, onAction: () => { ran.push(`stop ${r.name}`); setSending(true); }, ...(sending ? { isDisabled: true, disabledReason: WHY } : {}) },
        { id: 'delete', label: 'Delete', onAction: () => {} },
      ]} />
  );
}

test('an inline action that turns off with a reason keeps the focus; a press while off runs nothing; back on it runs again', async () => {
  ran.length = 0;
  const t = await drawTest(<FocusRoot><OverlayHost><Routed><Table /></Routed></OverlayHost></FocusRoot>, { width: 80, height: 16 });
  try {
    await t.settle();
    const tree = () => semanticsOf(t.renderer as never);
    const web1 = () => queryAllByRole(tree(), 'button', { name: 'Shut down' })[0]!;
    act(web1(), 'press');
    await t.settle();
    expect(ran).toEqual(['stop web-1']);
    // Off with its reason and still the focused control. A regression would leave nothing focused.
    expect(web1().states.disabled).toBe(true);
    expect(focusedNode(tree())?.name).toBe('Shut down');
    // It turned off under a focus it already had (its own press): no tip covers the row, the reason is still read.
    expect(focusedNode(tree())?.description).toContain(WHY);
    expect(await t.settle()).not.toContain(WHY);
    // A press while off runs nothing and shows the reason, whole name first.
    t.mockInput.pressEnter();
    expect(await t.settle()).toContain(`Shut down web-1. ${WHY}`);
    expect(ran).toEqual(['stop web-1']);
    // The send settles: on again, still focused, and Enter runs it.
    release!();
    await t.settle();
    expect(web1().states.disabled ?? false).toBe(false);
    expect(focusedNode(tree())?.name).toBe('Shut down');
    t.mockInput.pressEnter();
    await t.settle();
    expect(ran).toEqual(['stop web-1', 'stop web-1']);
  } finally { t.renderer.destroy(); }
});
