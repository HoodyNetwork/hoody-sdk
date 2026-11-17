// A rail list row's lead (a state mark) keeps its cells whatever the row's status text: a long status ("2 minutes ago")
// never takes a cell from the lead, so every row's name starts at the same column (the AI tab's chat list).
import { expect, test } from 'bun:test';
import type { ColumnDef } from '@tanstack/react-table';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { drawTest } from '../../term/prim/testing';
import { Box, FocusRoot, Text } from '../../term/prim';
import { DataTable } from './DataTable';
import { ListPaneContext } from '../layouts/pane';

interface Row { id: string; mark: string; title: string; when: string }
const rows: Row[] = [
  { id: 'a', mark: '›', title: 'Deploy the staging site', when: 'last month' },
  { id: 'b', mark: ' ', title: 'Fix the failing checkout tests', when: '2 minutes ago' },
  { id: 'c', mark: ' ', title: 'Review the release notes', when: '3 hours ago' },
];
const columns: ColumnDef<Row, any>[] = [
  { id: 'mark', header: 'State', accessorKey: 'mark', cell: (c) => (c.getValue() === '›' ? <Text>›</Text> : <Box width={1} />), meta: { list: 'lead' } },
  { id: 'title', header: 'Title', accessorKey: 'title', meta: { pinned: true, list: 'primary' } },
  { id: 'when', header: 'When', accessorKey: 'when', meta: { list: 'status' } },
];

function Routed({ children }: { children: ReactNode }) {
  const [router] = useState(() => createRouter({ routeTree: createRootRoute({ component: () => <>{children}</> }), history: createMemoryHistory({ initialEntries: ['/'] }), origin: 'http://localhost' } as never));
  return <RouterProvider router={router} />;
}

test('every row name starts at one column, long status or not, at any rail width', async () => {
  for (const w of [26, 30, 34, 40, 48]) {
    const t = await drawTest(
      <FocusRoot><Routed><Box width={w} height={12} dir="column">
        <ListPaneContext.Provider value={{ presentation: 'list', rail: true, flush: true }}>
          <DataTable label="Chats" data={rows} columns={columns} getRowId={(r) => r.id} />
        </ListPaneContext.Provider>
      </Box></Routed></FocusRoot>, { width: w, height: 12 });
    const f = await t.settle();
    const at = (s: string) => f.split('\n').find((l) => l.includes(s.slice(0, 6)))!.indexOf(s.slice(0, 6));
    const starts = rows.map((r) => at(r.title));
    expect({ w, ok: starts.every((x) => x > 0) && new Set(starts).size === 1, starts }).toMatchObject({ w, ok: true });
    t.renderer.destroy();
  }
});
