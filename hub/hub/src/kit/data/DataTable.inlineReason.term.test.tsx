// A row's inline action that is off with a reason (RowAction `isDisabled` + `disabledReason`; VMs: "[Start]" while KVM
// is off). The web draws a soft-disabled button: focusable, inert, its tip says why. The terminal drew a faint word,
// skipped by Tab, with no reason anywhere: the person saw an action they could not use and no cause. Now the word
// keeps its Tab stop, does nothing on Enter or a click, shows the reason while focused, and a reader gets it as the
// description. An off action with no reason is unchanged (skipped).
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
const data: Row[] = [{ id: 'win11', name: 'win11' }, { id: 'web-1', name: 'web-1' }, { id: 'old', name: 'old' }];
const WHY = 'KVM is off for this computer.';

test('an off inline action with a reason: focusable, inert, the reason shown on focus and read as its description', async () => {
  const ran: string[] = [];
  const t = await drawTest(
    <FocusRoot><OverlayHost><Routed><DataTable label="VMs" data={data} columns={cols} getRowId={(r) => r.id}
      actions={(r) => [
        r.id === 'win11' ? { id: 'start', label: 'Start win11', short: 'Start', inline: true, isDisabled: true, disabledReason: WHY, onAction: () => ran.push('start win11') }
        : r.id === 'web-1' ? { id: 'stop', label: 'Shut down web-1', short: 'Shut down', inline: true, onAction: () => ran.push('stop web-1') }
        : { id: 'start', label: 'Start old', short: 'Start', inline: true, isDisabled: true, onAction: () => ran.push('start old') },
        { id: 'delete', label: 'Delete', onAction: () => {} },
      ]} /></Routed></OverlayHost></FocusRoot>,
    { width: 80, height: 16 },
  );
  try {
    const frame0 = await t.settle();
    expect(frame0).toContain('[Start]');
    expect(frame0).not.toContain(WHY);
    const tree = () => semanticsOf(t.renderer as never);
    const starts = queryAllByRole(tree(), 'button', { name: 'Start' });
    expect(starts.length).toBe(2);
    const [soft, hard] = starts as [typeof starts[0], typeof starts[0]];
    // Both are off for a reader; only the one with a reason says it and takes the focus.
    expect(soft.states.disabled).toBe(true);
    expect(hard.states.disabled).toBe(true);
    expect(soft.description).toBe(`Start win11. ${WHY}`);
    expect(hard.description ?? '').toBe('');
    expect(soft.actions).toContain('focus');
    expect(hard.actions).not.toContain('focus');
    act(soft, 'focus');
    const frame1 = await t.settle();
    expect(focusedNode(tree())?.name).toBe('Start');
    expect(frame1).toContain(`Start win11. ${WHY}`);
    // Enter and a click run nothing.
    act(soft, 'press', undefined, { force: true });
    await t.settle();
    act(soft, 'click', undefined, { force: true });
    await t.settle();
    expect(ran).toEqual([]);
    // The action that is on still runs.
    act(queryAllByRole(tree(), 'button', { name: 'Shut down' })[0]!, 'press');
    await t.settle();
    expect(ran).toEqual(['stop web-1']);
  } finally { t.renderer.destroy(); }
});
