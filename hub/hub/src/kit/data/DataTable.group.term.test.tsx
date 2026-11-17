// A group header whose name is longer than the row: the name is cut at its end with one "…" (as the web's label),
// the count stays whole and on screen, nothing runs past the row edge unmarked (bots railLong 80x24).
import { expect, test } from 'bun:test';
import type { ColumnDef } from '@tanstack/react-table';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { DataTable } from './DataTable';
import { tableFaults } from '../../term/prim/TableCheck';
import { focusedNode, queryAllByRole, semanticsOf } from '../../term/prim/semantics';

interface Row { id: string; name: string; state: string }
const rows: Row[] = [{ id: 'a', name: 'row-a', state: 'one' }, { id: 'b', name: 'row-b', state: 'two' }];
const columns: ColumnDef<Row, any>[] = [{ id: 'name', header: 'Name', accessorKey: 'name', meta: { pinned: true, list: 'primary' } }];
const LONG = 'a-very-long-group-name-that-never-fits-on-one-narrow-row-at-all';

function Routed({ children }: { children: ReactNode }) {
  const [router] = useState(() => createRouter({ routeTree: createRootRoute({ component: () => <>{children}</> }), history: createMemoryHistory({ initialEntries: ['/'] }), origin: 'http://localhost' } as never));
  return <RouterProvider router={router} />;
}
const draw = (node: ReactNode, width: number): Promise<TestTerm> => drawTest(<FocusRoot><Routed>{node}</Routed></FocusRoot>, { width, height: 12 });
const line = (f: string, re: RegExp) => f.split('\n').find((l) => re.test(l)) ?? '';

for (const text of [undefined, 'Some words about this group']) {
  test(`a long group name is cut at its end with one "…"; its count stays whole${text ? ' (its words gone first)' : ''}`, async () => {
    const t = await draw(<DataTable label="Things" data={rows} columns={columns} getRowId={(r) => r.id} groupBy={(r) => r.state}
      groups={[{ id: 'one', label: LONG, countLabel: '17', text }, { id: 'two', label: 'short', text }]} />, 30);
    const f = await t.settle();
    const faults = tableFaults((t.renderer as unknown as { root: never }).root, { cols: 30, rows: 12 });
    t.renderer.destroy();
    const l = line(f, /▾ a-very/);
    expect(l).toMatch(/^▾ a-very-long[^…]*… · 17\s*$/);
    expect(l).not.toContain('Some words');
    // The short group keeps its name whole; its words give way first.
    // The count is set apart by "· ", so it never reads as part of the name.
    expect(line(f, /▾ short/)).toMatch(/^▾ short · \d+/);
    expect(faults).toEqual([]);
  });
}

// Notes: "▾ cedar 0 This computer is stopped." drew a fold mark and a zero on a group that holds nothing.
test('a group drawn only by showEmpty has no fold mark and no count; a group with rows keeps both', async () => {
  const t = await draw(<DataTable label="Things" data={rows} columns={columns} getRowId={(r) => r.id} groupBy={(r) => r.state}
    groups={[{ id: 'one', label: 'atlas' }, { id: 'two', label: 'borealis' }, { id: 'none', label: 'cedar', showEmpty: true, text: 'Stopped' }]} />, 40);
  const f = await t.settle();
  t.renderer.destroy();
  expect(line(f, /atlas/)).toMatch(/^▾ atlas · 1\s*$/);
  expect(line(f, /cedar/)).toMatch(/^\s+cedar Stopped\s*$/);
});

// A hollow group has nothing to open, so it states no open state and a press changes nothing (it said "expanded" and
// Enter flipped that with nothing to see).
test('a group drawn only by showEmpty is a button with no open state; Enter on it changes nothing', async () => {
  const t = await draw(<DataTable label="Things" data={rows} columns={columns} getRowId={(r) => r.id} groupBy={(r) => r.state}
    groups={[{ id: 'one', label: 'atlas' }, { id: 'none', label: 'cedar', showEmpty: true, text: 'Stopped' }]} />, 40);
  try {
    await t.settle();
    const tree = () => semanticsOf(t.renderer as never);
    const cedar = () => queryAllByRole(tree(), 'button', { name: 'cedar' });
    expect(cedar().length).toBe(1);
    expect(cedar()[0]!.states.expanded).toBeUndefined();
    for (let i = 0; i < 12 && focusedNode(tree())?.name !== 'cedar'; i++) { t.mockInput.pressTab(); await t.settle(); }
    expect(focusedNode(tree())?.name).toBe('cedar');
    const before = line(await t.settle(), /cedar/);
    t.mockInput.pressEnter();
    const f = await t.settle();
    expect(cedar()[0]!.states.expanded).toBeUndefined();
    expect(line(f, /cedar/)).toBe(before);
    expect(queryAllByRole(tree(), 'button', { name: 'atlas 1', expanded: true }).length).toBe(1);
  } finally { t.renderer.destroy(); }
});
