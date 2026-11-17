// The wheel scrolls a list away from a cursor row that is taller than name + one line. The window keeps such a row
// whole in view, so a wheel step that pushes part of it out must take the cursor along; left on the row, the window
// snapped back and every wheel step ended where it began.
import { expect, test } from 'bun:test';
import type { ColumnDef } from '@tanstack/react-table';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { DataTable } from './DataTable';

interface Row { id: string; name: string }
const data: Row[] = Array.from({ length: 12 }, (_, i) => ({ id: `r${i}`, name: `fact-${i}` }));
// Five named fields that wrap: at 44 columns a row is its name and four or more lines of values.
const field = (id: string): ColumnDef<Row, any> => ({ id, header: id, accessorKey: 'name', meta: { listLabel: true, listWraps: true }, cell: (c) => `${c.getValue()} value of ${id}` });
const columns: ColumnDef<Row, any>[] = [
  { id: 'name', header: 'Fact', accessorKey: 'name', meta: { pinned: true, list: 'primary' } },
  ...['Free', 'Small', 'Medium', 'Large', 'Bare'].map(field),
];
function Routed({ children }: { children: ReactNode }) {
  const [router] = useState(() => createRouter({ routeTree: createRootRoute({ component: () => <>{children}</> }), history: createMemoryHistory({ initialEntries: ['/'] }), origin: 'http://localhost' }));
  return <RouterProvider router={router} />;
}

test('wheel up from a tall cursor row at the window bottom scrolls back to the first row', async () => {
  const t = await drawTest(<FocusRoot><Routed><DataTable bare fill={false} label="Facts" data={data} columns={columns} getRowId={(r) => r.id} presentation="cards" onRowAction={false} sortParam={false} noViewMenu /></Routed></FocusRoot>, { width: 44, height: 40 });
  let f = await t.settle();
  const y = f.split('\n').findIndex((l) => l.includes('fact-0'));
  expect(y).toBeGreaterThanOrEqual(0);
  await t.mockMouse.click(4, y);
  await t.settle();
  t.mockInput.pressKey('END');
  f = await t.settle();
  // The last row has the cursor, whole (its name and its last field), and the first row is scrolled out.
  expect(f).toMatch(/▌ fact-11/);
  expect(f).toContain('fact-11 value of Bare');
  expect(f).not.toMatch(/fact-0\s/);
  const rowsOf = (frame: string) => frame.split('\n').filter((l) => /^\s*[▌›]?\s*fact-\d+\s*[█░]?\s*$/.test(l)).length;
  expect(rowsOf(f)).toBeLessThan(data.length);
  const at = f.split('\n').findIndex((l) => l.includes('▌ fact-11'));
  for (let i = 0; i < 30; i++) { await t.mockMouse.scroll(4, at, 'up'); await t.settle(); }
  f = await t.settle();
  expect(f).toMatch(/fact-0\s/);
  expect(f).not.toContain('fact-11');
  t.renderer.destroy();
});
