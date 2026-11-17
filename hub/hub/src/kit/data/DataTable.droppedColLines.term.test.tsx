// A table row is as tall as its tallest DRAWN cell. A column the table drops for room (its priority) takes its cells'
// lines with it: before, a three-line cell of a column that was drawn once and then dropped kept its row three lines
// tall, with blank lines under the row (Bots at 80 columns, in some runs only: the frame differed between two runs).
import { expect, test } from 'bun:test';
import type { ColumnDef } from '@tanstack/react-table';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { drawTest } from '../../term/prim/testing';
import { Box, FocusRoot, Text } from '../../term/prim';
import { DataTable } from './DataTable';

interface Row { id: string; name: string }
function Routed({ children }: { children: ReactNode }) {
  const [router] = useState(() => createRouter({ routeTree: createRootRoute({ component: () => <>{children}</> }), history: createMemoryHistory({ initialEntries: ['/'] }), origin: 'http://localhost' } as never));
  return <RouterProvider router={router} />;
}
const rows: Row[] = [{ id: 'a', name: 'atlas' }, { id: 'b', name: 'borealis' }, { id: 'c', name: 'cinder' }];
const cols: ColumnDef<Row, any>[] = [
  { id: 'name', header: 'Computer', accessorKey: 'name', meta: { pinned: true } },
  { id: 'state', header: 'State', cell: () => 'Running', meta: { width: '160px', priority: 1 } },
  // Three lines in the first row only; the first column to go when the table has no room.
  { id: 'apps', header: 'Apps', meta: { width: '200px', priority: 4 }, cell: (c) => (c.row.original.id === 'a'
    ? <Box dir="column"><Text>one app</Text><Text>two apps</Text><Text>three apps</Text></Box>
    : <Text>none</Text>) },
];
const lineOf = (frame: string, re: RegExp) => frame.split('\n').findIndex((l) => re.test(l));

test('a dropped column takes its cells\' lines with it: the row is one line again', async () => {
  const t = await drawTest(<FocusRoot><Routed><DataTable label="Things" presentation="table" bare data={rows} columns={cols} getRowId={(r) => r.id} /></Routed></FocusRoot>, { width: 100, height: 16 });
  try {
    await t.settle(); await t.settle();
    let f = t.captureCharFrame();
    // Wide: Apps is drawn and the first row holds its three lines.
    expect(f).toContain('three apps');
    expect(lineOf(f, /borealis/)).toBe(lineOf(f, /atlas/) + 3);
    // Narrow: Apps has no room. Its lines are gone with it.
    t.resize(36, 16);
    await t.settle(); await t.settle();
    f = t.captureCharFrame();
    expect(f).not.toContain('apps');
    expect(lineOf(f, /borealis/)).toBe(lineOf(f, /atlas/) + 1);
    expect(lineOf(f, /cinder/)).toBe(lineOf(f, /atlas/) + 2);
  } finally {
    t.renderer.destroy();
  }
});
